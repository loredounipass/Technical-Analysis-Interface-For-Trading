"""Tienda de datos de mercado respaldada por Redis (esquema tiered).

Motivo del split por tiers (medido con un payload real de ETHUSDT 15m):
    payload completo  : 98.9 KB gzip   -> inaceptable reescribirlo cada 1.5s
    tier caliente     :  3.2 KB gzip   (indicadores, precio, book, order flow)
    tier historico    : 95.7 KB gzip   (28 series x 500 velas para los graficos)

El tier caliente se reescribe en cada tick del stream; el historico SOLO cuando
cierra la vela (o cuando falta en Redis). Asi el feeder puede actualizar
96 claves (8 simbolos x 6 temporalidades x 2 proveedores) sin convertir a Redis
en el cuello de botella.

Esquema de claves:
    ta:snap:{provider}:{symbol}:{interval}   String gzip JSON  (TTL 180s)
    ta:hist:{provider}:{symbol}:{interval}   String gzip JSON  (TTL 1h)
    ta:tape:{provider}:{symbol}              Stream (MAXLEN 1000)
    ta:rooms                                 ZSet miembro '{nodo}|{sala}' -> score
                                             (lease: expira si el nodo deja de latir)
Canales:
    ta:updates    notifica payload nuevo por sala (los API emiten a sus clientes)
    ta:commands   pedidos de refresh manual (la API no consulta el exchange)
"""

import json
import gzip
import os
import time
import logging
import threading
import uuid

from common.redis_client import get_redis, market_backend, is_feeder_role

logger = logging.getLogger(__name__)

SNAPSHOT_TTL = 180
HISTORY_TTL = 3600
TAPE_MAX_LEN = 1000
TAPE_TTL = 3600

SNAPSHOT_PREFIX = 'ta:snap'
HISTORY_PREFIX = 'ta:hist'
TAPE_PREFIX = 'ta:tape'
ROOMS_KEY = 'ta:rooms'
CHANNEL_UPDATES = 'ta:updates'
CHANNEL_COMMANDS = 'ta:commands'

# Identidad del proceso: cada replica mantiene su propio lease, asi el cierre de
# una sala en un nodo no apaga la sala que otros nodos siguen mirando.
NODE_ID = os.getenv('TASK_ID') or uuid.uuid4().hex[:8]

# Un contador HINCRBY se queda para siempre si el proceso muere (reinicio de
# Render/contenedor) y el feeder recalceria salas que nadie mira. Con lease se
# auto-poda: si el nodo deja de latir, la sala expira sola.
ROOM_LEASE_SECONDS = int(os.getenv('ROOM_LEASE_SECONDS', '90'))
ROOM_HEARTBEAT_SECONDS = int(os.getenv('ROOM_HEARTBEAT_SECONDS', '30'))

# El tier historico es lo unico que se excluye del snapshot caliente. OJO: no
# puede escribirse solo al cerrar vela, porque dentro de `history` viven las
# velas y las series de RSI/MACD/BB/EMA, que cambian DENTRO de la vela en
# formacion; el feeder lo reescribe en cada tick para que el grafico se mueva.
HOT_EXCLUDED_FIELDS = ('history',)

# Marca interna de frescura que agrega el store al persistir. NO debe salir nunca
# a la API HTTP, al socket ni al prompt del modelo.
STAMP_FIELD = '_stored_ts'

# Los streams invocan has_subscribers() por cada trade recibido (decenas por
# segundo). Sin cache, eso seria un HGETALL por trade; se sirve una copia local
# brevissima que cuesta 1 lectura por intervalo.
_ROOMS_CACHE_TTL = 1.0
_rooms_cache = {'data': {}, 'ts': 0.0}
_rooms_cache_lock = threading.Lock()


def redis_active():
    """True si la capa Redis esta habilitada y accesible."""
    return market_backend() == 'redis' and get_redis() is not None


