"""Order flow: tape real de trades ejecutados, aislado por proveedor.

El archivo conserva el nombre historico, pero el tape vive indexado por
(provider, symbol): Coinbase invierte el lado del maker y Binance usa
isBuyerMaker, asi el delta de un exchange nunca se contamina con el otro.
"""

import time
import math
import logging
import threading
from datetime import datetime, timezone

import requests

from common import market_store
from services.data_fetchers.coinbase_client import (
    coinbase_product_id, COINBASE_BASE, COINBASE_HEADERS,
)

logger = logging.getLogger(__name__)


# ORDER FLOW: cache rolling de trades ejecutados. Coinbase reporta `side`
# como el lado del MAKER; se invierte para obtener el lado del agresor.
ORDER_FLOW_TTL = 15
ORDER_FLOW_CACHE_SIZE = 1000
_order_flow_cache = {}
_order_flow_lock = threading.Lock()


def _normalize_order_flow_trade(trade):
    try:
        price = float(trade['price'])
        size = float(trade['size'])
        maker_side = str(trade['side']).lower()
        if (
            not math.isfinite(price) or not math.isfinite(size)
            or price <= 0 or size <= 0 or maker_side not in ('buy', 'sell')
        ):
            return None
        raw_time = trade.get('time')
        if isinstance(raw_time, (int, float)):
            time_ms = int(raw_time * 1000 if raw_time < 1e12 else raw_time)
        else:
            time_text = str(raw_time or '')
            if time_text.endswith('Z'):
                time_text = time_text[:-1] + '+00:00'
            parsed = datetime.fromisoformat(time_text)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            time_ms = int(parsed.timestamp() * 1000)
        trade_id = str(trade.get('trade_id') or f'{time_ms}-{price}-{size}-{maker_side}')
        return {
            'id': trade_id,
            'time': time_ms,
            'side': 'sell' if maker_side == 'buy' else 'buy',
            'makerSide': maker_side,
            'price': price,
            'size': size,
        }
    except (KeyError, TypeError, ValueError, OverflowError):
        return None


def _normalize_binance_trade(trade):
    normalized = _normalize_order_flow_trade({
        'price': trade.get('price', trade.get('p')),
        'size': trade.get('qty', trade.get('q')),
        'side': 'buy' if trade.get('isBuyerMaker', trade.get('m')) else 'sell',
        'time': trade.get('time', trade.get('T')),
        'trade_id': trade.get('id', trade.get('t')),
    })
    return normalized


def record_order_flow_trade(symbol, trade, provider='coinbase'):
    """Agrega un trade real del WebSocket sin duplicar `last_match`.

    Con Redis activo el tape vive en una Redis Stream compartida (el feeder es
    el unico escritor), de modo que la API y el agente ven el mismo tape sin
    depender de la memoria del proceso que recibe el WebSocket.
    """
    if provider == 'coinbase':
        normalized = _normalize_order_flow_trade(trade)
    elif provider == 'binance':
        normalized = _normalize_binance_trade(trade)
    else:
        raise ValueError(f"Proveedor no soportado para order flow: {provider}")
    if normalized is None:
        return False
    if market_store.redis_active():
        return market_store.tape_append(provider, symbol, [normalized])
    cache_key = (provider, symbol)
    with _order_flow_lock:
        entry = _order_flow_cache.setdefault(cache_key, {
            'trades': [], 'ids': set(), 'updated': time.time(), 'seeded': False,
        })
        if normalized['id'] in entry['ids']:
            return False
        entry['trades'].append(normalized)
        entry['ids'].add(normalized['id'])
        if len(entry['trades']) > ORDER_FLOW_CACHE_SIZE:
            removed = entry['trades'].pop(0)
            entry['ids'].discard(removed['id'])
        entry['updated'] = time.time()
    return True


def _fetch_recent_trades_rest(symbol, provider):
    """Seed REST de los ultimos trades ejecutados, normalizados (agresor)."""
    try:
        if provider == 'coinbase':
            product = coinbase_product_id(symbol)
            resp = requests.get(
                f'{COINBASE_BASE}/products/{product}/trades',
                params={'limit': 500},
                headers=COINBASE_HEADERS,
                timeout=10,
            )
        else:
            resp = requests.get(
                'https://data-api.binance.vision/api/v3/trades',
                params={'symbol': symbol, 'limit': 500},
                timeout=10,
            )
        resp.raise_for_status()
        rows = resp.json()
        normalizer = (
            _normalize_order_flow_trade
            if provider == 'coinbase'
            else _normalize_binance_trade
        )
        if not isinstance(rows, list):
            return []
        return [trade for trade in map(normalizer, rows) if trade is not None]
    except Exception as e:
        logger.warning(f"[TradingData] seed REST de order flow {provider} fallo para {symbol}: {e}")
        return []


def get_order_flow_trades(symbol, limit=200, provider='coinbase'):
    """Devuelve trades reales ordenados; siembra por REST y actualiza por WS.

    En modo Redis el tape es una Redis Stream compartida: se lee de alli y el
    seed REST solo se dispara cuando esta vacio o vencido, deduplicando por id
    para no sesgar el delta con trades repetidos.
    """
    if provider not in ('coinbase', 'binance'):
        raise ValueError(f"Proveedor no soportado para order flow: {provider}")
    now = time.time()

    if market_store.redis_active():
        tape = market_store.tape_read(provider, symbol, limit=ORDER_FLOW_CACHE_SIZE)
        # trade['time'] viene en milisegundos epoch.
        last_ms = max((trade['time'] for trade in tape), default=0)
        if tape and (now * 1000 - last_ms) <= ORDER_FLOW_TTL * 1000:
            return tape[-limit:]
        known = {trade['id'] for trade in tape}
        fresh = [
            trade for trade in _fetch_recent_trades_rest(symbol, provider)
            if trade['id'] not in known
        ]
        if fresh:
            market_store.tape_append(provider, symbol, fresh)
        return market_store.tape_read(provider, symbol, limit=limit)

    cache_key = (provider, symbol)
    with _order_flow_lock:
        cached = _order_flow_cache.get(cache_key)
        is_stale = (
            not cached or not cached.get('seeded')
            or now - cached['updated'] > ORDER_FLOW_TTL
        )

    if is_stale:
        normalized = _fetch_recent_trades_rest(symbol, provider)
        if normalized:
            with _order_flow_lock:
                existing = _order_flow_cache.get(cache_key, {}).get('trades', [])
                merged = {trade['id']: trade for trade in existing}
                merged.update({trade['id']: trade for trade in normalized})
                trades = sorted(
                    merged.values(), key=lambda trade: (trade['time'], trade['id'])
                )[-ORDER_FLOW_CACHE_SIZE:]
                _order_flow_cache[cache_key] = {
                    'trades': trades,
                    'ids': {trade['id'] for trade in trades},
                    'updated': time.time(),
                    'seeded': True,
                }

    with _order_flow_lock:
        entry = _order_flow_cache.get(cache_key)
        return list(entry['trades'][-limit:]) if entry else []
