import threading
import logging
import time
import json
import base64
import struct

import websocket

logger = logging.getLogger(__name__)

# Streaming de cotizaciones de stocks via el WebSocket publico de Yahoo Finance
# (wss://streamer.finance.yahoo.com/). Yahoo NO envia velas: solo QUOTES, y solo
# cuando hay un cambio real de cotizacion (fuera de horario o fin de semana no
# llega nada). Por eso este hilo se usa como ACELERADOR: cuando llega un quote
# actualiza el cierre de la vela viva y recalcula el payload; el polling REST
# (REFRESH_MIN_GAP) sigue funcionando como respaldo si Yahoo no manda nada.

# Protocolo observado (2026): los mensajes son TEXT frames con el protobuf en
# base64. Esquema (decodificado empiricamente):
#   field 1 (string)  = simbolo (ej. "NVDA")
#   field 2 (fixed32) = precio actual en float32 (ej. 200.75)
#   field 5 (string)  = exchange ("NYS"/"NYQ"/"NMS"...)
#   field 8 (fixed32) = cambio porcentual
#   field 12 (fixed32)= cambio absoluto en dolares
# El resto de campos no se usa. Los simbolos se suscriben en minusculas.

MIN_RECOMPUTE_GAP = 1.5
BASE_RECONNECT = 2
MAX_RECONNECT = 60
# Yahoo no envia nada en fines de semana/feriados: timeout largo para no
# reconectar en loop cuando el mercado esta cerrado (la conexion debe quedar
# viva para el lunes 9:30). Las conexiones muertas se detectan por close frame.
RECV_TIMEOUT = 300

STREAM_URL = 'wss://streamer.finance.yahoo.com/'

INTERVAL_SECONDS = {
    '1m': 60,
    '5m': 300,
    '15m': 900,
    '1h': 3600,
    '4h': 14400,
    '1d': 86400,
}


