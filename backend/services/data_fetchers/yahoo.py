"""Yahoo Finance: velas OHLCV para stocks (gratis, sin API key)."""

import requests


# OBTIENE VELAS OHLCV DE STOCKS DESDE YAHOO FINANCE (gratis, sin API key).
# Devuelve el mismo formato que las klines de Binance:
#   [timestamp_ms, open, high, low, close, volume, close, quote_volume]
# Yahoo no tiene intervalo de 4h: se piden velas de 1h y se agrupan de a 4.
def fetch_yahoo_chart(symbol, interval_str='15m'):
    mapping = {
        '1m': ('1m', '7d'),
        '5m': ('5m', '1mo'),
        '15m': ('15m', '1mo'),
        '1h': ('1h', '6mo'),
        '6h': ('1h', '1y'),
        '4h': ('1h', '1y'),
        '1d': ('1d', '5y'),
    }
    y_interval, y_range = mapping.get(interval_str, ('15m', '1mo'))
    url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol
    params = {'interval': y_interval, 'range': y_range, 'includePrePost': 'false'}
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'}
    resp = requests.get(url, params=params, headers=headers, timeout=10)
    resp.raise_for_status()
    payload = resp.json()
    result = payload['chart']['result'][0]
    timestamps = result.get('timestamp') or []
    quote = result['indicators']['quote'][0]
    opens = quote.get('open') or []
    highs = quote.get('high') or []
    lows = quote.get('low') or []
    closes = quote.get('close') or []
    volumes = quote.get('volume') or []

    bars = []
    for i in range(len(timestamps)):
        if closes[i] is None:
            continue
        ts = int(timestamps[i] * 1000)
        open_ = float(opens[i]) if opens[i] is not None else float(closes[i])
        high = float(highs[i]) if highs[i] is not None else float(closes[i])
        low = float(lows[i]) if lows[i] is not None else float(closes[i])
        close = float(closes[i])
        volume = float(volumes[i]) if volumes[i] is not None else 0.0
        # k[5] = volumen en ACCIONES (crudo de Yahoo). k[7] = volumen en
        # DOLARES = acciones x cierre, para que el pipeline (que lee k[7] como
        # "quote volume" tipo USDT) muestre la cifra monetaria correcta. Antes
        # k[7] se ponía igual a las acciones y el "$" de las stocks salía mal.
        bars.append([ts, open_, high, low, close, volume, close, volume * close])

    if interval_str in ('6h', '4h') and len(bars) > 1:
        chunk_size = 6 if interval_str == '6h' else 4
        grouped = []
        # Agrupar de a 6 (o 4 para fallback), incluyendo el remainder parcial al final
        for i in range(0, len(bars), chunk_size):
            chunk = bars[i:i + chunk_size]
            grouped.append([
                chunk[0][0],
                chunk[0][1],
                max(b[2] for b in chunk),
                min(b[3] for b in chunk),
                chunk[-1][4],
                sum(b[5] for b in chunk),
                chunk[-1][4],
                sum(b[7] for b in chunk),
            ])
        bars = grouped

    if not bars:
        raise ValueError(f'Yahoo Finance sin datos para {symbol}')
    return bars
