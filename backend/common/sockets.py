import threading
import logging
import random
import time
import json
from flask import request
from flask_socketio import emit, join_room, leave_room

from common import market_store

logger = logging.getLogger(__name__)

subscriber_rooms = {}
subscriber_lock = threading.Lock()

# Rooms activos por conexion (sid) para limpiarlos si el cliente se desconecta
sid_rooms = {}
sid_rooms_lock = threading.Lock()

room_errors = {}
room_errors_lock = threading.Lock()

# Ultima firma del payload emitida por sala: evita re-emitir datos identicos
last_emitted = {}
last_emitted_lock = threading.Lock()

# Control de abuso en WebSockets
MAX_ROOMS_PER_SOCKET = 10
REFRESH_THROTTLE_SECONDS = 5.0
last_refresh_by_sid = {}
last_refresh_lock = threading.Lock()

MAX_CONSECUTIVE_ERRORS = 3
ERROR_BACKOFF_SECONDS = 300

MIN_CYCLE_SLEEP = 15
MAX_CYCLE_SLEEP = 120
SLEEP_PER_ROOM = 5
JITTER = 0.2

BASE_STAGGER = 3

def data_signature(data):
    try:
        return json.dumps(data, sort_keys=True, default=str)
    except Exception:
        return str(time.time())

