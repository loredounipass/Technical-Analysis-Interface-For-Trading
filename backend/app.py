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
CORS(app, resources={
    r"/*": {
        "origins": ["http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="http://localhost:3000", async_mode='threading')

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
def fetch_from_ta(symbol, interval_str='15m'):
    tv_interval = INTERVAL_MAP.get(interval_str, Interval.INTERVAL_15_MINUTES)
    
    handler = TA_Handler(
        symbol=symbol,
        screener="crypto",
        exchange="BINANCE",
        interval=tv_interval
    )
    analysis = handler.get_analysis()
    indicators = analysis.indicators
    history = {}

    # Intentar obtener klines y calcular series históricas
    try:
        klines = fetch_klines(symbol, interval=interval_str, limit=300)
        opens = [float(k[1]) for k in klines]
        highs = [float(k[2]) for k in klines]
        lows = [float(k[3]) for k in klines]
        closes = [float(k[4]) for k in klines]
        timestamps = [int(k[0]) for k in klines]
        
        history['opens'] = opens
        history['highs'] = highs
        history['lows'] = lows
        history['closes'] = closes
        history['times'] = timestamps

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

    # Si no hay historial real, construir una historia sintética basada en el precio actual
    if not history.get('closes'):
        try:
            current = indicators.get('close')
            if current is not None:
                base = float(current)
                synthetic = []
                for i in range(50):
                    noise = 1 + 0.002 * math.sin(i / 3.0)
                    synthetic.append(base * noise)
                history['closes'] = synthetic
                # Adjust timestamps based on interval approximate seconds
                interval_seconds = 900 # default 15m
                if interval_str == "1m": interval_seconds = 60
                elif interval_str == "5m": interval_seconds = 300
                elif interval_str == "1h": interval_seconds = 3600
                elif interval_str == "4h": interval_seconds = 14400
                elif interval_str == "1d": interval_seconds = 86400

                history['times'] = [int(time.time()) - (50 - i) * interval_seconds for i in range(50)]
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
        except Exception:
            history = {}

    return {
        'precio': indicators.get('close'),
        'decimales': 8 if 'PEPE' in symbol else 2,
        'rsi': indicators.get('RSI'),
        'rsiStoch': indicators.get('Stoch.RSI.K'),
        'volumen': indicators.get('volume'),
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
def fetch_klines(symbol, interval='15m', limit=100):
    url = 'https://api.binance.com/api/v3/klines'
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
def get_trading_cached(symbol, interval_str='15m'):
    cache_key = f"{symbol}_{interval_str}"
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
                    data = fetch_from_ta(symbol, interval_str)
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
            data = fetch_from_ta(symbol, interval_str)
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
    try:
        data = get_trading_cached(symbol, interval)
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
    now = time.time()
    cached = NEWS_CACHE.get(symbol)
    if cached and now - cached['ts'] <= NEWS_CACHE_TTL:
        return jsonify(cached['articles'])

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
    history = data.get('history', [])
    global_context = data.get('global_context', '')
    temperature = data.get('temperature', 0.3)

    # Fetch the latest indicator data for the current symbol
    indicator_data = None
    try:
        indicator_data = get_trading_cached(symbol, interval)
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
    socketio.run(app, port=5000, debug=True, host='127.0.0.1')
