from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import time
import threading
import requests
import statistics
import math
import os
import logging
from dotenv import load_dotenv

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

from nvidia_chat import nvidia_chat, AVAILABLE_MODELS

app = Flask(__name__)

# Confia en X-Forwarded-For/Proto de Render para ver la IP real del cliente.
# Sin esto, request.remote_addr es siempre 127.0.0.1 (el proxy de Render)
# y el rate limiting se aplica a TODOS los usuarios como si fueran uno solo.
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

# Origenes permitidos para CORS (separados por coma). En produccion se debe
# configurar la URL del frontend, ej: https://mi-frontend.onrender.com
DEFAULT_ORIGIN = "http://localhost:3000"
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGIN).split(",") if o.strip()
]
if DEFAULT_ORIGIN not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(DEFAULT_ORIGIN)

CORS(app, resources={
    r"/*": {
        "origins": ALLOWED_ORIGINS,
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS, async_mode='threading')

# Import social/socket logic
from sockets import init_sockets

@app.before_request
def log_request_info():
    logger.info("--- NUEVA PETICIÓN ---")
    logger.info(f"Origin: {request.headers.get('Origin')}")
    logger.info(f"Method: {request.method}")
    logger.info(f"URL: {request.url}")
    logger.info("----------------------")

CACHE_TTL = 120
STALE_TTL = 600
# Espacio minimo entre refrescos en background de UN MISMO cache_key.
# Los indicadores se recalculan con la vela en curso, asi que a menor gap,
# mas cerca quedan los numeros de la app de Binance (que actualiza cada
# segundo). Las llamadas son baratas (2 klines paginadas = 4 weight).
REFRESH_MIN_GAP = 25
cache = {}
locks = {}
cache_lock = threading.Lock()

# Sub-cache del volumen 24h (ticker de Binance pesa 40 weight): el volumen
# cambia lento y no necesita refrescarse con cada ciclo de indicadores.
TICKER_TTL = 120
_ticker_cache = {}
_ticker_lock = threading.Lock()

in_flight = {}
in_flight_lock = threading.Lock()

# Whitelist de activos soportados: evita que simbolos invalidos lleguen a las
# fuentes de datos (p.ej. USDTUSDT) y quemen rate limit
CRYPTO_SYMBOLS = {"BTCUSDT", "ETHUSDT", "SOLUSDT", "PEPEUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT"}
STOCK_SYMBOLS = {"AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "NFLX", "AMD", "INTC", "LMT"}

RATE_WINDOW = 60
RATE_LIMIT = 60
ip_requests = {}
ip_lock = threading.Lock()
# LIMITA LAS PETICIONES POR IP EN UNA VENTANA TEMPORAL; DEVUELVE TRUE SI SE SUPERA EL LIMITE
def rate_limited(ip):
    now = time.time()
    with ip_lock:
        arr = ip_requests.get(ip)
        if not arr:
            ip_requests[ip] = [now]
            return False
        arr = [t for t in arr if now - t <= RATE_WINDOW]
        if not arr:
            # Entrada vencida: limpiar para que el dict no crezca sin limite
            del ip_requests[ip]
            ip_requests[ip] = [now]
            return False
        arr.append(now)
        ip_requests[ip] = arr
        if len(arr) > RATE_LIMIT:
            return True
        return False
# CREA O RETORNA UN LOCK ESPECIFICO PARA UN SIMBOLO PARA SINCRONIZAR ACCESOS
def get_symbol_lock(symbol):
    with cache_lock:
        if symbol not in locks:
            locks[symbol] = threading.Lock()
        return locks[symbol]


# DEDUPLICACION DE PETICIONES EN VUELO
def wait_for_in_flight(cache_key, timeout=30):
    with in_flight_lock:
        if cache_key not in in_flight:
            return None
        event, result_container = in_flight[cache_key]
    event.wait(timeout)
    with in_flight_lock:
        entry = in_flight.get(cache_key)
        if entry:
            _, result_container = entry
            return result_container.get('data')
    return None

def set_in_flight(cache_key):
    event = threading.Event()
    result_container = {}
    with in_flight_lock:
        in_flight[cache_key] = (event, result_container)
    return event, result_container

def clear_in_flight(cache_key, result_container=None):
    with in_flight_lock:
        if cache_key in in_flight:
            evt, container = in_flight[cache_key]
            if result_container and container:
                container['data'] = result_container.get('data')
            evt.set()
            del in_flight[cache_key]
# VOLUMEN 24H EXACTO AL DE BINANCE (quoteVolume del ticker oficial), con
# sub-cache propia: el ticker pesa 40 weight y el volumen cambia lento.
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


# DECIMALES DINAMICOS ESTILO BINANCE: escala segun la magnitud del precio.
# PEPE (~0.000011) y similares necesitan 8 decimales; BTC 2; DOGE/XRP 4-6.
def price_decimals(price):
    if not price or price <= 0:
        return 2
    if price < 0.0001:
        return 8
    if price < 0.01:
        return 6
    if price < 1:
        return 4
    if price < 100:
        return 3
    return 2


# OBTIENE KLINES DE MERCADO (BINANCE/YAHOO) + VOLUMEN 24H EXACTO.
# NO calcula indicadores (build_payload hace eso). Separada para que el hilo
# de streaming de Binance re-seedee sus velas sin duplicar logica.
def _fetch_klines_and_volume(symbol, interval_str, market):
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


# CONSTRUYE EL PAYLOAD COMPLETO (indicadores + historia + senales) A PARTIR DE
# KLINES. Funcion pura reutilizable: el hilo de streaming la invoca para
# recalcular con la vela viva de Binance sin hacer re-fetch REST.
def build_payload(symbol, interval_str, market, klines, vol_24h=None):
    secs = interval_seconds(interval_str)
    opens = []
    highs = []
    lows = []
    closes = []
    timestamps = []
    quote_volumes = []
    if klines:
        opens = [float(k[1]) for k in klines]
        highs = [float(k[2]) for k in klines]
        lows = [float(k[3]) for k in klines]
        closes = [float(k[4]) for k in klines]
        timestamps = [int(k[0]) for k in klines]
        quote_volumes = [float(k[7]) for k in klines]

    precio = closes[-1] if closes else fetch_last_price(symbol, market)

    history = {}
    if klines:
        history['opens'] = opens
        history['highs'] = highs
        history['lows'] = lows
        history['closes'] = closes
        history['times'] = timestamps

    # Series tecnicas (valores actuales + historial para graficos)
    rsi_series = []
    stoch_k = []
    stoch_d = []
    stoch_rsi_k = []
    cci_series = []
    macd_line = []
    macd_signal = []
    bb_upper = []
    bb_middle = []
    bb_lower = []
    ema50 = []
    ema100 = []
    ema200 = []
    adx = []
    plus_di = []
    minus_di = []
    pivots = (None, None, None, None, None, None)
    try:
        rsi_series = compute_rsi_series(closes, period=14)
        stoch_k, stoch_d = compute_stoch_series(highs, lows, closes)
        stoch_rsi_k = compute_stoch_rsi_series(rsi_series)
        cci_series = compute_cci_series(highs, lows, closes, period=20)
        macd_line, macd_signal = compute_macd_series(closes, fast=12, slow=26, signal=9)
        bb_upper, bb_middle, bb_lower = compute_bollinger_series(closes, period=20)
        ema50 = compute_ema_series(closes, 50)
        ema100 = compute_ema_series(closes, 100)
        ema200 = compute_ema_series(closes, 200)
        adx, plus_di, minus_di = compute_adx_series(highs, lows, closes)
        pivots = compute_pivots(highs, lows, closes, timestamps)

        history['rsi'] = rsi_series
        history['macd'] = macd_line
        history['macd_signal'] = macd_signal
        history['bb_upper'] = bb_upper
        history['bb_middle'] = bb_middle
        history['bb_lower'] = bb_lower
        history['ema50'] = ema50
        history['ema100'] = ema100
        history['ema200'] = ema200
        history['rsiStoch'] = stoch_rsi_k
    except Exception as e:
        logger.error(f"[TradingData] calculo de indicadores fallo para {symbol}: {e}")

    # Si no hay historial real, construir una historia sintetica basada en el precio actual
    if not history.get('closes'):
        try:
            base = float(precio)
            synthetic = []
            s_opens = []
            s_highs = []
            s_lows = []
            prev_close = base
            for i in range(50):
                noise = 1 + 0.002 * math.sin(i / 3.0)
                close = base * noise
                open_ = prev_close
                high = max(open_, close) * 1.0005
                low = min(open_, close) * 0.9995
                synthetic.append(close)
                s_opens.append(open_)
                s_highs.append(high)
                s_lows.append(low)
                prev_close = close
            history['closes'] = synthetic
            history['opens'] = s_opens
            history['highs'] = s_highs
            history['lows'] = s_lows
            history['times'] = [int(time.time()) - (50 - i) * secs for i in range(50)]

            closes = synthetic
            highs = s_highs
            lows = s_lows
            opens = s_opens
            rsi_series = compute_rsi_series(closes, period=14)
            stoch_k, stoch_d = compute_stoch_series(highs, lows, closes)
            stoch_rsi_k = compute_stoch_rsi_series(rsi_series)
            cci_series = compute_cci_series(highs, lows, closes, period=20)
            macd_line, macd_signal = compute_macd_series(closes, fast=12, slow=26, signal=9)
            bb_upper, bb_middle, bb_lower = compute_bollinger_series(closes, period=20)
            ema50 = compute_ema_series(closes, 50)
            ema100 = compute_ema_series(closes, 100)
            ema200 = compute_ema_series(closes, 200)
            adx, plus_di, minus_di = compute_adx_series(highs, lows, closes)
            pivots = compute_pivots(highs, lows, closes, history['times'])

            history['rsi'] = rsi_series
            history['macd'] = macd_line
            history['macd_signal'] = macd_signal
            history['bb_upper'] = bb_upper
            history['bb_middle'] = bb_middle
            history['bb_lower'] = bb_lower
            history['ema50'] = ema50
            history['ema100'] = ema100
            history['ema200'] = ema200
            history['rsiStoch'] = stoch_rsi_k

            if vol_24h is None:
                vol_24h = precio * max(1, 86400 // secs)
        except Exception as e:
            logger.error(f"[TradingData] historia sintetica fallo para {symbol}: {e}")

    # Los indicadores se calculan con toda la historia (convergencia exacta);
    # el historial que se envia al frontend se recorta para no inflar el payload
    if history:
        history = {k: v[-300:] for k, v in history.items()}

    buy, sell, neutral = compute_signal_summary(
        last_non_none(rsi_series),
        last_non_none(stoch_k),
        last_non_none(stoch_d),
        last_non_none(cci_series),
        last_non_none(macd_line),
        last_non_none(macd_signal),
        last_non_none(adx),
        last_non_none(plus_di),
        last_non_none(minus_di),
        last_non_none(stoch_rsi_k),
        last_non_none(ema50),
        last_non_none(ema100),
        last_non_none(ema200),
        precio,
    )
    r1, r2, r3, s1, s2, s3 = pivots

    return {
        'symbol': symbol,
        'market': market,
        'precio': precio,
        'decimales': price_decimals(precio),
        'rsi': last_non_none(rsi_series),
        'rsiStoch': last_non_none(stoch_rsi_k),
        'volumen': vol_24h if vol_24h is not None else (quote_volumes[-1] if quote_volumes else None),
        'bbUpper': last_non_none(bb_upper),
        'bbMiddle': last_non_none(bb_middle),
        'bbLower': last_non_none(bb_lower),
        'macdValue': last_non_none(macd_line),
        'macdSignal': last_non_none(macd_signal),
        'adx': last_non_none(adx),
        'stochK': last_non_none(stoch_k),
        'stochD': last_non_none(stoch_d),
        'cci': last_non_none(cci_series),
        'ema50': last_non_none(ema50),
        'ema100': last_non_none(ema100),
        'ema200': last_non_none(ema200),
        's1': s1,
        's2': s2,
        's3': s3,
        'r1': r1,
        'r2': r2,
        'r3': r3,
        'buySignals': buy,
        'sellSignals': sell,
        'neutralSignals': neutral,
        'timeframe': interval_str,
        'history': history
    }


# ENTRY POINT REST/SOCKET: KLINES + VOLUMEN + INDICADORES COMPLETOS
def fetch_trading_data(symbol, interval_str='15m', market='crypto'):
    klines, vol_24h = _fetch_klines_and_volume(symbol, interval_str, market)
    return build_payload(symbol, interval_str, market, klines, vol_24h)


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


# CONVIERTE UN TIMEFRAME ('15m', '4h', ...) A SEGUNDOS
def interval_seconds(interval_str):
    unit = interval_str[-1].lower()
    value = int(interval_str[:-1] or 1)
    mult = {'m': 60, 'h': 3600, 'd': 86400, 'w': 604800}.get(unit, 900)
    return value * mult


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
        for i in range(0, len(bars) - len(bars) % 4, 4):
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


# CALCULA LA MEDIA MOVIL SIMPLE (SMA) DE UNA SERIE SOBRE UN PERIODO DADO
def compute_sma(series, period):
    out = []
    for i in range(len(series)):
        if i + 1 < period:
            out.append(None)
        else:
            window = series[i + 1 - period:i + 1]
            out.append(sum(window) / period)
    return out


# CALCULA LA SERIE DE MEDIA MOVIL EXPONENCIAL (EMA) PARA CADA PUNTO DE LA SERIE
def compute_ema_series(series, period):
    emas = []
    k = 2 / (period + 1)
    ema_prev = None
    for i, price in enumerate(series):
        if i < period - 1:
            emas.append(None)
            continue
        if ema_prev is None:
            sma = sum(series[i + 1 - period:i + 1]) / period
            ema_prev = sma
            emas.append(ema_prev)
        else:
            ema = price * k + ema_prev * (1 - k)
            emas.append(ema)
            ema_prev = ema
    return emas



# CALCULA LA SERIE DE RSI (INDICADOR DE FUERZA RELATIVA) SOBRE UNA LISTA DE PRECIOS
def compute_rsi_series(prices, period=14):
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    seed = deltas[:period]
    up = sum(x for x in seed if x > 0) / period
    down = -sum(x for x in seed if x < 0) / period
    rs = up / down if down != 0 else 0
    rsi = [None] * (period)
    rsi.append(100 - 100 / (1 + rs))
    up_avg = up
    down_avg = down
    for delta in deltas[period:]:
        up_val = max(delta, 0)
        down_val = -min(delta, 0)
        up_avg = (up_avg * (period - 1) + up_val) / period
        down_avg = (down_avg * (period - 1) + down_val) / period
        rs = up_avg / down_avg if down_avg != 0 else 0
        rsi.append(100 - 100 / (1 + rs))
    if len(rsi) < len(prices):
        rsi = [None] * (len(prices) - len(rsi)) + rsi
    return rsi


# CALCULA LA SERIE MACD Y SU LINEA DE SEÑAL A PARTIR DE PRECIOS (USANDO EMA)
def compute_macd_series(prices, fast=12, slow=26, signal=9):
    ema_fast = compute_ema_series(prices, fast)
    ema_slow = compute_ema_series(prices, slow)
    macd = []
    for ef, es in zip(ema_fast, ema_slow):
        if ef is None or es is None:
            macd.append(None)
        else:
            macd.append(ef - es)
    macd_values = [m for m in macd if m is not None]
    signal_line = []
    if len(macd_values) >= signal:
        sig_ema = compute_ema_series(macd_values, signal)
        sig_full = [None] * (len(macd) - len(sig_ema)) + sig_ema
        signal_line = sig_full
    else:
        signal_line = [None] * len(macd)
    return macd, signal_line



# CALCULA LAS BANDAS DE BOLLINGER: UPPER, MIDDLE(SMA) Y LOWER PARA UNA SERIE DE PRECIOS
def compute_bollinger_series(prices, period=20, mult=2):
    middle = compute_sma(prices, period)
    upper = []
    lower = []
    for i in range(len(prices)):
        if i + 1 < period:
            upper.append(None)
            lower.append(None)
            continue
        window = prices[i + 1 - period:i + 1]
        sd = statistics.pstdev(window)
        upper.append(middle[i] + mult * sd if middle[i] is not None else None)
        lower.append(middle[i] - mult * sd if middle[i] is not None else None)
    return upper, middle, lower

# RETORNA EL ULTIMO VALOR NO-NULO DE UNA SERIE (None si no hay ninguno)
def last_non_none(series):
    if not series:
        return None
    for v in reversed(series):
        if v is not None:
            return v
    return None


# SMA DE UNA SERIE QUE PUEDE CONTENER None: si el periodo contiene None, el
# resultado es None (propaga el vacio inicial sin distorsionar el calculo)
def compute_sma_series(series, period):
    out = []
    for i in range(len(series)):
        if i + 1 < period:
            out.append(None)
            continue
        window = series[i + 1 - period:i + 1]
        if any(v is None for v in window):
            out.append(None)
        else:
            out.append(sum(window) / period)
    return out


# CALCULA LA SERIE DE STOCHASTIC %K Y %D (14, 3, 3)
def compute_stoch_series(highs, lows, closes, k_period=14, k_smooth=3, d_period=3):
    k_raw = []
    for i in range(len(closes)):
        if i + 1 < k_period:
            k_raw.append(None)
            continue
        ll = min(lows[i + 1 - k_period:i + 1])
        hh = max(highs[i + 1 - k_period:i + 1])
        k_raw.append(0.0 if hh == ll else (closes[i] - ll) / (hh - ll) * 100)
    k = compute_sma_series(k_raw, k_smooth)
    d = compute_sma_series(k, d_period)
    return k, d


# CALCULA EL STOCHASTIC RSI %K (14, 14, 3, 3) A PARTIR DE LA SERIE DE RSI
def compute_stoch_rsi_series(rsi_series, stoch_period=14, k_smooth=3, d_period=3):
    vals = []
    for i in range(len(rsi_series)):
        if i + 1 < stoch_period:
            vals.append(None)
            continue
        window = rsi_series[i + 1 - stoch_period:i + 1]
        if any(v is None for v in window):
            vals.append(None)
            continue
        ll, hh = min(window), max(window)
        vals.append(0.0 if hh == ll else (rsi_series[i] - ll) / (hh - ll) * 100)
    k = compute_sma_series(vals, k_smooth)
    return k


# CALCULA LA SERIE DE CCI (20) SOBRE TYPICAL PRICE
def compute_cci_series(highs, lows, closes, period=20):
    tp = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
    sma_tp = compute_sma_series(tp, period)
    out = []
    for i in range(len(tp)):
        if i + 1 < period or sma_tp[i] is None:
            out.append(None)
            continue
        window = tp[i + 1 - period:i + 1]
        md = sum(abs(x - sma_tp[i]) for x in window) / period
        out.append(0.0 if md == 0 else (tp[i] - sma_tp[i]) / (0.015 * md))
    return out


# CALCULA ADX (14) CON SUAVIZADO WILDER, MAS +DI / -DI
def compute_adx_series(highs, lows, closes, period=14):
    n = len(closes)
    adx = [None] * n
    plus_di = [None] * n
    minus_di = [None] * n
    if n < period + 1:
        return adx, plus_di, minus_di

    trs = []
    pdi_raw = []
    mdi_raw = []
    for i in range(1, n):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        up = highs[i] - highs[i - 1]
        dn = lows[i - 1] - lows[i]
        trs.append(tr)
        pdi_raw.append(up if up > 0 and up > dn else 0.0)
        mdi_raw.append(dn if dn > 0 and dn > up else 0.0)

    tr_s = sum(trs[:period])
    p_s = sum(pdi_raw[:period])
    m_s = sum(mdi_raw[:period])
    dx_values = []
    for i in range(period, len(trs)):
        tr_s = tr_s - tr_s / period + trs[i]
        p_s = p_s - p_s / period + pdi_raw[i]
        m_s = m_s - m_s / period + mdi_raw[i]
        plus_di[i] = 100 * p_s / tr_s if tr_s else 0.0
        minus_di[i] = 100 * m_s / tr_s if tr_s else 0.0
        total_di = plus_di[i] + minus_di[i]
        dx_values.append(100 * abs(plus_di[i] - minus_di[i]) / total_di if total_di else 0.0)

    if len(dx_values) >= period:
        adx[period + period - 1] = sum(dx_values[:period]) / period
        for j in range(period, len(dx_values)):
            adx[period + j] = (adx[period + j - 1] * (period - 1) + dx_values[j]) / period
    return adx, plus_di, minus_di


# CALCULA PIVOT POINTS CLASICOS (estilo TradingView/Binance): se toman el
# maximo, el minimo y el cierre del ULTIMO DIA COMPLETADO (UTC). Si ese dia no
# tiene velas (fin de semana/feriado para stocks), se retrocede al ultimo dia
# con datos (p. ej. viernes). Si no hay ningun dia completo, cae a la ventana
# movil de las ultimas 24h. Nunca devuelve None si existe historial.
def compute_pivots(highs, lows, closes, times):
    if not times:
        return (None, None, None, None, None, None)
    now_ms = times[-1]
    day_ms = 86400000
    today_start = (now_ms // day_ms) * day_ms
    bars = None
    for back in range(1, 8):
        day_start = today_start - back * day_ms
        day_bars = [
            (t, h, l, c)
            for t, h, l, c in zip(times, highs, lows, closes)
            if day_start <= t < day_start + day_ms
        ]
        if len(day_bars) >= 1:
            bars = day_bars
            break
    if bars is None:
        bars = [
            (t, h, l, c)
            for t, h, l, c in zip(times, highs, lows, closes)
            if t <= now_ms and now_ms - t <= day_ms
        ]
        bars = bars[:-1] if len(bars) > 1 else bars
    if len(bars) < 1:
        return (None, None, None, None, None, None)
    h = max(b[1] for b in bars)
    l = min(b[2] for b in bars)
    c = bars[-1][3]
    p = (h + l + c) / 3
    r1 = 2 * p - l
    s1 = 2 * p - h
    r2 = p + (h - l)
    s2 = p - (h - l)
    r3 = h + 2 * (p - l)
    s3 = l - 2 * (h - p)
    return r1, r2, r3, s1, s2, s3


# CONSENSO DE SEÑALES (estilo TradingView) SOBRE OSCILADORES Y MEDIAS MOVILES
def compute_signal_summary(rsi, stoch_k, stoch_d, cci, macd_v, macd_sig, adx_v,
                           plus_di, minus_di, rsi_stoch, ema50, ema100, ema200, precio):
    buy = 0
    sell = 0
    neutral = 0

    def vote(value, buy_threshold, sell_threshold):
        nonlocal buy, sell, neutral
        if value is None:
            neutral += 1
            return
        if value > buy_threshold:
            buy += 1
        elif value < sell_threshold:
            sell += 1
        else:
            neutral += 1

    vote(rsi, 70, 30)
    vote(stoch_k, 80, 20)
    vote(stoch_d, 80, 20)
    vote(cci, 100, -100)
    if macd_v is not None and macd_sig is not None:
        if macd_v > macd_sig:
            buy += 1
        else:
            sell += 1
    else:
        neutral += 1
    vote(rsi_stoch, 80, 20)
    if plus_di is not None and minus_di is not None and adx_v is not None:
        if adx_v >= 20:
            if plus_di > minus_di:
                buy += 1
            else:
                sell += 1
        else:
            neutral += 1
    else:
        neutral += 1

    for ema in (ema50, ema100, ema200):
        if ema is not None and precio is not None:
            if precio > ema:
                buy += 1
            else:
                sell += 1
        else:
            neutral += 1
    if ema50 is not None and ema200 is not None:
        if ema50 > ema200:
            buy += 1
        else:
            sell += 1
    else:
        neutral += 1
    return buy, sell, neutral


# RETORNA DATOS DE TRADING CACHEADOS CON STALE-WHILE-REVALIDATE
def get_trading_cached(symbol, interval_str='15m', market='crypto', force=False):
    cache_key = f"{market}:{symbol}_{interval_str}"
    now = time.time()
    entry = cache.get(cache_key)

    # Validar simbolo ANTES de tocar las fuentes de datos: un par invalido
    # (p.ej. USDTUSDT) quema rate limit y puede tumbar los demas pares
    allowed = STOCK_SYMBOLS if market == 'stock' else CRYPTO_SYMBOLS
    if symbol not in allowed:
        raise ValueError(f"Simbolo no soportado: {symbol}")

    # Refresco MANUAL (boton Refresh Data): ignora la cache fresca y vuelve a
    # consultar las fuentes. Respeta la dedup en vuelo para no duplicar llamadas.
    if force:
        flight_result = wait_for_in_flight(cache_key)
        if flight_result:
            return flight_result
        lock = get_symbol_lock(cache_key)
        with lock:
            entry = cache.get(cache_key)
            flight_result = wait_for_in_flight(cache_key)
            if flight_result:
                return flight_result
            event, result_container = set_in_flight(cache_key)
            try:
                data = fetch_trading_data(symbol, interval_str, market)
                cache[cache_key] = {'data': data, 'ts': time.time(), 'last_refresh': time.time()}
                clear_in_flight(cache_key, {'data': data})
                return data
            except Exception as e:
                clear_in_flight(cache_key)
                if entry and 'data' in entry:
                    logger.warning(f"[TradingData] refresh manual fallo para {cache_key}, sirviendo stale: {e}")
                    return entry['data']
                raise

    # Cache FRESCO: devolver inmediato
    if entry and 'data' in entry and now - entry['ts'] <= CACHE_TTL:
        return entry['data']

    # Cache STALE pero dentro de STALE_TTL: servir stale y refrescar en background
    if entry and 'data' in entry and now - entry['ts'] <= STALE_TTL:
        # Verificar si ya hay una peticion en vuelo para este cache_key
        if cache_key not in in_flight:
            # Refrescar como maximo una vez cada REFRESH_MIN_GAP segundos por cache_key.
            # Sin esta guardia, cada ciclo de polling del socket dispararia la API
            # (Binance/Yahoo) aunque los datos no hayan cambiado.
            last_refresh = entry.get('last_refresh', 0)
            if now - last_refresh >= REFRESH_MIN_GAP:
                entry['last_refresh'] = now
                def refresh():
                    try:
                        data = fetch_trading_data(symbol, interval_str, market)
                        with cache_lock:
                            cache[cache_key] = {'data': data, 'ts': time.time(), 'last_refresh': time.time()}
                        logger.info(f"[StaleRefresh] {cache_key} refrescado en background")
                    except Exception as e:
                        logger.warning(f"[StaleRefresh] {cache_key} fallo: {e}")
                t = threading.Thread(target=refresh, daemon=True)
                t.start()
        return entry['data']

    # Cache EXPIRADA o no existe: refrescar sincronicamente
    # Verificar dedup: si hay una peticion en vuelo, esperar
    flight_result = wait_for_in_flight(cache_key)
    if flight_result:
        return flight_result

    lock = get_symbol_lock(cache_key)
    with lock:
        entry = cache.get(cache_key)
        if entry and 'data' in entry and now - entry['ts'] <= CACHE_TTL:
            return entry['data']
        if entry and 'data' in entry and now - entry['ts'] <= STALE_TTL:
            return entry['data']

        event, result_container = set_in_flight(cache_key)
        try:
            data = fetch_trading_data(symbol, interval_str, market)
            cache[cache_key] = {'data': data, 'ts': time.time(), 'last_refresh': time.time()}
            clear_in_flight(cache_key, {'data': data})
            return data
        except Exception as e:
            clear_in_flight(cache_key)
            # Ultimo recurso: servir stale aunque este vencido, en vez de fallar
            if entry and 'data' in entry:
                logger.warning(f"[TradingData] fallo para {cache_key}, sirviendo stale: {e}")
                return entry['data']
            raise


@app.route('/api/trading/<symbol>')
# ENDPOINT: OBTIENE DATOS DE TRADING PARA UN SIMBOLO, APLICANDO RATE LIMIT POR IP
def get_trading_data(symbol):
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    interval = request.args.get('interval', '15m')
    market = request.args.get('market', 'crypto')
    force = request.args.get('force', '0') == '1'
    if market not in ('crypto', 'stock'):
        market = 'crypto'
    try:
        data = get_trading_cached(symbol, interval, market, force=force)
        return jsonify(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        if '429' in str(e):
            return jsonify({'error': 'TradingView Rate Limit Exceeded'}), 429
        return jsonify({'error': str(e)}), 500


NEWS_CATEGORIES = {
    "BTCUSDT": "BTC",
    "ETHUSDT": "ETH",
    "SOLUSDT": "SOL",
    "PEPEUSDT": "PEPE",
    "DOGEUSDT": "DOGE",
}

NEWS_CACHE = {}
NEWS_CACHE_TTL = 300

CRYPTOCOMPARE_API_KEY = os.getenv('CRYPTOCOMPARE_API_KEY')

@app.route('/api/news/<symbol>')
def get_news(symbol):
    market = request.args.get('market', 'crypto')
    now = time.time()
    cached = NEWS_CACHE.get(symbol)
    if cached and now - cached['ts'] <= NEWS_CACHE_TTL:
        return jsonify(cached['articles'])

    # STOCKS: noticias de Yahoo Finance (gratis, sin API key, mismo host que los charts)
    if market == 'stock':
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
            }
            resp = requests.get(
                'https://query1.finance.yahoo.com/v1/finance/search',
                params={'q': symbol, 'newsCount': 6},
                headers=headers,
                timeout=6
            )
            resp.raise_for_status()
            data = resp.json()
            articles = []
            for item in (data.get('news') or [])[:6]:
                thumb = None
                try:
                    thumb = item['thumbnail']['resolutions'][0]['url']
                except Exception:
                    pass
                articles.append({
                    'title': item.get('title', ''),
                    'url': item.get('link', ''),
                    'source': item.get('publisher', ''),
                    'published': item.get('providerPublishTime'),
                    'body': '',
                    'imageurl': thumb,
                    'categories': 'Stocks',
                })
            NEWS_CACHE[symbol] = {'articles': articles, 'ts': now}
            return jsonify(articles)
        except Exception as e:
            logger.warning(f"[News] Yahoo stock news fallo para {symbol}: {e}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

    category = NEWS_CATEGORIES.get(symbol, symbol.replace('USDT', ''))
    try:
        headers = {}
        if CRYPTOCOMPARE_API_KEY:
            headers['authorization'] = f'Apikey {CRYPTOCOMPARE_API_KEY}'
        resp = requests.get(
            'https://min-api.cryptocompare.com/data/v2/news/',
            params={'lang': 'EN', 'categories': category, 'limit': 5},
            headers=headers,
            timeout=6
        )
        if resp.status_code == 429:
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])
        resp.raise_for_status()
        try:
            data = resp.json()
        except Exception:
            logger.warning(f"News API invalid JSON for {symbol}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

        if not isinstance(data, dict):
            logger.warning(f"News API unexpected response type for {symbol}: {type(data)}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

        if data.get('Response') == 'Error':
            logger.warning(f"News API error for {symbol}: {data.get('Message')}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

        articles = []
        raw_articles = data.get('Data')
        if isinstance(raw_articles, list):
            for item in raw_articles[:5]:
                body = item.get('body', '') or ''
                articles.append({
                    'title': item.get('title'),
                    'source': item.get('source'),
                    'url': item.get('url'),
                    'published': item.get('published_on'),
                    'body': body[:200],
                    'imageurl': item.get('imageurl'),
                })
        elif raw_articles is not None:
            logger.warning(f"Unexpected news Data format for {symbol}: {type(raw_articles)}")

        NEWS_CACHE[symbol] = {'articles': articles, 'ts': now}
        return jsonify(articles)
    except Exception as e:
        logger.warning(f"News fetch failed for {symbol}: {e}")
        if cached:
            return jsonify(cached['articles'])
        return jsonify([])

@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """AI Trading Agent chat endpoint. Fetches latest indicator data for context."""
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    prompt = data.get('prompt', '').strip()
    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400

    model_key = data.get('model', 'nvidia-llama')
    symbol = data.get('symbol', 'BTCUSDT')
    interval = data.get('interval', '15m')
    market = data.get('market', 'crypto')
    if market not in ('crypto', 'stock'):
        market = 'crypto'
    history = data.get('history', [])
    global_context = data.get('global_context', '')
    temperature = data.get('temperature', 0.3)

    # Fetch the latest indicator data for the current symbol
    indicator_data = None
    try:
        indicator_data = get_trading_cached(symbol, interval, market)
        indicator_data['symbol'] = symbol
    except Exception as e:
        # If we can't get indicator data, continue without it
        indicator_data = {'symbol': symbol, 'error': str(e)}

    try:
        response = nvidia_chat(
            prompt=prompt,
            model_key=model_key,
            temperature=temperature,
            max_tokens=4096,
            history=history,
            global_context=global_context,
            indicator_data=indicator_data,
        )
        if response is None:
            return jsonify({'error': 'AI service unavailable. Check NVIDIA_API_KEY.'}), 503
        return jsonify({'response': response, 'model': model_key})
    except Exception as e:
        return jsonify({'error': f'Chat error: {str(e)}'}), 500


@app.route('/api/models')
def get_models():
    """Returns available AI models."""
    models = []
    for key, config in AVAILABLE_MODELS.items():
        models.append({
            'key': key,
            'name': config['name'],
            'provider': config['provider'],
            'free': config.get('free', False),
        })
    return jsonify(models)


# Initialize sockets after all functions are defined
init_sockets(socketio, get_trading_cached)

# STREAMING EN TIEMPO REAL DE BINANCE: actualiza la caché y emite a las salas
# con la vela viva (klines + volumen 24h) sin hacer re-fetch REST.
# Los stocks no tienen WS gratuito: siguen con polling (REFRESH_MIN_GAP).
from sockets import subscriber_rooms
from binance_stream import init_binance_stream


def _update_ticker_from_stream(symbol, quote_volume):
    with _ticker_lock:
        _ticker_cache[symbol] = (time.time(), float(quote_volume))


def _store_stream_payload(cache_key, data):
    with cache_lock:
        cache[cache_key] = {'data': data, 'ts': time.time(), 'last_refresh': time.time()}


init_binance_stream(
    socketio,
    {
        'fetch_klines_vol': lambda s, iv, m: _fetch_klines_and_volume(s, iv, m),
        'build_payload': lambda s, iv, m, k, v: build_payload(s, iv, m, k, v),
        'get_vol_24h': fetch_quote_volume_24h,
        'update_ticker': _update_ticker_from_stream,
        'store_payload': _store_stream_payload,
        'has_subscribers': lambda room: room in subscriber_rooms,
    },
    sorted(CRYPTO_SYMBOLS),
    ['1m', '5m', '15m', '1h', '4h', '1d'],
)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    socketio.run(app, port=port, debug=debug, host='0.0.0.0', allow_unsafe_werkzeug=True)
