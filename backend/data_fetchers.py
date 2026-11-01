"""Data fetchers: funciones que obtienen datos de mercado desde APIs externas.

Coinbase Exchange / Advanced Trade (fuente PRIMARIA de crypto: API pública,
sin API key), Binance (fallback de crypto) y Yahoo Finance (stocks).
Funciones puras de I/O: no tocan cache, no dependen de Flask.
"""

import time
import math
import logging
import requests
from datetime import datetime, timezone

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
    quote_volume = None
    try:
        # Coinbase ticker: volume = volumen BASE 24h; quote ~ base * precio
        product = coinbase_product_id(symbol)
        resp = requests.get(
            f'{COINBASE_BASE}/products/{product}/ticker',
            headers=COINBASE_HEADERS, timeout=8,
        )
        resp.raise_for_status()
        td = resp.json()
        quote_volume = float(td['volume']) * float(td['price'])
    except Exception as e:
        logger.warning(f"[TradingData] Coinbase ticker 24h fallo para {symbol}: {e}")
    if quote_volume is None:
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


# ─────────────────────────────────────────────────────────────────────
# COINBASE (fuente primaria de crypto: API pública, sin API key)
# ─────────────────────────────────────────────────────────────────────
COINBASE_BASE = 'https://api.exchange.coinbase.com'
COINBASE_ADV_BASE = 'https://api.coinbase.com/api/v3/brokerage/market'
COINBASE_HEADERS = {'User-Agent': 'woody-quant/1.0', 'Accept': 'application/json'}
# Granularidad en segundos que acepta /products/{id}/candles
COINBASE_GRANULARITY = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '4h': 21600, '1d': 86400}
COINBASE_PAGE = 300  # max velas por peticion de /candles


def coinbase_product_id(symbol):
    """BTCUSDT -> BTC-USD (Coinbase cotiza contra USD, no USDT)."""
    base = symbol[:-4] if symbol.endswith('USDT') else symbol
    return f"{base}-USD"


# ORDER FLOW: cache rolling de trades ejecutados. Coinbase reporta `side`
# como el lado del MAKER; se invierte para obtener el lado del agresor.
ORDER_FLOW_TTL = 15
ORDER_FLOW_CACHE_SIZE = 1000
_order_flow_cache = {}
_order_flow_lock = threading.Lock()


def _normalize_order_flow_trade(trade):
    try:
        price = float(trade['price'])
        size = float(trade['size'])
        maker_side = str(trade['side']).lower()
        if (
            not math.isfinite(price) or not math.isfinite(size)
            or price <= 0 or size <= 0 or maker_side not in ('buy', 'sell')
        ):
            return None
        raw_time = trade.get('time')
        if isinstance(raw_time, (int, float)):
            time_ms = int(raw_time * 1000 if raw_time < 1e12 else raw_time)
        else:
            time_text = str(raw_time or '')
            if time_text.endswith('Z'):
                time_text = time_text[:-1] + '+00:00'
            parsed = datetime.fromisoformat(time_text)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            time_ms = int(parsed.timestamp() * 1000)
        trade_id = str(trade.get('trade_id') or f'{time_ms}-{price}-{size}-{maker_side}')
        return {
            'id': trade_id,
            'time': time_ms,
            'side': 'sell' if maker_side == 'buy' else 'buy',
            'makerSide': maker_side,
            'price': price,
            'size': size,
        }
    except (KeyError, TypeError, ValueError, OverflowError):
        return None


def record_order_flow_trade(symbol, trade):
    """Agrega un trade real del WebSocket sin duplicar `last_match`."""
    normalized = _normalize_order_flow_trade(trade)
    if normalized is None:
        return False
    with _order_flow_lock:
        entry = _order_flow_cache.setdefault(symbol, {
            'trades': [], 'ids': set(), 'updated': time.time(), 'seeded': False,
        })
        if normalized['id'] in entry['ids']:
            return False
        entry['trades'].append(normalized)
        entry['ids'].add(normalized['id'])
        if len(entry['trades']) > ORDER_FLOW_CACHE_SIZE:
            removed = entry['trades'].pop(0)
            entry['ids'].discard(removed['id'])
        entry['updated'] = time.time()
    return True


