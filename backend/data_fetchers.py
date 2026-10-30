"""Data fetchers: funciones que obtienen datos de mercado desde APIs externas.

Binance (klines REST, ticker 24h) y Yahoo Finance (charts OHLCV).
Funciones puras de I/O: no tocan cache, no dependen de Flask.
"""

import time
import logging
import requests

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────
# BINANCE
# ─────────────────────────────────────────────────────────────────────

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


# VOLUMEN 24H EXACTO AL DE BINANCE (quoteVolume del ticker oficial), con
# sub-cache propia: el ticker pesa 40 weight y el volumen cambia lento.
# Sub-cache del volumen 24h (ticker de Binance pesa 40 weight): el volumen
# cambia lento y no necesita refrescarse con cada ciclo de indicadores.
import threading

TICKER_TTL = 120
_ticker_cache = {}
_ticker_lock = threading.Lock()


def fetch_quote_volume_24h(symbol):
    now = time.time()
    with _ticker_lock:
        cached = _ticker_cache.get(symbol)
        if cached and now - cached[0] <= TICKER_TTL:
            return cached[1]
    resp = requests.get(
        'https://data-api.binance.vision/api/v3/ticker/24hr',
        params={'symbol': symbol},
        timeout=8,
    )
    resp.raise_for_status()
    quote_volume = float(resp.json()['quoteVolume'])
    with _ticker_lock:
        _ticker_cache[symbol] = (time.time(), quote_volume)
    return quote_volume


def update_ticker_cache(symbol, quote_volume):
    """Permite al stream de Binance actualizar el sub-cache del ticker."""
    with _ticker_lock:
        _ticker_cache[symbol] = (time.time(), float(quote_volume))


# LIBRO DE ÓRDENES REAL (Binance depth). El endpoint devuelve hasta 100 niveles
# de bids/asks; se suman los 20 primeros niveles de cada lado para calcular la
# dominancia compradora real. Tiene sub-cache propia: el depth pesa 5 weight y
# los ciclos de streaming lo consultan muy seguido.
DEPTH_TTL = 12
_depth_cache = {}
_depth_lock = threading.Lock()


def fetch_order_book_depth(symbol):
    """Devuelve el libro de órdenes real de Binance:
    {'bids': [[price, qty], ...], 'asks': [[price, qty], ...]}.
    None si falla (el payload cae al proxy de volumen de velas)."""
    now = time.time()
    with _depth_lock:
        cached = _depth_cache.get(symbol)
        if cached and now - cached[0] <= DEPTH_TTL:
            return cached[1]
    resp = requests.get(
        'https://data-api.binance.vision/api/v3/depth',
        params={'symbol': symbol, 'limit': 100},
        timeout=8,
    )
    resp.raise_for_status()
    data = resp.json()
    with _depth_lock:
        _depth_cache[symbol] = (time.time(), data)
    return data


# ─────────────────────────────────────────────────────────────────────
# YAHOO FINANCE
# ─────────────────────────────────────────────────────────────────────

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
        bars.append([ts, open_, high, low, close, volume, close, volume])

    if interval_str == '4h' and len(bars) > 1:
        grouped = []
        # Agrupar de a 4, incluyendo el remainder parcial al final
        for i in range(0, len(bars), 4):
            chunk = bars[i:i + 4]
            grouped.append([
                chunk[0][0],
                chunk[0][1],
                max(b[2] for b in chunk),
                min(b[3] for b in chunk),
                chunk[-1][4],
                sum(b[5] for b in chunk),
                chunk[-1][4],
                sum(b[5] for b in chunk),
            ])
        bars = grouped

    if not bars:
        raise ValueError(f'Yahoo Finance sin datos para {symbol}')
    return bars


# ─────────────────────────────────────────────────────────────────────
# UTILIDADES
# ─────────────────────────────────────────────────────────────────────

# CONVIERTE UN TIMEFRAME ('15m', '4h', ...) A SEGUNDOS
def interval_seconds(interval_str):
    unit = interval_str[-1].lower()
    value = int(interval_str[:-1] or 1)
    mult = {'m': 60, 'h': 3600, 'd': 86400, 'w': 604800}.get(unit, 900)
    return value * mult


# OBTIENE EL ULTIMO PRECIO DISPONIBLE COMO FALLBACK SI FALLAN LAS KLINES
def fetch_last_price(symbol, market):
    if market == 'stock':
        bars = fetch_yahoo_chart(symbol, '1d')
        if bars:
            return float(bars[-1][4])
        raise ValueError(f'Yahoo Finance sin datos para {symbol}')
    url = 'https://data-api.binance.vision/api/v3/ticker/price'
    resp = requests.get(url, params={'symbol': symbol}, timeout=8)
    resp.raise_for_status()
    return float(resp.json()['price'])


# OBTIENE KLINES DE MERCADO (BINANCE/YAHOO) + VOLUMEN 24H EXACTO.
# NO calcula indicadores (build_payload hace eso). Separada para que el hilo
# de streaming de Binance re-seedee sus velas sin duplicar logica.
def fetch_klines_and_volume(symbol, interval_str, market):
    klines = None
    try:
        if market == 'stock':
            klines = fetch_yahoo_chart(symbol, interval_str)
        else:
            # Binance permite hasta 1000 velas por llamada. Se pide una pagina
            # adicional mas antigua (2000 total) para que EMA(200)/MACD/ADX
            # converjan a los mismos valores que TradingView/Binance.
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
                    logger.warning(f"[TradingData] pagina extra fallo para {symbol}: {e}")
    except Exception as e:
        logger.warning(f"[TradingData] klines fallo para {symbol} ({market}): {e}")

    vol_24h = None
    secs = interval_seconds(interval_str)
    # Volumen 24h EXACTO al de Binance: ticker oficial /ticker/24hr (ventana
    # rodante real, quoteVolume = lo que muestra la app en USDT). Si falla, se
    # cae a la suma de velas. Stocks no tienen equivalente Binance: se suman
    # las velas de Yahoo dentro de las ultimas 24h.
    try:
        if market == 'crypto' and klines:
            try:
                vol_24h = fetch_quote_volume_24h(symbol)
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
