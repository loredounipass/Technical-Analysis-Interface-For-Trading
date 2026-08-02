import threading
import logging
import time
import json

import websocket

logger = logging.getLogger(__name__)

# Una sola conexion combinada con TODOS los streams de crypto (7 simbolos x
# 6 timeframes = 42 klines + 7 tickers). Limite de Binance: 1024 streams.

MIN_RECOMPUTE_GAP = 1.5
MAX_BARS = 2000
BASE_RECONNECT = 2
MAX_RECONNECT = 60
PING_KEEPALIVE = 20

# data-stream.binance.vision es el endpoint PUBLICO de market data (mismo
# dominio que data-api.binance.vision, que ya usamos para REST). stream.binance.com
# devuelve 451 "restricted location" desde muchos servidores (Render, etc.).
STREAM_URLS = [
    'wss://data-stream.binance.vision/stream',
    'wss://stream.binance.com:9443/stream',
]


class BinanceStreamThread:
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
            klines, vol_24h = self.hooks['fetch_klines_vol'](symbol, interval, 'crypto')
            if klines and len(klines) > 0:
                # Las klines de la API REST traen OHLCV como strings: normalizar
                # a float para poder actualizarlas con los ticks del WS.
                bars = [
                    [int(k[0]), float(k[1]), float(k[2]), float(k[3]),
                     float(k[4]), float(k[5]), int(k[0]), float(k[7])]
                    for k in klines
                ]
                with self.store_lock:
                    self.store.setdefault(symbol, {})[interval] = bars
                if vol_24h is not None:
                    self.hooks['update_ticker'](symbol, vol_24h)
                return bars
        except Exception as e:
            logger.warning(f"[Stream] seed fallo para {symbol} {interval}: {e}")
        return None

    @staticmethod
    def apply_kline(bars, k):
        o_ms = int(k['t'])
        o = float(k['o'])
        h = float(k['h'])
        l = float(k['l'])
        c = float(k['c'])
        v = float(k['v'])
        q = float(k['q'])
        closed = bool(k['x'])
        if bars and bars[-1][0] == o_ms:
            last = bars[-1]
            last[1] = o
            last[2] = max(last[2], h)
            last[3] = min(last[3], l)
            last[4] = c
            last[5] = v
            last[7] = q
        else:
            bars.append([o_ms, o, h, l, c, v, o_ms, q])
            if len(bars) > MAX_BARS:
                del bars[0]
        return closed

    def handle_message(self, stream_name, data):
        if '@ticker' in stream_name:
            symbol = stream_name.split('@')[0].upper()
            try:
                self.hooks['update_ticker'](symbol, float(data['q']))
            except Exception as e:
                logger.warning(f"[Stream] ticker update fallo para {symbol}: {e}")
            return

        if '@kline_' not in stream_name:
            return

        parts = stream_name.split('@')
        symbol = parts[0].upper()
        interval = parts[1].replace('kline_', '')
        if interval not in self.intervals:
            return

        room = f'crypto:{symbol}:{interval}'
        if not self.hooks['has_subscribers'](room):
            return

        bars = self.ensure_seeded(symbol, interval)
        if not bars:
            return

        try:
            closed = self.apply_kline(bars, data['k'])
        except Exception as e:
            logger.warning(f"[Stream] apply_kline fallo para {room}: {e}")
            return

        now = time.time()
        last = self.last_recompute.get(room, 0)
        if not closed and now - last < MIN_RECOMPUTE_GAP:
            return
        self.last_recompute[room] = now

        try:
            vol_24h = self.hooks['get_vol_24h'](symbol)
        except Exception:
            vol_24h = None
        try:
            payload = self.hooks['build_payload'](symbol, interval, 'crypto', list(bars), vol_24h)
        except Exception as e:
            logger.warning(f"[Stream] build_payload fallo para {room}: {e}")
            return

        self.hooks['store_payload'](f'crypto:{symbol}_{interval}', payload)

        sig = json.dumps(payload, sort_keys=True, default=str)
        if self.last_emitted.get(room) == sig:
            return
        self.last_emitted[room] = sig
        try:
            self.socketio.emit('trading_data_update', payload, room=room)
        except Exception as e:
            logger.warning(f"[Stream] emit fallo para {room}: {e}")

    def run(self):
        logger.info("[Stream] Hilo de streaming de Binance iniciado.")
        backoff = BASE_RECONNECT
        url_index = 0
        while self.running:
            try:
                streams = []
                for s in self.symbols:
                    streams.append(f"{s.lower()}@ticker")
                    for iv in self.intervals:
                        streams.append(f"{s.lower()}@kline_{iv}")
                url = STREAM_URLS[url_index] + '?streams=' + '/'.join(streams)
                ws = websocket.WebSocket()
                ws.connect(url, timeout=20)
                # connect(timeout=...) sobrescribiria un settimeout previo:
                # se aplica el timeout de recv DESPUES del handshake.
                ws.settimeout(PING_KEEPALIVE + 10)
                logger.info(f"[Stream] Conectado a Binance WS ({len(streams)} streams) via {STREAM_URLS[url_index]}.")
                backoff = BASE_RECONNECT
                while self.running:
                    raw = ws.recv()
                    if not raw:
                        continue
                    try:
                        msg = json.loads(raw)
                    except Exception:
                        continue
                    if msg.get('stream') and msg.get('data'):
                        self.handle_message(msg['stream'], msg['data'])
            except Exception as e:
                logger.warning(f"[Stream] desconexion/error en {STREAM_URLS[url_index]}: {e}")
            finally:
                try:
                    ws.close()
                except Exception:
                    pass
            # Si un endpoint falla (ej. 451 restricted location), probar el otro
            url_index = (url_index + 1) % len(STREAM_URLS)
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_RECONNECT)


def init_binance_stream(socketio, hooks, symbols, intervals):
    thread = BinanceStreamThread(socketio, hooks, symbols, intervals)
    t = threading.Thread(target=thread.run, daemon=True)
    t.start()
    return thread
