"""Stream en tiempo real de Coinbase Exchange (WebSocket público, sin API key).

Sustituye al stream de Binance para que TODOS los datos de crypto (REST + vivo)
vengan de la misma fuente: las velas se siembran con fetch_klines_and_volume
(Coinbase) y los trades del canal `matches` actualizan la vela viva; el canal
`ticker` mantiene el volumen 24h. El polling REST sigue como respaldo.
"""

import threading
import logging
import time
import json
from datetime import datetime, timezone

import websocket

from data_fetchers import coinbase_product_id, record_order_flow_trade

logger = logging.getLogger(__name__)

MIN_RECOMPUTE_GAP = 1.5
MAX_BARS = 2000
BASE_RECONNECT = 2
MAX_RECONNECT = 60
PING_KEEPALIVE = 20

# WebSocket público de Coinbase Exchange (market data en vivo, sin auth).
STREAM_URL = 'wss://ws-feed.exchange.coinbase.com'

INTERVAL_SECONDS = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '4h': 21600, '1d': 86400}


def _parse_trade_ts(ts_str):
    """ISO 8601 de Coinbase (UTC, puede traer nanosegundos) -> epoch seconds."""
    try:
        s = ts_str[:-1] if ts_str.endswith('Z') else ts_str
        if '.' in s:
            head, frac = s.split('.')
            s = f"{head}.{frac[:6]}"
        return datetime.fromisoformat(s).replace(tzinfo=timezone.utc).timestamp()
    except Exception:
        return time.time()