def init_sockets(socketio, fetch_data_func):
    def parse_room(room):
        """(market, provider, symbol, interval) desde la sala del frontend.

        Formato actual: `${market}:${provider}:${symbol}:${interval}`.
        Una sala crypto SIN proveedor se RECHAZA en vez de asumir 'coinbase':
        ese default hacia que un cliente viejo de Binance terminara mirando el
        feed de Coinbase sin que nadie lo notara. Las salas de acciones de 3
        partes si son validas (Yahoo es el unico proveedor de stocks).
        """
        parts = room.split(':')
        if len(parts) == 4:
            market, provider, symbol, interval = parts
        elif len(parts) == 3:
            market, symbol, interval = parts
            if market != 'stock':
                raise ValueError(f"Sala crypto sin proveedor: {room}")
            provider = 'yahoo'
        else:
            raise ValueError(f"Invalid trading room: {room}")
        return market, provider, symbol, interval

    def remove_room_subscriber(room):
        """Decrementa el contador de un room y lo destruye si queda vacio."""
        with subscriber_lock:
            if room not in subscriber_rooms:
                return
            subscriber_rooms[room] = max(0, subscriber_rooms[room] - 1)
            if subscriber_rooms[room] == 0:
                del subscriber_rooms[room]
                with last_emitted_lock:
                    last_emitted.pop(room, None)
                with room_errors_lock:
                    room_errors.pop(room, None)
                logger.info(f"[Socket] Room destroyed (no subscribers): {room}")
                # Solo se suelta el lease cuando este nodo ya no tiene NADIE
                # mirando la sala; si queda otro cliente local, el heartbeat la
                # mantiene viva.
                if market_store.redis_active():
                    market_store.room_release(room)

    def _on_join(data):
        if not isinstance(data, dict):
            return
        room = data.get('room')
        if not room or not isinstance(room, str):
            return

        # Validar formato del room antes de aceptar suscripción
        try:
            parse_room(room)
        except ValueError as err:
            logger.warning("[Socket] Rechazada suscripción a sala inválida: %s (%s)", room, err)
            return

        sid = request.sid
        with sid_rooms_lock:
            rooms = sid_rooms.setdefault(sid, set())
            if room in rooms:
                return
            if len(rooms) >= MAX_ROOMS_PER_SOCKET:
                logger.warning("[Socket] Cliente %s superó el límite de salas (%s)", sid, MAX_ROOMS_PER_SOCKET)
                return
            rooms.add(room)

        join_room(room)
        with subscriber_lock:
            subscriber_rooms[room] = subscriber_rooms.get(room, 0) + 1
        # En modo Redis el registro de salas es compartido: el feeder solo
        # recalcula lo que alguien esta mirando.
        if market_store.redis_active():
            market_store.room_register(room)
        logger.info(f"[Socket] Client joined room: {room} (Total subscribers: {subscriber_rooms[room]})")

    def _on_leave(data):
        if not isinstance(data, dict):
            return
        room = data.get('room')
        if not room or not isinstance(room, str):
            return
        leave_room(room)
        sid = request.sid
        with sid_rooms_lock:
            rooms = sid_rooms.get(sid)
            if rooms:
                rooms.discard(room)
                if not rooms:
                    del sid_rooms[sid]
        remove_room_subscriber(room)
        logger.info(f"[Socket] Client left room: {room} (Remaining: {subscriber_rooms.get(room, 0)})")

    def _on_disconnect():
        sid = request.sid
        with sid_rooms_lock:
            rooms = list(sid_rooms.pop(sid, set()))
        with last_refresh_lock:
            last_refresh_by_sid.pop(sid, None)
        for room in rooms:
            remove_room_subscriber(room)
        if rooms:
            logger.info(f"[Socket] Client disconnected: {sid} (cleaned {len(rooms)} rooms)")
        else:
            logger.info(f"[Socket] Client disconnected: {sid} (no subscribed rooms)")

    def _on_request_refresh(data):
        if not isinstance(data, dict):
            return
        room = data.get('room')
        if not room or not isinstance(room, str):
            return

        # Rate-limiting por conexión (SID) para proteger la cuota de los exchanges
        sid = request.sid
        now = time.time()
        with last_refresh_lock:
            last_time = last_refresh_by_sid.get(sid, 0.0)
            if now - last_time < REFRESH_THROTTLE_SECONDS:
                logger.warning("[Socket] Rate-limited request_refresh del cliente %s", sid)
                return
            last_refresh_by_sid[sid] = now

        try:
            market, provider, symbol, interval = parse_room(room)
            data = fetch_data_func(
                symbol, interval, market, provider=provider
            )
            socketio.emit('trading_data_update', data, room=room)
        except Exception as e:
            logger.error(f"[Socket] Manual refresh error for {room}: {e}")

    # Registro explicito en lugar del decorador @socketio.on: el despacho lo hace
    # Flask-SocketIO por nombre de evento, y esta linea deja una referencia real
    # al handler (con el decorador el analizador lo reporta como "not accessed").
    socketio.on_event('join', _on_join)
    socketio.on_event('leave', _on_leave)
    socketio.on_event('disconnect', _on_disconnect)
    socketio.on_event('request_refresh', _on_request_refresh)

    def get_room_error_count(room):
        with room_errors_lock:
            entry = room_errors.get(room)
            if not entry: return 0
            count, until = entry
            if time.time() >= until:
                del room_errors[room]
                return 0
            return count

    def increment_room_error(room):
        with room_errors_lock:
            entry = room_errors.get(room, (0, 0))
            count, _ = entry
            room_errors[room] = (count + 1, time.time() + ERROR_BACKOFF_SECONDS)
            logger.warning(f"[Socket] Room {room} errors: {count + 1}/{MAX_CONSECUTIVE_ERRORS}")

    def reset_room_errors(room):
        with room_errors_lock:
            room_errors.pop(room, None)

    def emit_if_changed(room, data):
        sig = data_signature(data)
        with last_emitted_lock:
            if last_emitted.get(room) == sig:
                return False
            last_emitted[room] = sig
        return True

    def parse_update_identifiers(message):
        """(provider, symbol, interval) desde el mensaje de ta:updates."""
        provider = message.get('provider')
        symbol = (message.get('symbol') or '').upper()
        interval = message.get('interval')
        if not (provider and symbol and interval):
            return None
        return provider, symbol, interval

    def start_redis_emitter():
        """En modo Redis no se pollinga a los exchanges: el feeder publica y aqui
        se lee el snapshot completo y se emite a la sala correspondiente."""
        def on_update(message):
            room = message.get('room')
            identifiers = parse_update_identifiers(message)
            if not room or not identifiers:
                return
            with subscriber_lock:
                if subscriber_rooms.get(room, 0) <= 0:
                    return
            provider, symbol, interval = identifiers
            try:
                # Se lee el payload COMPLETO (snapshot + historico): el frontend
                # reemplaza todo `datos` en cada update, y dentro del historico
                # viven la vela en formacion y las series de indicadores que usan
                # los graficos. Excluirlo dejaria los graficos congelados.
                payload = market_store.read_payload(provider, symbol, interval)
            except Exception as e:
                logger.error(f"[Socket] lectura Redis fallo para {room}: {e}")
                return
            if payload is None:
                return
            market_store.strip_internal(payload)
            if emit_if_changed(room, payload):
                socketio.emit('trading_data_update', payload, room=room)

        market_store.subscribe_updates(on_update)
        logger.info("[Socket] Modo Redis: emits alimentados por el canal ta:updates "
                    "(sin polling a los exchanges).")

    def start_room_heartbeat():
        """Renueva el lease Redis de las salas propias.

        El registro es un lease con expiracion: si este proceso deja de latir
        (reinicio, deploy, OOM) la sala expira sola y el feeder deja de
        recalcularla, en vez de quedar contada para siempre.
        """
        def loop():
            while True:
                time.sleep(market_store.ROOM_HEARTBEAT_SECONDS)
                with subscriber_lock:
                    rooms = [r for r, c in subscriber_rooms.items() if c > 0]
                market_store.room_heartbeat(rooms)

        threading.Thread(target=loop, daemon=True).start()

    def background_data_fetcher():
        logger.info("[Socket] Adaptive background data fetcher thread started.")
        while True:
            active_rooms = []
            with subscriber_lock:
                active_rooms = [r for r, count in subscriber_rooms.items() if count > 0]

            num_rooms = len(active_rooms)

            if num_rooms > 0:
                adaptive_sleep = min(MAX_CYCLE_SLEEP, max(MIN_CYCLE_SLEEP, 15 + num_rooms * SLEEP_PER_ROOM))
                jitter = adaptive_sleep * JITTER * (random.random() * 2 - 1)
                adaptive_sleep = adaptive_sleep + jitter
                logger.info(f"[Socket] Cycle: {num_rooms} active rooms, adaptive sleep={adaptive_sleep:.0f}s")

                for room_id in active_rooms:
                    try:
                        if ":" not in room_id: continue

                        if get_room_error_count(room_id) >= MAX_CONSECUTIVE_ERRORS:
                            logger.info(f"[Socket] Skipping {room_id} (consecutive error backoff)")
                            socketio.sleep(BASE_STAGGER)
                            continue

                        market, provider, symbol, interval = parse_room(room_id)
                        data = fetch_data_func(
                            symbol, interval, market, provider=provider
                        )
                        if emit_if_changed(room_id, data):
                            socketio.emit('trading_data_update', data, room=room_id)
                        reset_room_errors(room_id)
                    except Exception as e:
                        logger.error(f"[Socket] Error in background fetch for room {room_id}: {e}")
                        increment_room_error(room_id)

                    socketio.sleep(BASE_STAGGER)

                socketio.sleep(adaptive_sleep)
            else:
                socketio.sleep(MIN_CYCLE_SLEEP)

    if market_store.redis_active():
        start_redis_emitter()
        start_room_heartbeat()
    else:
        bg_thread = threading.Thread(target=background_data_fetcher, daemon=True)
        bg_thread.start()
