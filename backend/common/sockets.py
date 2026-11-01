import threading
import logging
import random
import time
import json
from flask import request
from flask_socketio import emit, join_room, leave_room

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

    @socketio.on('join')
    def on_join(data):
        room = data.get('room')
        if not room: return
        join_room(room)
        sid = request.sid
        with sid_rooms_lock:
            rooms = sid_rooms.setdefault(sid, set())
            if room in rooms:
                return
            rooms.add(room)
        with subscriber_lock:
            subscriber_rooms[room] = subscriber_rooms.get(room, 0) + 1
        logger.info(f"[Socket] Client joined room: {room} (Total subscribers: {subscriber_rooms[room]})")

    @socketio.on('leave')
    def on_leave(data):
        room = data.get('room')
        if not room: return
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

    @socketio.on('disconnect')
    def on_disconnect():
        sid = request.sid
        with sid_rooms_lock:
            rooms = list(sid_rooms.pop(sid, set()))
        for room in rooms:
            remove_room_subscriber(room)
        if rooms:
            logger.info(f"[Socket] Client disconnected: {sid} (cleaned {len(rooms)} rooms)")
        else:
            logger.info(f"[Socket] Client disconnected: {sid} (no subscribed rooms)")

    @socketio.on('request_refresh')
    def on_request_refresh(data):
        room = data.get('room')
        if not room: return
        try:
            parts = room.split(':')
            if len(parts) < 3: return
            market, symbol, interval = parts[0], parts[1], parts[2]
            data = fetch_data_func(symbol, interval, market)
            socketio.emit('trading_data_update', data, room=room)
        except Exception as e:
            logger.error(f"[Socket] Manual refresh error for {room}: {e}")

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

                        parts = room_id.split(':')
                        if len(parts) < 3: continue
                        market, symbol, interval = parts[0], parts[1], parts[2]
                        data = fetch_data_func(symbol, interval, market)
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

    bg_thread = threading.Thread(target=background_data_fetcher, daemon=True)
    bg_thread.start()
