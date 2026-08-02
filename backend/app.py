from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
from tradingview_ta import TA_Handler, Interval
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
TV_MAX_CALLS = 30
TV_WINDOW = 60
cache = {}
locks = {}
cache_lock = threading.Lock()

tv_call_timestamps = []
tv_call_lock = threading.Lock()

symbol_backoff = {}
symbol_backoff_lock = threading.Lock()

in_flight = {}
in_flight_lock = threading.Lock()

INTERVAL_MAP = {
    "1m": Interval.INTERVAL_1_MINUTE,
    "5m": Interval.INTERVAL_5_MINUTES,
    "15m": Interval.INTERVAL_15_MINUTES,
    "1h": Interval.INTERVAL_1_HOUR,
    "4h": Interval.INTERVAL_4_HOURS,
    "1d": Interval.INTERVAL_1_DAY,
    "1w": Interval.INTERVAL_1_WEEK,
}

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

# GOBERNADOR GLOBAL: MAX N LLAMADAS A TRADINGVIEW POR VENTANA DE TIEMPO
def tv_rate_governor():
    now = time.time()
    with tv_call_lock:
        tv_call_timestamps[:] = [t for t in tv_call_timestamps if now - t <= TV_WINDOW]
        if len(tv_call_timestamps) >= TV_MAX_CALLS:
            return False
        tv_call_timestamps.append(now)
        return True

# VERIFICA SI UN SIMBOLO ESTA EN BACKOFF POR RATE LIMIT PREVIO
def is_symbol_backoff(cache_key):
    with symbol_backoff_lock:
        until = symbol_backoff.get(cache_key)
        if until and time.time() < until:
            return True
        return False

