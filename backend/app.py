from flask import Flask, jsonify, request
from flask_cors import CORS
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
    r"/api/*": {
        "origins": ["http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

@app.before_request
def log_request_info():
    logger.info("--- NUEVA PETICIÓN ---")
    logger.info(f"Origin: {request.headers.get('Origin')}")
    logger.info(f"Method: {request.method}")
    logger.info(f"URL: {request.url}")
    logger.info("----------------------")

CACHE_TTL = 15
cache = {}
locks = {}
cache_lock = threading.Lock()

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
# OBTIENE ANALISIS DE TRADINGVIEW Y CALCULA SERIES TECNICAS ADICIONALES (RSI, MACD, BB, EMAs)
def fetch_from_ta(symbol):
    handler = TA_Handler(
        symbol=symbol,
        screener="crypto",
        exchange="BINANCE",
        interval=Interval.INTERVAL_15_MINUTES
    )
    analysis = handler.get_analysis()
    indicators = analysis.indicators
    history = {}

    # Intentar obtener klines y calcular series históricas
    try:
        klines = fetch_klines(symbol, interval='15m', limit=300)
        closes = [float(k[4]) for k in klines]
        timestamps = [int(k[0]) for k in klines]
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
                history['times'] = [int(time.time()) - (50 - i) * 900 for i in range(50)]
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

# RETORNA DATOS DE TRADING CACHEADOS PARA UN SIMBOLO, O ACTUALIZA LA CACHE SI ES NECESARIO
def get_trading_cached(symbol):
    now = time.time()
    entry = cache.get(symbol)
    if entry and now - entry['ts'] <= CACHE_TTL:
        return entry['data']

    lock = get_symbol_lock(symbol)
    with lock:
        entry = cache.get(symbol)
        if entry and now - entry['ts'] <= CACHE_TTL:
            return entry['data']

        data = fetch_from_ta(symbol)
        cache[symbol] = {'data': data, 'ts': time.time()}
        return data


@app.route('/api/trading/<symbol>')
# ENDPOINT: OBTIENE DATOS DE TRADING PARA UN SIMBOLO, APLICANDO RATE LIMIT POR IP
def get_trading_data(symbol):
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    try:
        data = get_trading_cached(symbol)
        return jsonify(data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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
    history = data.get('history', [])
    temperature = data.get('temperature', 0.3)

    # Fetch the latest indicator data for the current symbol
    indicator_data = None
    try:
        indicator_data = get_trading_cached(symbol)
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


if __name__ == '__main__':
    app.run(port=5000, debug=True, threaded=True)
