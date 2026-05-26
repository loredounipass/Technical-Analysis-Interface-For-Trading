import threading
import logging
from flask_socketio import emit, join_room, leave_room

# Global logging configuration
logger = logging.getLogger(__name__)

# Track active rooms and their subscription counts
subscriber_rooms = {} 
subscriber_lock = threading.Lock()

def init_sockets(socketio, fetch_data_func):
    """
    Inizializa los eventos de WebSockets y arranca el hilo de segundo plano
    para la actualización de datos de trading.
    """
    
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

    def background_data_fetcher():
        """Loop que emite datos periódicamente solo a las salas activas."""
        logger.info("[Socket] Background data fetcher thread started.")
        base_sleep = 15
        while True:
            active_rooms = []
            with subscriber_lock:
                active_rooms = [r for r, count in subscriber_rooms.items() if count > 0]
            
            for room_id in active_rooms:
                try:
                    # room_id format -> "SYMBOL:INTERVAL"
                    if ":" not in room_id: continue
                    symbol, interval = room_id.split(':')
                    
                    logger.info(f"[Socket] Preparing real-time update for {room_id}")
                    # fetch_data_func es la referencia a fetch_from_ta que pasamos desde app.py
                    data = fetch_data_func(symbol, interval)
                    socketio.emit('trading_data_update', data, room=room_id)
                except Exception as e:
                    logger.error(f"[Socket] Error in background fetch for room {room_id}: {e}")
                
                # Añadimos un pequeño retraso entre cada sala para no saturar la API de TradingView
                socketio.sleep(3)
            
            # Usamos socketio.sleep para ser compatibles con el modelo de async
            socketio.sleep(base_sleep)

    # Iniciamos el thread como demonio para que se cierre con el proceso principal
    bg_thread = threading.Thread(target=background_data_fetcher, daemon=True)
    bg_thread.start()