__all__ = [
    'redis_active', 'is_feeder_role', 'market_backend',
    'snapshot_key', 'history_key', 'tape_key', 'normalize_provider_symbol',
    'write_payload',
    'read_snapshot', 'read_payload', 'snapshot_age', 'feed_health',
    'strip_internal',
    'tape_append', 'tape_read', 'tape_last_time',
    'room_register', 'room_release', 'room_heartbeat', 'rooms_prune',
    'has_subscribers', 'active_rooms',
    'publish_refresh', 'subscribe_updates', 'subscribe_commands',
]


def _dump(obj):
    return gzip.compress(json.dumps(obj, default=str, separators=(',', ':')).encode('utf-8'))


def _load(raw):
    if not raw:
        return None
    try:
        return json.loads(gzip.decompress(raw).decode('utf-8'))
    except Exception as e:
        logger.warning(f"[Redis] payload corrupto en Redis: {e}")
        return None


def snapshot_key(provider, symbol, interval):
    return f'{SNAPSHOT_PREFIX}:{provider}:{symbol}:{interval}'


def history_key(provider, symbol, interval):
    return f'{HISTORY_PREFIX}:{provider}:{symbol}:{interval}'


def tape_key(provider, symbol):
    return f'{TAPE_PREFIX}:{provider}:{symbol}'


def normalize_provider_symbol(provider, symbol):
    """Normaliza la identidad del feed: crypto siempre mayuscula (ETHUSDT)."""
    market = 'stock' if provider == 'yahoo' else 'crypto'
    normalized = 'yahoo' if market == 'stock' else (provider or 'coinbase')
    return normalized, (symbol or '').upper(), market


# ─────────────────────────────────────────────────────────────────────
# ESCRITURA (solo el feeder worker usa estas funciones)
# ─────────────────────────────────────────────────────────────────────

def write_payload(provider, symbol, interval, payload, include_history=False):
    """Publica el tier caliente y, opcionalmente, el historico. Notifica la sala.

    Devuelve False si Redis no esta activo (el llamador conserva su cache en
    memoria como respaldo).
    """
    client = get_redis()
    if client is None or not isinstance(payload, dict):
        return False
    provider, symbol, _ = normalize_provider_symbol(provider, symbol)
    stored_at = time.time()
    hot = {k: v for k, v in payload.items() if k not in HOT_EXCLUDED_FIELDS}
    hot[STAMP_FIELD] = stored_at
    history = payload.get('history')
    with_history = include_history and isinstance(history, dict) and history
    pipe = client.pipeline()
    pipe.set(snapshot_key(provider, symbol, interval), _dump(hot), ex=SNAPSHOT_TTL)
    if with_history:
        pipe.set(history_key(provider, symbol, interval),
                 _dump(history), ex=HISTORY_TTL)
    else:
        # Se renueva el TTL del historico en cada tick: si no, una sala de 1d o
        # 6h (cierre de vela lento) perderia sus velas al vencer HISTORY_TTL y el
        # frontend se quedaria con el grafo vacio aunque el feed siga vivo.
        pipe.expire(history_key(provider, symbol, interval), HISTORY_TTL)
    market = payload.get('market') or ('stock' if provider == 'yahoo' else 'crypto')
    # Coincide con la sala que arma el frontend: `${market}:${provider}:${symbol}:${interval}`.
    room = f'{market}:{provider}:{symbol}:{interval}'
    pipe.publish(CHANNEL_UPDATES, json.dumps({
        'room': room, 'provider': provider, 'symbol': symbol,
        'interval': interval, 'ts': stored_at,
    }))
    try:
        pipe.execute()
    except Exception as e:
        logger.warning(f"[Redis] escritura de tier fallo para {room}: {e}")
        return False
    return True


# ─────────────────────────────────────────────────────────────────────
# LECTURA (API HTTP, sockets y agente de chat)
# ─────────────────────────────────────────────────────────────────────

