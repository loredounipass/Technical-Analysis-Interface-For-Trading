import threading
import logging
import random
import time
from flask_socketio import emit, join_room, leave_room

logger = logging.getLogger(__name__)

subscriber_rooms = {}
subscriber_lock = threading.Lock()

room_errors = {}
room_errors_lock = threading.Lock()

MAX_CONSECUTIVE_ERRORS = 3
ERROR_BACKOFF_SECONDS = 300

MIN_CYCLE_SLEEP = 15
MAX_CYCLE_SLEEP = 120
SLEEP_PER_ROOM = 5
JITTER = 0.2

BASE_STAGGER = 3

def init_sockets(socketio, fetch_data_func):
    @socketio.on('join')
    def on_join(data):
        room = data.get('room')
        if not room: return
        join_room(room)
        with subscriber_lock:
            subscriber_rooms[room] = subscriber_rooms.get(room, 0) + 1
        logger.info(f"[Socket] Client joined room: {room} (Total subscribers: {subscriber_rooms[room]})")

    @socketio.on('leave')
    def on_leave(data):
        room = data.get('room')
        if not room: return
        leave_room(room)
        with subscriber_lock:
            if room in subscriber_rooms:
                subscriber_rooms[room] = max(0, subscriber_rooms[room] - 1)
        logger.info(f"[Socket] Client left room: {room} (Remaining: {subscriber_rooms.get(room, 0)})")

    @socketio.on('request_refresh')
    def on_request_refresh(data):
        room = data.get('room')
        if not room: return
        try:
            if ":" not in room: return
            symbol, interval = room.split(':')
            data = fetch_data_func(symbol, interval)
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

                        symbol, interval = room_id.split(':')
                        data = fetch_data_func(symbol, interval)
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