# MARCA UN SIMBOLO CON BACKOFF EXPONENCIAL
def mark_symbol_backoff(cache_key):
    with symbol_backoff_lock:
        last_until = symbol_backoff.get(cache_key, 0)
        now = time.time()
        wait = max(120, (last_until - now) * 2) if last_until > now else 120
        wait = min(wait, 1800)
        symbol_backoff[cache_key] = now + wait
        logger.warning(f"[Backoff] {cache_key} marked for {wait:.0f}s")

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
# OBTIENE ANALISIS DE TRADINGVIEW Y CALCULA SERIES TECNICAS ADICIONALES (RSI, MACD, BB, EMAs)
def fetch_from_ta(symbol, interval_str='15m', market='crypto'):
    tv_interval = INTERVAL_MAP.get(interval_str, Interval.INTERVAL_15_MINUTES)

    if market == 'stock':
        screener = 'america'
        exchange = 'NASDAQ'
    else:
        screener = 'crypto'
        exchange = 'BINANCE'

    handler = TA_Handler(
        symbol=symbol,
        screener=screener,
        exchange=exchange,
        interval=tv_interval
    )
    analysis = handler.get_analysis()
    indicators = analysis.indicators
    history = {}

    # Intentar obtener klines y calcular series históricas
    try:
        if market == 'stock':
            klines = fetch_yahoo_chart(symbol, interval_str)
        else:
            klines = fetch_klines(symbol, interval=interval_str, limit=300)
        opens = [float(k[1]) for k in klines]
        highs = [float(k[2]) for k in klines]
        lows = [float(k[3]) for k in klines]
        closes = [float(k[4]) for k in klines]
        timestamps = [int(k[0]) for k in klines]
        quote_volumes = [float(k[7]) for k in klines]

        history['opens'] = opens
        history['highs'] = highs
        history['lows'] = lows
        history['closes'] = closes
        history['times'] = timestamps

        # Volumen 24h real. Para crypto (USDT): timeframes sub-horarios (1m/5m/15m)
        # no cubren 24h con 300 velas, asi que se piden velas de 1h (24 exactas).
        # Para stocks, Yahoo devuelve la vela actual y la suma de velas del dia.
        secs = interval_seconds(interval_str)
        if market == 'stock':
            end_ts = klines[-1][0] if klines else int(time.time() * 1000)
            vol_24h = sum(k[5] for k in klines if end_ts - k[0] <= 86400000)
            if not klines:
                raise ValueError('sin klines de yahoo')
        elif secs < 3600:
            vol_klines = fetch_klines(symbol, interval='1h', limit=24)
            vol_24h = sum(float(k[7]) for k in vol_klines)
        else:
            bars_24h = max(1, min(len(quote_volumes), 86400 // secs))
            vol_24h = sum(quote_volumes[-bars_24h:])

        history['rsi'] = compute_rsi_series(closes, period=14)
        macd_line, macd_signal = compute_macd_series(closes, fast=12, slow=26, signal=9)
        history['macd'] = macd_line
        history['macd_signal'] = macd_signal

        bb_upper, bb_middle, bb_lower = compute_bollinger_series(closes, period=20)
        history['bb_upper'] = bb_upper
        history['bb_middle'] = bb_middle
        history['bb_lower'] = bb_lower

        history['ema50'] = compute_ema_series(closes, 50)
        history['ema100'] = compute_ema_series(closes, 100)
        history['ema200'] = compute_ema_series(closes, 200)
    except Exception:
        history = {}
        vol_24h = None

    # Si no hay historial real, construir una historia sintética basada en el precio actual
    if not history.get('closes'):
        try:
            current = indicators.get('close')
            if current is not None:
                base = float(current)
                synthetic = []
                opens = []
                highs = []
                lows = []
                prev_close = base
                for i in range(50):
                    noise = 1 + 0.002 * math.sin(i / 3.0)
                    close = base * noise
                    open_ = prev_close
                    high = max(open_, close) * 1.0005
                    low = min(open_, close) * 0.9995
                    synthetic.append(close)
                    opens.append(open_)
                    highs.append(high)
                    lows.append(low)
                    prev_close = close
                history['closes'] = synthetic
                history['opens'] = opens
                history['highs'] = highs
                history['lows'] = lows
                # Adjust timestamps based on interval approximate seconds
                secs = interval_seconds(interval_str)
                history['times'] = [int(time.time()) - (50 - i) * secs for i in range(50)]
                history['rsi'] = compute_rsi_series(history['closes'], period=14)
                macd_line, macd_signal = compute_macd_series(history['closes'], fast=12, slow=26, signal=9)
                history['macd'] = macd_line
                history['macd_signal'] = macd_signal
                bb_upper, bb_middle, bb_lower = compute_bollinger_series(history['closes'], period=20)
                history['bb_upper'] = bb_upper
                history['bb_middle'] = bb_middle
                history['bb_lower'] = bb_lower
                history['ema50'] = compute_ema_series(history['closes'], 50)
                history['ema100'] = compute_ema_series(history['closes'], 100)
                history['ema200'] = compute_ema_series(history['closes'], 200)

                # Estimacion de volumen 24h: volumen de la vela actual extrapolado a 24h
                bar_vol = indicators.get('volume')
                if bar_vol is not None and vol_24h is None:
                    vol_24h = float(bar_vol) * max(1, 86400 // secs)
        except Exception:
            history = {}

    return {
        'symbol': symbol,
        'market': market,
        'precio': indicators.get('close'),
        'decimales': 8 if 'PEPE' in symbol else 2,
        'rsi': indicators.get('RSI'),
        'rsiStoch': indicators.get('Stoch.RSI.K'),
        'volumen': vol_24h if vol_24h is not None else indicators.get('volume'),
        'bbUpper': indicators.get('BB.upper'),
        'bbMiddle': indicators.get('SMA20') or indicators.get('BB.middle'),
        'bbLower': indicators.get('BB.lower'),
        'macdValue': indicators.get('MACD.macd'),
        'macdSignal': indicators.get('MACD.signal'),
        'adx': indicators.get('ADX'),
        'stochK': indicators.get('Stoch.K'),
        'stochD': indicators.get('Stoch.D'),
        'cci': indicators.get('CCI20'),
        'ema50': indicators.get('EMA50'),
        'ema100': indicators.get('EMA100'),
        'ema200': indicators.get('EMA200'),
        's1': indicators.get('Pivot.M.Classic.S1'),
        's2': indicators.get('Pivot.M.Classic.S2'),
        's3': indicators.get('Pivot.M.Classic.S3'),
        'r1': indicators.get('Pivot.M.Classic.R1'),
        'r2': indicators.get('Pivot.M.Classic.R2'),
        'r3': indicators.get('Pivot.M.Classic.R3'),
        'buySignals': analysis.summary.get('BUY'),
        'sellSignals': analysis.summary.get('SELL'),
        'neutralSignals': analysis.summary.get('NEUTRAL'),
        'timeframe': interval_str,
        'history': history
    }


# REALIZA UNA PETICION A LA API DE BINANCE PARA OBTENER KLINES (OHLCV)
# data-api.binance.vision es el endpoint publico de market data y NO esta
# bloqueado geograficamente (api.binance.com da 403 desde IPs de EE.UU.,
# por lo que en Render/Railway/Fly fallaba)
def fetch_klines(symbol, interval='15m', limit=100):
    url = 'https://data-api.binance.vision/api/v3/klines'
    params = {'symbol': symbol, 'interval': interval, 'limit': limit}
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
        '5m': ('5m', '30d'),
        '15m': ('15m', '1mo'),
        '1h': ('1h', '3mo'),
        '4h': ('1h', '1mo'),
        '1d': ('1d', '1y'),
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

# RETORNA DATOS DE TRADING CACHEADOS CON STALE-WHILE-REVALIDATE + RATE GOVERNOR + BACKOFF
def get_trading_cached(symbol, interval_str='15m', market='crypto'):
    cache_key = f"{market}:{symbol}_{interval_str}"
    now = time.time()
    entry = cache.get(cache_key)

    # Si el simbolo esta en backoff por rate limit previo, devolver stale data sin preguntar
    if is_symbol_backoff(cache_key):
        if entry and 'data' in entry:
            logger.info(f"[Backoff] {cache_key} en backoff, sirviendo stale data")
            return entry['data']
        elif entry and 'error' in entry:
            raise Exception('429: TradingView Rate Limit Exceeded (Cached)')

    # Cache FRESCO: devolver inmediato
    if entry and now - entry['ts'] <= CACHE_TTL:
        if 'error' in entry:
            raise Exception('429: TradingView Rate Limit Exceeded (Cached)')
        return entry['data']

    # Cache STALE pero dentro de STALE_TTL: servir stale y refrescar en background
    if entry and 'data' in entry and now - entry['ts'] <= STALE_TTL:
        # Verificar si ya hay una peticion en vuelo para este cache_key
        if cache_key in in_flight:
            return entry['data']
        # Intentar refresh en background (no bloqueante)
        if tv_rate_governor():
            def refresh():
                try:
                    data = fetch_from_ta(symbol, interval_str, market)
                    with cache_lock:
                        cache[cache_key] = {'data': data, 'ts': time.time()}
                    logger.info(f"[StaleRefresh] {cache_key} refrescado en background")
                except Exception as e:
                    logger.warning(f"[StaleRefresh] {cache_key} fallo: {e}")
            t = threading.Thread(target=refresh, daemon=True)
            t.start()
        return entry['data']

    # Cache EXPIRADA o no existe: refrescar sincronicamente con rate governing
    # Verificar dedup: si hay una peticion en vuelo, esperar
    flight_result = wait_for_in_flight(cache_key)
    if flight_result:
        return flight_result

    # Verificar rate governor global
    if not tv_rate_governor():
        if entry and 'data' in entry:
            logger.warning(f"[RateGovernor] {cache_key} diferido por rate global, sirviendo stale")
            return entry['data']
        raise Exception('429: TradingView global rate limit exceeded')

    # Verificar backoff por simbolo
    if is_symbol_backoff(cache_key):
        if entry and 'data' in entry:
            return entry['data']
        raise Exception('429: TradingView Rate Limit Exceeded (Backoff)')

    lock = get_symbol_lock(cache_key)
    with lock:
        entry = cache.get(cache_key)
        if entry and now - entry['ts'] <= CACHE_TTL:
            if 'error' in entry:
                raise Exception('429: TradingView Rate Limit Exceeded (Cached)')
            return entry['data']
        if entry and 'data' in entry and now - entry['ts'] <= STALE_TTL:
            return entry['data']

        event, result_container = set_in_flight(cache_key)
        try:
            data = fetch_from_ta(symbol, interval_str, market)
            cache[cache_key] = {'data': data, 'ts': time.time()}
            clear_in_flight(cache_key, {'data': data})
            return data
        except Exception as e:
            clear_in_flight(cache_key)
            if '429' in str(e):
                logger.warning(f"Rate limit hit for {cache_key}. Marking backoff.")
                mark_symbol_backoff(cache_key)
                if entry and 'data' in entry:
                    cache[cache_key]['ts'] = time.time() + CACHE_TTL
                    return entry['data']
                else:
                    cache[cache_key] = {'error': '429', 'ts': time.time() + 300}
            raise


@app.route('/api/trading/<symbol>')
# ENDPOINT: OBTIENE DATOS DE TRADING PARA UN SIMBOLO, APLICANDO RATE LIMIT POR IP
def get_trading_data(symbol):
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    interval = request.args.get('interval', '15m')
    market = request.args.get('market', 'crypto')
    if market not in ('crypto', 'stock'):
        market = 'crypto'
    try:
        data = get_trading_cached(symbol, interval, market)
        return jsonify(data)
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

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    socketio.run(app, port=port, debug=debug, host='0.0.0.0', allow_unsafe_werkzeug=True)
