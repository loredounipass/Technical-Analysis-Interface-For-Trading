from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_socketio import SocketIO
import time
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
import datetime
import pandas as pd
import pandas_ta as ta
import numpy as np
from dotenv import load_dotenv

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

from nvidia_chat import nvidia_chat, AVAILABLE_MODELS
from tts_nvidia import synthesize_speech

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

# Recolector de basura para evitar fuga de memoria con IPs inactivas
def _rate_limiter_gc():
    while True:
        time.sleep(RATE_WINDOW * 2)
        now = time.time()
        with ip_lock:
            stale = [ip for ip, arr in ip_requests.items() if not arr or now - arr[-1] > RATE_WINDOW]
            for ip in stale:
                del ip_requests[ip]

threading.Thread(target=_rate_limiter_gc, daemon=True).start()
# CREA O RETORNA UN LOCK ESPECIFICO PARA UN SIMBOLO PARA SINCRONIZAR ACCESOS
def get_symbol_lock(symbol):
    with cache_lock:
        if symbol not in locks:
            locks[symbol] = threading.Lock()
        return locks[symbol]


# DEDUPLICACION DE PETICIONES EN VUELO
        'decimales': price_decimals(precio),
        'rsi': last_non_none(rsi_series),
        'rsiStoch': last_non_none(stoch_rsi_k),
        'volumen': vol_24h if vol_24h is not None else (quote_volumes[-1] if quote_volumes else None),
        'bbUpper': last_non_none(bb_upper),
        'bbMiddle': last_non_none(bb_middle),
        'bbLower': last_non_none(bb_lower),
        'macdValue': last_non_none(macd_line),
        'macdSignal': last_non_none(macd_signal),
        'macdHistogram': macd_hist,
        'adx': last_non_none(adx),
        'plusDi': last_non_none(plus_di),
        'minusDi': last_non_none(minus_di),
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


# Timeframes disponibles para el contexto multi-temporalidad del agente
MTF_TIMEFRAMES = ('1m', '5m', '15m', '1h', '4h', '1d')


def _build_multi_timeframe_context(symbol, current_interval, market):
    """Snapshots compactos del MISMO activo en TODAS las temporalidades para
    que el agente compare alineacion de tendencias entre marcos. Lee de la
    cache de get_trading_cached (throttle REFRESH_MIN_GAP): la primera llamada
    por timeframe puede hacer un fetch REST, las siguientes son instantaneas."""
    snapshots = []
    for tf in MTF_TIMEFRAMES:
        if tf == current_interval:
            continue
        try:
            d = get_trading_cached(symbol, tf, market)
        except Exception as e:
            logger.warning(f"[Chat] MTF fallo {symbol} {tf} ({market}): {e}")
            continue
        if not d or not isinstance(d, dict) or d.get('precio') is None:
            continue
        hist = d.get('history') or {}
        times = hist.get('times') or []
        snapshots.append({
            'timeframe': tf,
            'precio': d.get('precio'),
            'rsi': d.get('rsi'),
            'stochK': d.get('stochK'),
            'stochD': d.get('stochD'),
            'macdHistogram': d.get('macdHistogram'),
            'adx': d.get('adx'),
            'cci': d.get('cci'),
            'ema50': d.get('ema50'),
            'bbUpper': d.get('bbUpper'),
            'bbLower': d.get('bbLower'),
            'buySignals': d.get('buySignals'),
            'sellSignals': d.get('sellSignals'),
            'neutralSignals': d.get('neutralSignals'),
            'ts': times[-1] if times else None,
        })
    return snapshots


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
        # El agente tambien ve el MISMO activo en TODAS las temporalidades
        # (snapshots compactos desde la cache) para evaluar alineacion de
        # tendencias entre marcos: la primera llamada por timeframe puede
        # hacer un fetch REST, las siguientes son instantaneas.
        indicator_data['multi_timeframe'] = _build_multi_timeframe_context(
            symbol, interval, market
        )
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


@app.route('/api/tts', methods=['POST'])
def tts_endpoint():
    """Text-to-speech synthesis using NVIDIA magpie-tts-zeroshot."""
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429
    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'text is required'}), 400
    try:
        wav_bytes = synthesize_speech(text)
        return wav_bytes, 200, {'Content-Type': 'audio/wav'}
    except RuntimeError as e:
        return jsonify({'error': str(e)}), 502
    except Exception as e:
        return jsonify({'error': f'TTS error: {str(e)}'}), 500


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

# STREAMING DE STOCKS VIA YAHOO FINANCE WS (wss://streamer.finance.yahoo.com):
# solo llegan QUOTES (protobuf en base64) cuando hay cambios reales de
# cotizacion. El WS actualiza el cierre de la vela viva y recalcula el payload;
# si Yahoo no envia nada (fin de semana, feriado), el polling REST sigue como
# respaldo sin ningun cambio de comportamiento.
from yahoo_stream import init_yahoo_stream

init_yahoo_stream(
    socketio,
    {
        'fetch_klines_vol': lambda s, iv, m: _fetch_klines_and_volume(s, iv, m),
        'build_payload': lambda s, iv, m, k, v: build_payload(s, iv, m, k, v),
        'store_payload': _store_stream_payload,
        'has_subscribers': lambda room: room in subscriber_rooms,
    },
    sorted(STOCK_SYMBOLS),
    ['1m', '5m', '15m', '1h', '4h', '1d'],
)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    socketio.run(app, port=port, debug=debug, host='0.0.0.0', allow_unsafe_werkzeug=True)
