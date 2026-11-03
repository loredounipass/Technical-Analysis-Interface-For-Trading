"""Libro de ordenes real aislado por proveedor."""

import time
import logging
import threading

import requests

from services.data_fetchers.coinbase_client import (
    coinbase_product_id, COINBASE_ADV_BASE, COINBASE_HEADERS,
)

logger = logging.getLogger(__name__)


# LIBRO DE ÓRDENES REAL (Binance depth). El endpoint devuelve hasta 100 niveles
# de bids/asks; se suman los 20 primeros niveles de cada lado para calcular la
# dominancia compradora real. Tiene sub-cache propia: el depth pesa 5 weight y
# los ciclos de streaming lo consultan muy seguido.
DEPTH_TTL = 12
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
                params={'product_id': product, 'limit': 50},
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
                params={'symbol': symbol, 'limit': 100},
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
