"""Binance: klines crudas y volumen 24h (ticker) con sub-cache propia."""

import time
import logging
import threading

import requests

from services.data_fetchers.coinbase_client import (
    coinbase_product_id, COINBASE_BASE, COINBASE_HEADERS,
)

logger = logging.getLogger(__name__)


# REALIZA UNA PETICION A LA API DE BINANCE PARA OBTENER KLINES (OHLCV)
# data-api.binance.vision es el endpoint publico de market data y NO esta
# bloqueado geograficamente (api.binance.com da 403 desde IPs de EE.UU.,
# por lo que en Render/Railway/Fly fallaba)
def fetch_klines(symbol, interval='15m', limit=100, end_time=None):
    url = 'https://data-api.binance.vision/api/v3/klines'
    params = {'symbol': symbol, 'interval': interval, 'limit': limit}
    if end_time:
        params['endTime'] = end_time
    attempts = 3
    for attempt in range(attempts):
        try:
            resp = requests.get(url, params=params, timeout=8)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            if attempt < attempts - 1:
                time.sleep(0.5 * (attempt + 1))
                continue
            raise


# Cache independiente por proveedor para el volumen 24h.
TICKER_TTL = 120
_ticker_cache = {}
_ticker_lock = threading.Lock()


def fetch_quote_volume_24h(symbol, provider='coinbase'):
    now = time.time()
    cache_key = (provider, symbol)
    with _ticker_lock:
        cached = _ticker_cache.get(cache_key)
        if cached and now - cached[0] <= TICKER_TTL:
            return cached[1]
    if provider == 'coinbase':
        product = coinbase_product_id(symbol)
        resp = requests.get(
            f'{COINBASE_BASE}/products/{product}/ticker',
            headers=COINBASE_HEADERS, timeout=8,
        )
        resp.raise_for_status()
        td = resp.json()
        quote_volume = float(td['volume']) * float(td['price'])
    elif provider == 'binance':
        resp = requests.get(
            'https://data-api.binance.vision/api/v3/ticker/24hr',
            params={'symbol': symbol},
            timeout=8,
        )
        resp.raise_for_status()
        quote_volume = float(resp.json()['quoteVolume'])
    else:
        raise ValueError(f"Proveedor no soportado para volumen crypto: {provider}")
    with _ticker_lock:
        _ticker_cache[cache_key] = (time.time(), quote_volume)
    return quote_volume


def update_ticker_cache(symbol, quote_volume, provider='coinbase'):
    """Permite a los streams actualizar el volumen de su proveedor."""
    with _ticker_lock:
        _ticker_cache[(provider, symbol)] = (time.time(), float(quote_volume))