def strip_internal(payload):
    """Elimina las marcas internas de frescura (mutando y devolviendo el dict).

    Se llama en los dos unicos caminos de salida (HTTP/agent y socket), asi
    ninguna lectura puede filtrar `_stored_ts` al frontend o al modelo.
    """
    if isinstance(payload, dict):
        payload.pop(STAMP_FIELD, None)
    return payload


def read_snapshot(provider, symbol, interval):
    """Tier caliente: suficiente para el agente, PriceCard y paneles."""
    client = get_redis()
    if client is None:
        return None
    provider, symbol, _ = normalize_provider_symbol(provider, symbol)
    try:
        return _load(client.get(snapshot_key(provider, symbol, interval)))
    except Exception as e:
        logger.warning(f"[Redis] lectura de snapshot fallo: {e}")
        return None


def read_payload(provider, symbol, interval, include_history=True):
    """Snapshot + historico, en la forma exacta que espera el frontend."""
    snapshot = read_snapshot(provider, symbol, interval)
    if snapshot is None:
        return None
    payload = dict(snapshot)
    if include_history:
        client = get_redis()
        provider_n, symbol_n, _ = normalize_provider_symbol(provider, symbol)
        try:
            history = _load(client.get(history_key(provider_n, symbol_n, interval)))
        except Exception as e:
            logger.warning(f"[Redis] lectura de historico fallo: {e}")
            history = None
        payload['history'] = history or {}
    return payload


def snapshot_age(provider, symbol, interval):
    """Segundos desde la ultima escritura del tier caliente (None si no existe)."""
    snapshot = read_snapshot(provider, symbol, interval)
    if not snapshot or snapshot.get(STAMP_FIELD) is None:
        return None
    return max(0.0, time.time() - float(snapshot[STAMP_FIELD]))


def feed_health():
    """Diagnostico: cuantas salas tienen snapshot vivo en Redis."""
    client = get_redis()
    if client is None:
        return {'backend': 'memory', 'snapshots': 0, 'rooms': 0}
    try:
        keys = [k.decode() for k in client.scan_iter(match=f'{SNAPSHOT_PREFIX}:*', count=500)]
        return {
            'backend': 'redis',
            'node': NODE_ID,
            'snapshots': len(keys),
            'rooms': len(active_rooms()),
            'sample_keys': keys[:8],
        }
    except Exception as e:
        logger.warning(f"[Redis] health fallo: {e}")
        return {'backend': 'redis', 'snapshots': 0, 'rooms': 0, 'error': str(e)}


# ─────────────────────────────────────────────────────────────────────
# TAPE DE ORDER FLOW (Redis Streams)
# ─────────────────────────────────────────────────────────────────────

def _decode_fields(fields):
    """Pasa los campos de una Stream a str.

    Con decode_responses=False Redis devuelve tambien los nombres de campo en
    bytes, asi que acceder por fields['tid'] lanzaria KeyError y la entrada se
    descartaba: el tape quedaba vacio y el order flow reportaba 'sin datos'.
    """
    decoded = {}
    for key, value in (fields or {}).items():
        if isinstance(key, (bytes, bytearray)):
            key = key.decode('utf-8', 'replace')
        if isinstance(value, (bytes, bytearray)):
            value = value.decode('utf-8', 'replace')
        decoded[key] = value
    return decoded


def tape_append(provider, symbol, trades):
    """Agrega trades normalizados con MAXLEN aproximado para limitar memoria."""
    client = get_redis()
    if client is None or not trades:
        return False
    provider, symbol, _ = normalize_provider_symbol(provider, symbol)
    key = tape_key(provider, symbol)
    pipe = client.pipeline(transaction=False)
    for trade in trades:
        pipe.xadd(
            key,
            {
                'tid': str(trade['id']),
                'time': str(trade['time']),
                'side': trade['side'],
                'price': repr(trade['price']),
                'size': repr(trade['size']),
            },
            maxlen=TAPE_MAX_LEN,
            approximate=True,
        )
    pipe.expire(key, TAPE_TTL)
    try:
        pipe.execute()
    except Exception as e:
        logger.warning(f"[Redis] tape append fallo para {key}: {e}")
        return False
    return True


