"""Cache con stale-while-revalidate, rate limiting por IP y deduplicación
de peticiones en vuelo.

Estado compartido (dicts + locks) que coordina la concurrencia entre el hilo
principal de Flask, los hilos de polling del socket y los streams de Binance/Yahoo.
NO depende de Flask (excepto para rate_limited que recibe la IP como string).
"""

import os
import time
import threading
import logging

from common import market_store

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
    """Espera la peticion en vuelo de `cache_key` y devuelve su dato si termino.

    Devuelve None cuando no hay nada en vuelo, cuando el dueno fallo o cuando
    vencio el timeout: en esos casos el llamador sigue su camino normal (re-check
    del cache / fetch propio). Despues del wait NO se vuelve a leer `in_flight`
    porque podria contener el registro de OTRA peticion distinta a la esperada.
    """
    with in_flight_lock:
        if cache_key not in in_flight:
            return None
        event, result_container = in_flight[cache_key]
    event.wait(timeout)
    return result_container.get('data')


def set_in_flight(cache_key):
    """Registra la peticion en vuelo de `cache_key`.

    No devuelve nada a proposito: el event y el contenedor viven en `in_flight`,
    y es desde alli desde donde `clear_in_flight` los usa para entregar el dato a
    los esperantes (el contenedor se muta en el sitio, no se reemplaza). El que
    hace el fetch no necesita ninguna referencia local.
    """
    event = threading.Event()
    result_container = {}
    with in_flight_lock:
        in_flight[cache_key] = (event, result_container)


def clear_in_flight(cache_key, payload=None):
    """Cierra la peticion en vuelo y le entrega el dato a los esperantes.

    `payload` llega como {'data': ...} (la forma que guarda el cache). El
    contenedor registrado esta VACIO hasta aqui, por eso se escribe sin mirar su
    verdad: con un `if container` anterior nunca se escribia, los esperantes
    recibian None y vuelta a ir al exchange (el refresh manual se duplicaba).
    """
    with in_flight_lock:
        entry = in_flight.pop(cache_key, None)
        if not entry:
            return
        evt, container = entry
        if payload is not None:
            container['data'] = payload.get('data')
        evt.set()


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
CRYPTO_SYMBOLS = {"BTCUSDT", "ETHUSDT", "SOLUSDT", "PEPEUSDT", "BNBUSDT", "DOGEUSDT", "XRPUSDT", "SHIBUSDT"}
# Stocks + indices/commodities servidos todos por Yahoo Finance (market='stock').
# ^NDX = Nasdaq-100, GC=F = futuro de oro COMEX, EURUSD=X = par forex.
# Se enrutan igual que las acciones porque fetch_yahoo_chart usa el endpoint
# generico de chart de Yahoo.
STOCK_SYMBOLS = {"AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "NFLX", "AMD", "INTC", "LMT", "^NDX", "GC=F", "EURUSD=X"}


# Cuanto espera la API al feeder cuando la clave aun no esta sembrada en Redis.
# Medido contra Binance en vivo: el seed en frio de ETHUSDT 15m tardó
# 16.3 s (klines + libro + indicadores), el mismo trabajo sincronico que la API
# ya hacia sola en modo memory. El default cubre ese peor caso, ajustable.
STORE_SEED_WAIT = float(os.getenv('STORE_SEED_WAIT_SECONDS', '20'))
STORE_SEED_STEP = 0.2


def _read_from_store(symbol, interval_str, market, provider, force=False):
    """Ruta de lectura Redis: la API nunca consulta el exchange.

    El unico escritor es el feeder worker. Si la clave falta (sala recien abierta
    o arranque en frio), se le pide por pub/sub que siembre y se espera un maximo
    de STORE_SEED_WAIT antes de reportar la indisponibilidad.
    """
    payload = market_store.read_payload(provider, symbol, interval_str)
    if payload is None or force:
        market_store.publish_refresh(
            symbol, interval_str, market, provider,
            reason='manual' if force else 'cold',
        )
        if payload is not None:
            market_store.strip_internal(payload)
            return payload
        deadline = time.time() + STORE_SEED_WAIT
        while time.time() < deadline:
            time.sleep(STORE_SEED_STEP)
            payload = market_store.read_payload(provider, symbol, interval_str)
            if payload is not None:
                market_store.strip_internal(payload)
                return payload
        raise RuntimeError(
            f"El feeder no ha publicado {provider}:{symbol} {interval_str} en Redis. "
            "Verifica que el servicio feeder este corriendo y conectado al exchange."
        )
    # Marcas internas de frescura: no deben filtrarse a la API ni al prompt.
    market_store.strip_internal(payload)
    return payload


def get_trading_cached(symbol, interval_str='15m', market='crypto', force=False,
                       fetch_fn=None, provider='coinbase'):
    """Retorna datos de trading cacheados con stale-while-revalidate.

    ``fetch_fn`` debe ser una callable(symbol, interval_str, market, provider)
    que devuelve el payload completo (se inyecta desde app.py).

    Con MARKET_BACKEND=redis (y rol API) la lectura viene de Redis, escrita por
    el feeder; el cache en memoria y fetch_fn siguen vigentes en modo memory.
    """
    if market == 'stock':
        provider = 'yahoo'
    elif provider not in ('binance', 'coinbase'):
        raise ValueError(f"Proveedor no soportado: {provider}")

    # Validar simbolo ANTES de tocar las fuentes de datos: un par invalido
    # (p.ej. USDTUSDT) quema rate limit y puede tumbar los demas pares
    allowed = STOCK_SYMBOLS if market == 'stock' else CRYPTO_SYMBOLS
    if symbol not in allowed:
        raise ValueError(f"Simbolo no soportado: {symbol}")

    if market_store.redis_active() and not market_store.is_feeder_role():
        return _read_from_store(symbol, interval_str, market, provider, force=force)

    cache_key = (
        f"{market}:{symbol}_{interval_str}"
        if market == 'stock'
        else f"{market}:{provider}:{symbol}_{interval_str}"
    )
    now = time.time()
    entry = cache.get(cache_key)

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
            set_in_flight(cache_key)
            try:
                data = fetch_fn(symbol, interval_str, market, provider)
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
                            data = fetch_fn(symbol, interval_str, market, provider)
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

        set_in_flight(cache_key)
        try:
            data = fetch_fn(symbol, interval_str, market, provider)
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
