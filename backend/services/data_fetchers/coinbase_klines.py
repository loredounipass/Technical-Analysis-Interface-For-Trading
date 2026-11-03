"""Velas OHLCV paginadas de Coinbase normalizadas al formato kline de Binance."""

import time

import requests

from services.data_fetchers.coinbase_client import (
    coinbase_product_id, COINBASE_BASE, COINBASE_HEADERS,
    COINBASE_GRANULARITY, COINBASE_PAGE,
)


def fetch_coinbase_klines(symbol, interval_str='15m'):
    """Velas paginadas de Coinbase convertidas al formato kline de Binance
    ([ts_ms, open, high, low, close, vol_base, close_time, quote_vol, ...]),
    para que el resto del pipeline no cambie."""
    product = coinbase_product_id(symbol)
    gran = COINBASE_GRANULARITY.get(interval_str, 900)
    # ~2000 velas (igual que la paginacion Binance) para que EMA(200)/MACD/ADX converjan
    pages = 7
    end = int(time.time())
    seen = set()
    candles = []
    for _ in range(pages):
        start = end - COINBASE_PAGE * gran
        resp = requests.get(
            f'{COINBASE_BASE}/products/{product}/candles',
            params={'granularity': gran, 'start': start, 'end': end},
            headers=COINBASE_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        rows = resp.json()
        if not isinstance(rows, list) or not rows:
            break
        oldest = None
        for row in rows:
            # Coinbase: [time(s), low, high, open, close, volume_base], mas nuevo primero
            ts = int(row[0])
            if ts in seen:
                continue
            seen.add(ts)
            candles.append(row)
            if oldest is None or ts < oldest:
                oldest = ts
        if oldest is None:
            break
        end = oldest  # la siguiente pagina termina donde empieza esta
    if not candles:
        raise ValueError(f'Coinbase devolvio 0 velas para {product}')
    candles.sort(key=lambda r: r[0])
    klines = []
    for ts, low, high, open_, close, vol in candles:
        ts_ms = int(ts) * 1000
        close_f = float(close)
        vol_f = float(vol)
        klines.append([
            ts_ms, str(open_), str(high), str(low), str(close), str(vol),
            ts_ms + gran * 1000, str(vol_f * close_f), 0, '0', '0', '0',
        ])
    return klines