def tape_read(provider, symbol, limit=200):
    """Ultimos `limit` trades del stream, en orden cronologico.

    Se lee con XREVRANGE porque los ID de una Stream no son offsets: un rango
    `xrange(min=xlen-limit)` compararia contra un timestamp en milisegundos y
    devolveria los trades MAS viejos, sesgando el delta del order flow.
    """
    client = get_redis()
    if client is None:
        return []
    provider, symbol, _ = normalize_provider_symbol(provider, symbol)
    key = tape_key(provider, symbol)
    try:
        rows = client.xrevrange(key, count=limit)
    except Exception as e:
        logger.warning(f"[Redis] tape read fallo para {key}: {e}")
        return []
    trades = []
    for entry_id, raw_fields in reversed(rows):
        fields = _decode_fields(raw_fields)
        try:
            trades.append({
                'id': fields['tid'],
                'time': int(fields['time']),
                'side': fields['side'],
                'price': float(fields['price']),
                'size': float(fields['size']),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return trades


def tape_last_time(provider, symbol):
    client = get_redis()
    if client is None:
        return 0
    provider, symbol, _ = normalize_provider_symbol(provider, symbol)
    try:
        rows = client.xrevrange(tape_key(provider, symbol), count=1)
    except Exception:
        return 0
    if not rows:
        return 0
    try:
        return int(_decode_fields(rows[0][1])['time'])
    except (KeyError, TypeError, ValueError):
        return 0


# ────────────────────────────────────────────────────────────────────
# REGISTRO DE SALAS: el feeder solo calcula lo que alguien esta mirando
# ─────────────────────────────────────────────────────────────────────

def _room_member(room):
    return f'{NODE_ID}|{room}'


def room_register(room):
    """Renueva el lease de la sala para este proceso."""
    client = get_redis()
    if client is None:
        return
    try:
        client.zadd(ROOMS_KEY, {_room_member(room): time.time()})
    except Exception as e:
        logger.warning(f"[Redis] room register fallo: {e}")


def room_release(room):
    client = get_redis()
    if client is None:
        return
    try:
        client.zrem(ROOMS_KEY, _room_member(room))
    except Exception as e:
        logger.warning(f"[Redis] room release fallo: {e}")


def room_heartbeat(rooms):
    """Renueva los leases de las salas que este proceso todavia sirve.

    Sin este latido, una sala abierta 10 minutos expiraria y el feeder dejaria
    de actualizarla. La misma llamada poda los leases vencidos del ZSet.
    """
    client = get_redis()
    if client is None:
        return
    now = time.time()
    try:
        if rooms:
            client.zadd(ROOMS_KEY, {_room_member(room): now for room in rooms})
        client.zremrangebyscore(ROOMS_KEY, '-inf', now - ROOM_LEASE_SECONDS)
    except Exception as e:
        logger.warning(f"[Redis] room heartbeat fallo: {e}")


def rooms_prune():
    client = get_redis()
    if client is None:
        return
    try:
        client.zremrangebyscore(ROOMS_KEY, '-inf', time.time() - ROOM_LEASE_SECONDS)
    except Exception as e:
        logger.warning(f"[Redis] poda de rooms fallo: {e}")


def _fresh_rooms():
    """{sala: ultimo_lease} agregando por sala (varios nodos pueden ver la misma)."""
    client = get_redis()
    if client is None:
        return {}
    now = time.time()
    with _rooms_cache_lock:
        if now - _rooms_cache['ts'] < _ROOMS_CACHE_TTL:
            return _rooms_cache['data']
        try:
            rows = client.zrange(ROOMS_KEY, 0, -1, withscores=True) or []
        except Exception as e:
            logger.warning(f"[Redis] lectura de rooms fallo: {e}")
            return _rooms_cache['data']
        fresh = {}
        for member, score in rows:
            if isinstance(member, (bytes, bytearray)):
                member = member.decode('utf-8', 'replace')
            _, sep, room = str(member).partition('|')
            if not sep:
                room = str(member)
            if now - float(score) <= ROOM_LEASE_SECONDS:
                fresh[room] = max(fresh.get(room, 0), float(score))
        _rooms_cache['data'] = fresh
        _rooms_cache['ts'] = now
        return fresh


def has_subscribers(room):
    """Consulta el registro compartido de salas (con cache local brevissima).

    Los streams lo invocan por cada trade recibido (decenas por segundo), asi que
    se sirve una copia con _ROOMS_CACHE_TTL de vida en vez de un ZRANGE por trade.
    """
    return _fresh_rooms().get(room, 0) > 0


def active_rooms():
    return sorted(_fresh_rooms())


# ─────────────────────────────────────────────────────────────────────
# PUB/SUB: actualizaciones hacia los clientes y comandos hacia el feeder
# ─────────────────────────────────────────────────────────────────────

def publish_refresh(symbol, interval, market, provider, reason='cold'):
    """Solicita al feeder un re-fetch inmediato (la API nunca lo hace sola).

    `reason` separa los dos casos que hay que tratar distinto:
      cold   : la sala no esta sembrada todavia. Varios clientes/replicas pueden
               pedir la misma clave a la vez; el feeder deduplica con esto.
      manual : el usuario pidio refresh explicito, se atiende siempre.
    """
    client = get_redis()
    if client is None:
        return False
    try:
        client.publish(CHANNEL_COMMANDS, json.dumps({
            'action': 'refresh', 'symbol': symbol, 'interval': interval,
            'market': market, 'provider': provider, 'reason': reason,
            'ts': time.time(),
        }))
    except Exception as e:
        logger.warning(f"[Redis] publish refresh fallo: {e}")
        return False
    return True


def subscribe_updates(on_message):
    """Hilo de escucha de ta:updates. Requiere una conexion dedicada de Redis."""
    client = get_redis()
    if client is None:
        return None

    def loop():
        while True:
            pubsub = None
            try:
                pubsub = client.pubsub(ignore_subscribe_messages=True)
                pubsub.subscribe(CHANNEL_UPDATES)
                while True:
                    message = pubsub.get_message(timeout=1)
                    if not message or message.get('type') != 'message':
                        continue
                    try:
                        payload = json.loads(message['data'])
                    except Exception:
                        continue
                    try:
                        on_message(payload)
                    except Exception as e:
                        logger.warning(f"[Redis] handler de updates fallo: {e}")
            except Exception as e:
                logger.warning(f"[Redis] suscripcion a updates caida, reintentando: {e}")
                time.sleep(2)
            finally:
                if pubsub is not None:
                    pubsub.close()

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return thread


def subscribe_commands(on_command):
    """El feeder escucha comandos (refresh manual) desde la API."""
    client = get_redis()
    if client is None:
        return None

    def loop():
        while True:
            pubsub = None
            try:
                pubsub = client.pubsub(ignore_subscribe_messages=True)
                pubsub.subscribe(CHANNEL_COMMANDS)
                while True:
                    message = pubsub.get_message(timeout=1)
                    if not message or message.get('type') != 'message':
                        continue
                    try:
                        on_command(json.loads(message['data']))
                    except Exception as e:
                        logger.warning(f"[Redis] comando invalido: {e}")
            except Exception as e:
                logger.warning(f"[Redis] suscripcion a comandos caida: {e}")
                time.sleep(2)
            finally:
                if pubsub is not None:
                    pubsub.close()

    thread = threading.Thread(target=loop, daemon=True)
    thread.start()
    return thread
