"""Velas OHLCV paginadas de Coinbase normalizadas al formato kline de Binance."""

import time

import requests

from services.data_fetchers.coinbase_client import (
    coinbase_product_id, COINBASE_BASE, COINBASE_HEADERS,
    COINBASE_GRANULARITY, COINBASE_AGGREGATION, COINBASE_PAGE,
)


def _resolve_granularity(interval_str):
    """Devuelve (granularidad_base, factor, granularidad_objetivo) en segundos.

    Timeframe nativo -> factor 1. Timeframe agregable (4h, 1w, ...) -> se traen
    velas de la granularidad base y se resamplean. Timeframe desconocido -> error
    explicito, NUNCA un fallback silencioso que etiquete 15m como otra cosa.
    """
    if interval_str in COINBASE_GRANULARITY:
        gran = COINBASE_GRANULARITY[interval_str]
        return gran, 1, gran
    agg = COINBASE_AGGREGATION.get(interval_str)
    if agg:
        base, factor = agg
        return base, factor, base * factor
    raise ValueError(f'Coinbase no soporta el timeframe {interval_str!r}')


def _resample(candles, base_gran, factor):
    """Agrupa velas base [ts, low, high, open, close, vol] en buckets de
    base_gran*factor alineados al epoch (fronteras UTC). El ultimo bucket puede
    estar incompleto: es la vela en formacion, igual que en el modo nativo."""
    if factor <= 1:
        return candles
    target = base_gran * factor
    buckets = {}
    for ts, low, high, open_, close, vol in candles:
        key = (int(ts) // target) * target
        h, l, o, c, v = float(high), float(low), float(open_), float(close), float(vol)
        b = buckets.get(key)
        if b is None:
            # [open, high, low, close, vol]
            buckets[key] = [o, h, l, c, v]
        else:
            b[1] = max(b[1], h)
            b[2] = min(b[2], l)
            b[3] = c
            b[4] += v
    out = []
    for key in sorted(buckets):
        o, h, l, c, v = buckets[key]
        out.append([key, l, h, o, c, v])
    return out


def fetch_coinbase_klines(symbol, interval_str='15m'):
    """Velas paginadas de Coinbase convertidas al formato kline de Binance
    ([ts_ms, open, high, low, close, vol_base, close_time, quote_vol, ...]),
    para que el resto del pipeline no cambie."""
    product = coinbase_product_id(symbol)
    base_gran, factor, gran = _resolve_granularity(interval_str)
    # ~2000 velas base (igual que la paginacion Binance) para que EMA(200)/MACD/ADX
    # converjan; al resamplear quedan ~2000/factor velas del timeframe objetivo.
    pages = 7
    end = int(time.time())
    seen = set()
    candles = []
    for _ in range(pages):
        start = end - COINBASE_PAGE * base_gran
        resp = requests.get(
            f'{COINBASE_BASE}/products/{product}/candles',
            params={'granularity': base_gran, 'start': start, 'end': end},
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
    candles = _resample(candles, base_gran, factor)
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
