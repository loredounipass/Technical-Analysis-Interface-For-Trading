"""Libro de ordenes real (Coinbase Advanced Trade, fallback Binance depth)."""

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


def fetch_order_book_depth(symbol):
    """Devuelve el libro de órdenes real:
    {'bids': [[price, qty], ...], 'asks': [[price, qty], ...]}.
    Fuente primaria: Coinbase Advanced Trade (público, limit configurable).
    Fallback: Binance depth. None si ambos fallan (proxy de volumen)."""
    now = time.time()
    with _depth_lock:
        cached = _depth_cache.get(symbol)
        if cached and now - cached[0] <= DEPTH_TTL:
            return cached[1]
    data = None
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
    # Orden explicito y defensivo: el contrato de Coinbase Advanced Trade
    # product_book NO garantiza el orden de bids/asks, y aguas abajo
    # (payload_builder best_bid/best_ask + LiquidityBubbleMap groupLevels)
    # se asume bids DESC / asks ASC. Ordenar aqui elimina el bug latente de
    # tomar bids[0]/asks[0] como mejor nivel cuando el origen viene barajado.
    bids = sorted(data.get('bids') or [], key=lambda lv: float(lv[0]), reverse=True)
    asks = sorted(data.get('asks') or [], key=lambda lv: float(lv[0]))
    data = {'bids': bids, 'asks': asks}
    with _depth_lock:
        _depth_cache[symbol] = (time.time(), data)
    return data