class CoinbaseStreamThread:
    def __init__(self, socketio, hooks, symbols, intervals):
        self.socketio = socketio
        self.hooks = hooks
        self.symbols = symbols
        self.intervals = intervals
        self.products = [coinbase_product_id(s) for s in symbols]
        self.product_to_symbol = {coinbase_product_id(s): s for s in symbols}
        self.store = {}
        self.store_lock = threading.Lock()
        self.seeding = set()
        self.seeding_lock = threading.Lock()
        self.last_recompute = {}
        self.last_emitted = {}
        self.running = True

    def _get_bars(self, symbol, interval):
        with self.store_lock:
            return self.store.get(symbol, {}).get(interval)

    def _seed_background(self, symbol, interval):
        try:
            klines, vol_24h = self.hooks['fetch_klines_vol'](symbol, interval, 'crypto')
            if klines and len(klines) > 0:
                bars = [
                    [int(k[0]), float(k[1]), float(k[2]), float(k[3]),
                     float(k[4]), float(k[5]), int(k[0]), float(k[7])]
                    for k in klines
                ]
                with self.store_lock:
                    self.store.setdefault(symbol, {})[interval] = bars
                if vol_24h is not None:
                    self.hooks['update_ticker'](symbol, vol_24h)
        except Exception as e:
            logger.warning(f"[Stream] seed fallo para {symbol} {interval}: {e}")
        finally:
            with self.seeding_lock:
                self.seeding.discard((symbol, interval))

    def ensure_seeded(self, symbol, interval):
        bars = self._get_bars(symbol, interval)
        if bars and len(bars) > 0:
            return bars

        with self.seeding_lock:
            if (symbol, interval) not in self.seeding:
                self.seeding.add((symbol, interval))
                threading.Thread(target=self._seed_background, args=(symbol, interval), daemon=True).start()

        return None

    def handle_ticker(self, data):
        symbol = self.product_to_symbol.get(data.get('product_id'))
        if not symbol:
            return
        try:
            price = float(data['price'])
            vol_base = float(data.get('volume_24h') or 0)
            if price > 0 and vol_base > 0:
                self.hooks['update_ticker'](symbol, vol_base * price)
        except Exception as e:
            logger.warning(f"[Stream] ticker update fallo para {symbol}: {e}")

    def apply_trade(self, bars, bucket_ms, price, size):
        """Aplica un trade a la vela viva (mismo bucket) o abre una nueva."""
        if bars and bars[-1][0] == bucket_ms:
            last = bars[-1]
            last[2] = max(last[2], price)
            last[3] = min(last[3], price)
            last[4] = price
            last[5] += size
            last[7] += size * price
        elif bars and bucket_ms > bars[-1][0]:
            bars.append([bucket_ms, price, price, price, price, size, bucket_ms, size * price])
            if len(bars) > MAX_BARS:
                del bars[0]

    def handle_match(self, data):
        symbol = self.product_to_symbol.get(data.get('product_id'))
        if not symbol:
            return
        record_order_flow_trade(symbol, data)
        try:
            price = float(data['price'])
            size = float(data['size'])
        except (KeyError, ValueError):
            return
        ts = _parse_trade_ts(data.get('time', ''))

        for interval in self.intervals:
            room = f'crypto:{symbol}:{interval}'
            if not self.hooks['has_subscribers'](room):
                continue
            bars = self.ensure_seeded(symbol, interval)
            if not bars:
                continue

            iv_sec = INTERVAL_SECONDS.get(interval, 900)
            bucket_ms = int(ts // iv_sec) * iv_sec * 1000
            with self.store_lock:
                self.apply_trade(bars, bucket_ms, price, size)

            now = time.time()
            last = self.last_recompute.get(room, 0)
            if now - last < MIN_RECOMPUTE_GAP:
                continue
            self.last_recompute[room] = now

            try:
                vol_24h = self.hooks['get_vol_24h'](symbol)
            except Exception:
                vol_24h = None
            try:
                payload = self.hooks['build_payload'](symbol, interval, 'crypto', list(bars), vol_24h)
            except Exception as e:
                logger.warning(f"[Stream] build_payload fallo para {room}: {e}")
                continue

            self.hooks['store_payload'](f'crypto:{symbol}_{interval}', payload)

            sig = json.dumps(payload, sort_keys=True, default=str)
            if self.last_emitted.get(room) == sig:
                continue
            self.last_emitted[room] = sig
            try:
                self.socketio.emit('trading_data_update', payload, room=room)
            except Exception as e:
                logger.warning(f"[Stream] emit fallo para {room}: {e}")

    def run(self):
        logger.info("[Stream] Hilo de streaming de Coinbase iniciado.")
        backoff = BASE_RECONNECT
        while self.running:
            ws = None
            try:
                ws = websocket.WebSocket()
                ws.connect(STREAM_URL, timeout=20)
                ws.settimeout(PING_KEEPALIVE + 10)
                subscribe = {
                    'type': 'subscribe',
                    'product_ids': self.products,
                    'channels': ['ticker', 'matches'],
                }
                ws.send(json.dumps(subscribe))
                logger.info(f"[Stream] Conectado a Coinbase WS ({len(self.products)} productos, ticker+matches).")
                backoff = BASE_RECONNECT
                while self.running:
                    raw = ws.recv()
                    if not raw:
                        continue
                    try:
                        msg = json.loads(raw)
                    except Exception:
                        continue
                    msg_type = msg.get('type')
                    if msg_type == 'ticker':
                        self.handle_ticker(msg)
                    elif msg_type in ('match', 'last_match'):
                        self.handle_match(msg)
                    elif msg_type == 'error':
                        logger.warning(f"[Stream] error de Coinbase WS: {msg}")
            except Exception as e:
                logger.warning(f"[Stream] desconexion/error en Coinbase WS: {e}")
            finally:
                try:
                    if ws:
                        ws.close()
                except Exception:
                    pass
            time.sleep(backoff)
            backoff = min(backoff * 2, MAX_RECONNECT)


def init_coinbase_stream(socketio, hooks, symbols, intervals):
    thread = CoinbaseStreamThread(socketio, hooks, symbols, intervals)
    t = threading.Thread(target=thread.run, daemon=True)
    t.start()
    return thread