def get_order_flow_trades(symbol, limit=200):
    """Devuelve trades reales ordenados; siembra por REST y actualiza por WS."""
    now = time.time()
    with _order_flow_lock:
        cached = _order_flow_cache.get(symbol)
        is_stale = (
            not cached or not cached.get('seeded')
            or now - cached['updated'] > ORDER_FLOW_TTL
        )

    if is_stale:
        try:
            product = coinbase_product_id(symbol)
            resp = requests.get(
                f'{COINBASE_BASE}/products/{product}/trades',
                params={'limit': 500},
                headers=COINBASE_HEADERS,
                timeout=10,
            )
            resp.raise_for_status()
            rows = resp.json()
            normalized = [
                trade for trade in (_normalize_order_flow_trade(row) for row in rows)
                if trade is not None
            ] if isinstance(rows, list) else []
            with _order_flow_lock:
                existing = _order_flow_cache.get(symbol, {}).get('trades', [])
                merged = {trade['id']: trade for trade in existing}
                merged.update({trade['id']: trade for trade in normalized})
                trades = sorted(
                    merged.values(), key=lambda trade: (trade['time'], trade['id'])
                )[-ORDER_FLOW_CACHE_SIZE:]
                _order_flow_cache[symbol] = {
                    'trades': trades,
                    'ids': {trade['id'] for trade in trades},
                    'updated': time.time(),
                    'seeded': True,
                }
        except Exception as e:
            logger.warning(f"[TradingData] order flow fallo para {symbol}: {e}")

    with _order_flow_lock:
        entry = _order_flow_cache.get(symbol)
        return list(entry['trades'][-limit:]) if entry else []


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


# LIBRO DE ÓRDENES REAL (Binance depth). El endpoint devuelve hasta 100 niveles
# de bids/asks; se suman los 20 primeros niveles de cada lado para calcular la
# dominancia compradora real. Tiene sub-cache propia: el depth pesa 5 weight y
# los ciclos de streaming lo consultan muy seguido.
DEPTH_TTL = 12
_depth_cache = {}
_depth_lock = threading.Lock()


def fetch_order_book_depth(symbol):
    """Devuelve el libro de órdenes real:
    {'bids': [[price, qty], ...], 'asks': [[price, qty], ...]}.
    Fuente primaria: Coinbase Advanced Trade (público, limit configurable).
    Fallback: Binance depth. None si ambos fallan (proxy de volumen)."""
    now = time.time()
    with _depth_lock:
        cached = _depth_cache.get(symbol)
        if cached and now - cached[0] <= DEPTH_TTL:
            return cached[1]
    data = None
    try:
        product = coinbase_product_id(symbol)
        resp = requests.get(
            f'{COINBASE_ADV_BASE}/product_book',
            params={'product_id': product, 'limit': 50},
            headers=COINBASE_HEADERS,
            timeout=10,
        )
        resp.raise_for_status()
        book = resp.json().get('pricebook', {})
        bids = [[b['price'], b['size']] for b in book.get('bids', [])]
        asks = [[a['price'], a['size']] for a in book.get('asks', [])]
        if bids and asks:
            data = {'bids': bids, 'asks': asks}
    except Exception as e:
        logger.warning(f"[TradingData] Coinbase book fallo para {symbol}: {e}")
    if data is None:
        try:
            resp = requests.get(
                'https://data-api.binance.vision/api/v3/depth',
                params={'symbol': symbol, 'limit': 100},
                timeout=8,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            logger.warning(f"[TradingData] Binance depth fallo para {symbol}: {e}")
            return None
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
        bars.append([ts, open_, high, low, close, volume, close, volume])

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
    try:
        product = coinbase_product_id(symbol)
        r = requests.get(
            f'{COINBASE_BASE}/products/{product}/ticker',
            headers=COINBASE_HEADERS, timeout=8,
        )
        r.raise_for_status()
        return float(r.json()['price'])
    except Exception as e:
        logger.warning(f"[TradingData] Coinbase last price fallo para {symbol}: {e}")
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
            try:
                klines = fetch_coinbase_klines(symbol, interval_str)
            except Exception as e:
                logger.warning(f"[TradingData] Coinbase klines fallo para {symbol}, usando Binance: {e}")
                klines = None
            if klines is None:
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