def _decode_varint(data, pos):
    result = 0
    shift = 0
    while True:
        b = data[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            return result, pos
        shift += 7


def decode_yahoo_quote(raw):
    """Decodifica un mensaje del WS de Yahoo: devuelve (symbol, price) o None."""
    try:
        data = base64.b64decode(raw, validate=True)
    except Exception:
        data = raw
    if not data or len(data) < 4:
        return None
    symbol = None
    price = None
    pos = 0
    try:
        while pos < len(data):
            tag, pos = _decode_varint(data, pos)
            field = tag >> 3
            wire = tag & 7
            if wire == 0:
                _, pos = _decode_varint(data, pos)
            elif wire == 1:
                pos += 8
            elif wire == 2:
                length, pos = _decode_varint(data, pos)
                if field == 1:
                    symbol = data[pos:pos + length].decode('utf-8', 'replace')
                pos += length
            elif wire == 5:
                if field == 2 and pos + 4 <= len(data):
                    price = struct.unpack('<f', data[pos:pos + 4])[0]
                pos += 4
            else:
                break
    except Exception:
        return None
    if symbol and price and price > 0 and price < 1000000:
        return symbol.upper(), float(price)
    return None


class YahooStreamThread:
    def __init__(self, socketio, hooks, symbols, intervals):
        self.socketio = socketio
        self.hooks = hooks
        self.symbols = symbols
        self.intervals = intervals
        self.store = {}
        self.store_lock = threading.Lock()
        self.last_recompute = {}
        self.last_emitted = {}
        self.running = True

    def _get_bars(self, symbol, interval):
        with self.store_lock:
            return self.store.get(symbol, {}).get(interval)

    def ensure_seeded(self, symbol, interval):
        bars = self._get_bars(symbol, interval)
        if bars and len(bars) > 0:
            return bars
        try:
            klines, _ = self.hooks['fetch_klines_vol'](symbol, interval, 'stock')
            if klines and len(klines) > 0:
                with self.store_lock:
                    self.store.setdefault(symbol, {})[interval] = klines
                return klines
        except Exception as e:
            logger.warning(f"[YahooStream] seed fallo para {symbol} {interval}: {e}")
        return None

    def handle_quote(self, symbol, price):
        now_ms = int(time.time() * 1000)
        for interval in self.intervals:
            room = f'stock:{symbol}:{interval}'
            if not self.hooks['has_subscribers'](room):
                continue
            bars = self.ensure_seeded(symbol, interval)
            if not bars:
                continue
            interval_ms = INTERVAL_SECONDS.get(interval, 900) * 1000
            if now_ms - int(bars[-1][0]) >= interval_ms:
                # La vela viva termino: re-seed desde REST para arrancar la nueva
                # (Yahoo WS no envia velas, solo quotes).
                try:
                    fresh, _ = self.hooks['fetch_klines_vol'](symbol, interval, 'stock')
                except Exception as e:
                    logger.warning(f"[YahooStream] reseed fallo para {room}: {e}")
                    continue
                if not fresh or len(fresh) == 0:
                    continue
                if now_ms - int(fresh[-1][0]) >= interval_ms:
                    # Aun no existe vela nueva (ej. grupo 4h incompleto o
                    # mercado cerrado): NO tocar velas ya cerradas.
                    continue
                with self.store_lock:
                    self.store.setdefault(symbol, {})[interval] = fresh
                bars = fresh
            last = bars[-1]
            last[2] = max(float(last[2]), price)
            last[3] = min(float(last[3]), price)
            last[4] = price
            last[6] = price
            self.recompute_and_emit(symbol, interval, bars)

    def recompute_and_emit(self, symbol, interval, bars):
        now = time.time()
        room = f'stock:{symbol}:{interval}'
        if now - self.last_recompute.get(room, 0) < MIN_RECOMPUTE_GAP:
            return
        self.last_recompute[room] = now

        now_ms = int(now * 1000)
        try:
            vol_24h = sum(float(k[5]) for k in bars if now_ms - int(k[0]) <= 86400000)
        except Exception:
            vol_24h = None

        try:
            payload = self.hooks['build_payload'](symbol, interval, 'stock', list(bars), vol_24h)
        except Exception as e:
            logger.warning(f"[YahooStream] build_payload fallo para {room}: {e}")
            return

        self.hooks['store_payload'](f'stock:{symbol}_{interval}', payload)

        sig = json.dumps(payload, sort_keys=True, default=str)
        if self.last_emitted.get(room) == sig:
            return
        self.last_emitted[room] = sig
        try:
            self.socketio.emit('trading_data_update', payload, room=room)
        except Exception as e:
            logger.warning(f"[YahooStream] emit fallo para {room}: {e}")

    def run(self):
        logger.info("[YahooStream] Hilo de streaming de Yahoo Finance iniciado.")
        backoff = BASE_RECONNECT
        while self.running:
            ws = None
            try:
                ws = websocket.WebSocket()
                ws.settimeout(RECV_TIMEOUT)
                ws.connect(STREAM_URL, timeout=20)
                sub = json.dumps({'subscribe': [s.lower() for s in self.symbols]})
                ws.send(sub)
                logger.info(f"[YahooStream] Conectado y suscrito ({len(self.symbols)} simbolos).")
                backoff = BASE_RECONNECT
                while self.running:
                    opcode, raw = ws.recv_data()
                    if opcode not in (0x1, 0x2):
                        continue
                    quote = decode_yahoo_quote(raw)
                    if not quote:
                        continue
                    symbol, price = quote
                    try:
                        self.handle_quote(symbol, price)
                    except Exception as e:
                        logger.warning(f"[YahooStream] handle_quote fallo para {symbol}: {e}")
            except Exception as e:
                logger.warning(f"[YahooStream] desconexion/error: {e}")
            finally:
                if ws is not None:
                    try:
                        ws.close()
                    except Exception:
                        pass
            if not self.running:
                break
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_RECONNECT)


def init_yahoo_stream(socketio, hooks, symbols, intervals):
    thread = YahooStreamThread(socketio, hooks, symbols, intervals)
    t = threading.Thread(target=thread.run, daemon=True)
    t.start()
    return thread
