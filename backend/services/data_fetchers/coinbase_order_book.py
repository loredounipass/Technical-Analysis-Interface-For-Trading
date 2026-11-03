"""Libro de ordenes real aislado por proveedor."""

import time
import logging
import threading

import requests

from services.data_fetchers.coinbase_client import (
    coinbase_product_id, COINBASE_ADV_BASE, COINBASE_HEADERS,
)

logger = logging.getLogger(__name__)


# LIBRO DE ÓRDENES REAL, por proveedor: Coinbase Advanced Trade o Binance depth.
# Tiene sub-cache propia keyed por (provider, symbol): el depth se consulta en
# cada ciclo de streaming y pesa en el rate-limit del exchange.
#
# Los limites se eligieron MIDIENDO el exchange real (cabecera
# X-MBX-USED-WEIGHT-1M de Binance, latencia y cobertura del libro):
#   Binance  limit=500 -> peso 30 por peticion (limit=100 pesa 5, limit=1000
#            pesa 80, limit=5000 pesa 330), misma latencia ~2.2 s, y 500 niveles
#            por lado cubren con holgura la banda de +/-0.05% que usa
#            compute_liquidity (227 niveles/lado en BTCUSDT, 89 en ETHUSDT).
#            Con limit=100 la banda quedaba SATURADA: los 100 niveles solo
#            alcanzaban 0.035% del precio, asi que 0.05% y 0.50% daban igual.
#   Coinbase limit=200 -> 400 niveles, cubre 1.09% del precio, ~1.0 s.
# Peor caso (8 criptos activos, TTL 12 s) son ~1200 peso/min de los 6000.
DEPTH_TTL = 12
DEPTH_LIMIT = {'binance': 500, 'coinbase': 200}
_depth_cache = {}
_depth_lock = threading.Lock()


def fetch_order_book_depth(symbol, provider='coinbase'):
    """Devuelve el libro de órdenes real:
    {'bids': [[price, qty], ...], 'asks': [[price, qty], ...]}.
    Coinbase Advanced Trade o Binance depth, según el proveedor elegido."""
    if provider not in ('coinbase', 'binance'):
        raise ValueError(f"Proveedor no soportado para order book: {provider}")
    now = time.time()
    cache_key = (provider, symbol)
    with _depth_lock:
        cached = _depth_cache.get(cache_key)
        if cached and now - cached[0] <= DEPTH_TTL:
            return cached[1]
    data = None
    if provider == 'coinbase':
        try:
            product = coinbase_product_id(symbol)
            resp = requests.get(
                f'{COINBASE_ADV_BASE}/product_book',
                params={'product_id': product, 'limit': DEPTH_LIMIT['coinbase']},
                headers=COINBASE_HEADERS,
                timeout=10,
            )
            resp.raise_for_status()
            book = resp.json().get('pricebook', {})
            bids = [[b['price'], b['size']] for b in book.get('bids', [])]
            asks = [[a['price'], a['size']] for a in book.get('asks', [])]
            if bids and asks:
                data = {'bids': bids, 'asks': asks}
        except Exception as e:
            logger.warning(f"[TradingData] Coinbase book fallo para {symbol}: {e}")
        if data is None:
            return None
    else:
        try:
            resp = requests.get(
                'https://data-api.binance.vision/api/v3/depth',
                params={'symbol': symbol, 'limit': DEPTH_LIMIT['binance']},
                timeout=8,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.warning(f"[TradingData] Binance depth fallo para {symbol}: {e}")
            return None
    # Coinbase product_book no garantiza el orden de bids/asks.
    bids = sorted(data.get('bids') or [], key=lambda lv: float(lv[0]), reverse=True)
    asks = sorted(data.get('asks') or [], key=lambda lv: float(lv[0]))
    data = {'bids': bids, 'asks': asks}
    with _depth_lock:
        _depth_cache[cache_key] = (time.time(), data)
    return data


def order_book_age(symbol, provider='coinbase'):
    """Segundos que tiene el libro que esta sirviendo la cache (None si no se
    ha pedido nunca). Se expone en el payload para que ni el panel ni el modelo
    presenten como instantaneo un snapshot que se renueva cada DEPTH_TTL."""
    with _depth_lock:
        entry = _depth_cache.get((provider, symbol))
    if not entry:
        return None
    return max(0.0, round(time.time() - entry[0], 1))
