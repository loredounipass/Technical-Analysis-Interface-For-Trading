"""Cache con stale-while-revalidate, rate limiting por IP y deduplicación
de peticiones en vuelo.

Estado compartido (dicts + locks) que coordina la concurrencia entre el hilo
principal de Flask, los hilos de polling del socket y los streams de Binance/Yahoo.
NO depende de Flask (excepto para rate_limited que recibe la IP como string).
"""

import time
import threading
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────
# CACHE PRINCIPAL
# ─────────────────────────────────────────────────────────────────────

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


# CREA O RETORNA UN LOCK ESPECIFICO PARA UN SIMBOLO PARA SINCRONIZAR ACCESOS
def get_symbol_lock(symbol):
    with cache_lock:
        if symbol not in locks:
            locks[symbol] = threading.Lock()
        return locks[symbol]


def store_payload(cache_key, data):
    """Guarda un payload en la cache (usado por streams de Binance/Yahoo)."""
    with cache_lock:
        cache[cache_key] = {'data': data, 'ts': time.time(), 'last_refresh': time.time()}


# ─────────────────────────────────────────────────────────────────────
# DEDUPLICACION DE PETICIONES EN VUELO
# ─────────────────────────────────────────────────────────────────────

in_flight = {}
in_flight_lock = threading.Lock()


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


# ─────────────────────────────────────────────────────────────────────
# RATE LIMITING POR IP
# ─────────────────────────────────────────────────────────────────────

RATE_WINDOW = 60
RATE_LIMIT = 60
ip_requests = {}
ip_lock = threading.Lock()
_last_ip_cleanup = 0


# LIMITA LAS PETICIONES POR IP EN UNA VENTANA TEMPORAL; DEVUELVE TRUE SI SE SUPERA EL LIMITE
def rate_limited(ip):
    global _last_ip_cleanup
    now = time.time()
    with ip_lock:
        # Limpieza periodica de IPs huerfanas (cada 60s)
        if now - _last_ip_cleanup > 60:
            _last_ip_cleanup = now
            stale = [k for k, v in ip_requests.items() if now - v[-1] > RATE_WINDOW]
            for k in stale:
                del ip_requests[k]
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


# ─────────────────────────────────────────────────────────────────────
# STALE-WHILE-REVALIDATE
# ─────────────────────────────────────────────────────────────────────

# Whitelist de activos soportados: evita que simbolos invalidos lleguen a las
# fuentes de datos (p.ej. USDTUSDT) y quemen rate limit
CRYPTO_SYMBOLS = {"BTCUSDT", "ETHUSDT", "SOLUSDT", "PEPEUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT"}
STOCK_SYMBOLS = {"AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "NFLX", "AMD", "INTC", "LMT"}


def get_trading_cached(symbol, interval_str='15m', market='crypto', force=False,
                       fetch_fn=None):
    """Retorna datos de trading cacheados con stale-while-revalidate.

    ``fetch_fn`` debe ser una callable(symbol, interval_str, market) que devuelve
    el payload completo (se inyecta desde app.py para evitar imports circulares).
    """
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
                data = fetch_fn(symbol, interval_str, market)
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
        # Verificar si ya hay una peticion en vuelo para este cache_key.
        # El bloque entero se protege con cache_lock para evitar que dos threads
        # pasen simultaneamente el check de REFRESH_MIN_GAP y lancen refreshes
        # duplicados contra la API.
        with cache_lock:
            if cache_key not in in_flight:
                # Refrescar como maximo una vez cada REFRESH_MIN_GAP segundos por cache_key.
                # Sin esta guardia, cada ciclo de polling del socket dispararia la API
                # (Binance/Yahoo) aunque los datos no hayan cambiado.
                last_refresh = entry.get('last_refresh', 0)
                if now - last_refresh >= REFRESH_MIN_GAP:
                    entry['last_refresh'] = now
                    def refresh():
                        try:
                            data = fetch_fn(symbol, interval_str, market)
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
            data = fetch_fn(symbol, interval_str, market)
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
