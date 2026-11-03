"""Utilidades de precio y orquestador de klines + volumen 24h.

Reune el conversor de timeframe, el quote en vivo de Yahoo, el ultimo precio
como fallback y la funcion que obtiene velas + volumen sin calcular
indicadores (eso lo hace build_payload).
"""

import logging

import requests

from services.data_fetchers.coinbase_client import (
    coinbase_product_id, COINBASE_BASE, COINBASE_HEADERS,
)
from services.data_fetchers.yahoo import fetch_yahoo_chart
from services.data_fetchers.coinbase_klines import fetch_coinbase_klines
from services.data_fetchers.binance import fetch_klines, fetch_quote_volume_24h

logger = logging.getLogger(__name__)


# CONVIERTE UN TIMEFRAME ('15m', '4h', ...) A SEGUNDOS
def interval_seconds(interval_str):
    unit = interval_str[-1].lower()
    value = int(interval_str[:-1] or 1)
    mult = {'m': 60, 'h': 3600, 'd': 86400, 'w': 604800}.get(unit, 900)
    return value * mult


# DEVUELVE EL PRECIO EN VIVO de Yahoo (meta.regularMarketPrice), equivalente al
# ticker de Coinbase en crypto: es el quote mas fresco que expone Yahoo sin WS.
# Usa el chart 1d de un solo dia para que la respuesta sea minima.
def fetch_yahoo_meta_price(symbol):
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol
    params = {'interval': '1d', 'range': '1d'}
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'}
    resp = requests.get(url, params=params, headers=headers, timeout=8)
    resp.raise_for_status()
    meta = resp.json()['chart']['result'][0]['meta']
    price = meta.get('regularMarketPrice')
    return float(price) if price is not None else None


# OBTIENE EL ULTIMO PRECIO DISPONIBLE COMO FALLBACK SI FALLAN LAS KLINES
def fetch_last_price(symbol, market, provider='coinbase'):
    if market == 'stock':
        # Primero el quote en vivo (regularMarketPrice); si falla, el cierre
        # de la ultima vela diaria.
        try:
            live = fetch_yahoo_meta_price(symbol)
            if live and live > 0:
                return live
        except Exception as e:
            logger.warning(f"[TradingData] Yahoo meta price fallo para {symbol}: {e}")
        bars = fetch_yahoo_chart(symbol, '1d')
        if bars:
            return float(bars[-1][4])
        raise ValueError(f'Yahoo Finance sin datos para {symbol}')
    if provider == 'coinbase':
        product = coinbase_product_id(symbol)
        r = requests.get(
            f'{COINBASE_BASE}/products/{product}/ticker',
            headers=COINBASE_HEADERS, timeout=8,
        )
        r.raise_for_status()
        return float(r.json()['price'])
    if provider == 'binance':
        url = 'https://data-api.binance.vision/api/v3/ticker/price'
        resp = requests.get(url, params={'symbol': symbol}, timeout=8)
        resp.raise_for_status()
        return float(resp.json()['price'])
    raise ValueError(f"Proveedor no soportado para precio crypto: {provider}")


# OBTIENE KLINES DEL PROVEEDOR SELECCIONADO + VOLUMEN 24h.
# NO calcula indicadores (build_payload hace eso). Separada para que el hilo
# de streaming de Binance re-seedee sus velas sin duplicar logica.
def fetch_klines_and_volume(symbol, interval_str, market, provider='coinbase'):
    if market == 'stock':
        provider = 'yahoo'
        klines = fetch_yahoo_chart(symbol, interval_str)
    elif provider == 'coinbase':
        klines = fetch_coinbase_klines(symbol, interval_str)
    elif provider == 'binance':
        # Binance permite hasta 1000 velas por llamada. Se pide una pagina
        # adicional mas antigua para que EMA(200)/MACD/ADX converjan.
        klines = fetch_klines(symbol, interval=interval_str, limit=1000)
        if klines and len(klines) >= 1000:
            try:
                older = fetch_klines(
                    symbol,
                    interval=interval_str,
                    limit=1000,
                    end_time=int(klines[0][0]) - 1,
                )
                if older:
                    klines = older + klines
            except Exception as e:
                logger.warning(f"[TradingData] pagina extra Binance fallo para {symbol}: {e}")
    else:
        raise ValueError(f"Proveedor no soportado: {provider}")

    if not klines:
        raise ValueError(f"{provider} no devolvio velas para {symbol}")

    vol_24h = None
    secs = interval_seconds(interval_str)
    # Si el ticker falla, se calcula el volumen con las velas del mismo
    # proveedor. Stocks suman las velas de Yahoo de las ultimas 24h.
    try:
        if market == 'crypto' and klines:
            try:
                vol_24h = fetch_quote_volume_24h(symbol, provider)
            except Exception as e:
                logger.warning(f"[TradingData] ticker 24h fallo para {symbol}: {e}")
        if vol_24h is None:
            if market == 'stock' and klines:
                end_ts = int(klines[-1][0])
                vol_24h = sum(float(k[5]) for k in klines if end_ts - int(k[0]) <= 86400000)
            elif klines:
                bars_24h = max(1, min(len(klines), 86400 // secs))
                vol_24h = sum(float(k[7]) for k in klines[-bars_24h:])
    except Exception as e:
        logger.warning(f"[TradingData] volumen 24h fallo para {symbol}: {e}")

    return klines, vol_24h
