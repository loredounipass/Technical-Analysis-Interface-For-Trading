"""Order flow: cache rolling de trades ejecutados de Coinbase (tape real)."""

import time
import math
import logging
import threading
from datetime import datetime, timezone

import requests

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


def record_order_flow_trade(symbol, trade):
    """Agrega un trade real del WebSocket sin duplicar `last_match`."""
    normalized = _normalize_order_flow_trade(trade)
    if normalized is None:
        return False
    with _order_flow_lock:
        entry = _order_flow_cache.setdefault(symbol, {
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


def get_order_flow_trades(symbol, limit=200):
    """Devuelve trades reales ordenados; siembra por REST y actualiza por WS."""
    now = time.time()
    with _order_flow_lock:
        cached = _order_flow_cache.get(symbol)
        is_stale = (
            not cached or not cached.get('seeded')
            or now - cached['updated'] > ORDER_FLOW_TTL
        )

    if is_stale:
        try:
            product = coinbase_product_id(symbol)
            resp = requests.get(
                f'{COINBASE_BASE}/products/{product}/trades',
                params={'limit': 500},
                headers=COINBASE_HEADERS,
                timeout=10,
            )
            resp.raise_for_status()
            rows = resp.json()
            normalized = [
                trade for trade in (_normalize_order_flow_trade(row) for row in rows)
                if trade is not None
            ] if isinstance(rows, list) else []
            with _order_flow_lock:
                existing = _order_flow_cache.get(symbol, {}).get('trades', [])
                merged = {trade['id']: trade for trade in existing}
                merged.update({trade['id']: trade for trade in normalized})
                trades = sorted(
                    merged.values(), key=lambda trade: (trade['time'], trade['id'])
                )[-ORDER_FLOW_CACHE_SIZE:]
                _order_flow_cache[symbol] = {
                    'trades': trades,
                    'ids': {trade['id'] for trade in trades},
                    'updated': time.time(),
                    'seeded': True,
                }
        except Exception as e:
            logger.warning(f"[TradingData] order flow fallo para {symbol}: {e}")

    with _order_flow_lock:
        entry = _order_flow_cache.get(symbol)
        return list(entry['trades'][-limit:]) if entry else []
