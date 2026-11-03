"""Gestor y orquestador de streams en tiempo real (Binance WS + Coinbase WS + Yahoo Finance WS).

Centraliza la configuración y el cableado de callbacks para los streams
de mercado en vivo, desacoplando app.py de los detalles de streaming.

Con MARKET_BACKEND=redis este modulo es el UNICO escritor de Redis: solo corre
en el proceso feeder (feeder.py), que es el unico autorizado a hablar con los
exchanges. La API HTTP y los sockets leen Redis y nunca tocan un exchange.
"""

import logging

from common.sockets import subscriber_rooms
from common import market_store
from gateways.binance_stream import init_binance_stream
from gateways.coinbase_stream import init_coinbase_stream
from gateways.yahoo_stream import init_yahoo_stream
from services.data_fetchers import (
    fetch_klines_and_volume, fetch_quote_volume_24h, update_ticker_cache,
    record_order_flow_trade,
)
from common.cache import store_payload, CRYPTO_SYMBOLS, STOCK_SYMBOLS
from services.payload_builder import build_payload

logger = logging.getLogger(__name__)

STREAM_TIMEFRAMES = ['1m', '5m', '15m', '1h', '6h', '1d']


def _split_store_key(key):
    """Convierte la clave del cache local a identidad de feed.

    Formatos emitidos por los streams:
        'crypto:binance:ETHUSDT_15m' / 'crypto:coinbase:ETHUSDT_15m'
        'stock:AAPL_15m'   (Yahoo, sin proveedor en la clave)
    """
    parts = key.split(':')
    if len(parts) == 3:
        market, provider, rest = parts
    elif len(parts) == 2:
        market, provider, rest = parts[0], 'yahoo', parts[1]
    else:
        return None
    if '_' not in rest:
        return None
    symbol, interval = rest.rsplit('_', 1)
    return market, provider, symbol, interval


def make_store_hook():
    """Devuelve el hook store_payload: escribe el snapshot completo en Redis y
    notifica la sala; si Redis no esta activo cae al cache en memoria.

    No recibe proveedor: la identidad (market/provider/symbol/interval) ya viene
    codificada en la clave que pasan los streams, asi un solo hook sirve para
    Binance, Coinbase y Yahoo sin estado cruzado.

    El historico se reescribe en CADA tick (no solo al cerrar vela): dentro de
    `history` van la vela en formacion y las series de RSI/MACD/BB/EMA que dibujan
    los graficos, y todas cambian con el precio actual. Escribirlo solo al cierre
    dejaria al frontend con graficos congelados hasta 15 min. El costo es local
    (Redis escribe ~94 KB gzip por tick, con MIN_RECOMPUTE_GAP de 1.5 s por sala)
    y no cambia el numero de peticiones al exchange, que es lo que se busca.
    """
    def _store(key, payload):
        parsed = _split_store_key(key)
        if parsed is None or not isinstance(payload, dict):
            return
        _market, provider, symbol, interval = parsed
        if not market_store.redis_active():
            store_payload(key, payload)
            return
        market_store.write_payload(
            provider, symbol, interval, payload, include_history=True
        )

    return _store


def make_subscribers_hook():
    """has_subscribers desde el registro compartido de salas.

    En modo Redis las suscripciones viven en los procesos API (no en el feeder),
    asi que el registro se comparte por Redis. Con cache local de 1 s porque los
    streams lo consultan por cada trade recibido.
    """
    def _has(room):
        if market_store.redis_active():
            return market_store.has_subscribers(room)
        return room in subscriber_rooms
    return _has


def init_market_streams(socketio):
    """Inicializa streams independientes para cada proveedor de mercado."""
    store_hook = make_store_hook()
    subscribers_hook = make_subscribers_hook()

    init_binance_stream(
        socketio,
        {
            'fetch_klines_vol': lambda s, iv, m: fetch_klines_and_volume(
                s, iv, m, 'binance'
            ),
            'build_payload': lambda s, iv, m, k, v, p: build_payload(
                s, iv, m, k, v, p
            ),
            'get_vol_24h': lambda s: fetch_quote_volume_24h(s, 'binance'),
            'update_ticker': lambda s, v: update_ticker_cache(s, v, 'binance'),
            'record_trade': lambda s, trade: record_order_flow_trade(
                s, trade, 'binance'
            ),
            'store_payload': store_hook,
            'has_subscribers': subscribers_hook,
        },
        sorted(CRYPTO_SYMBOLS),
        STREAM_TIMEFRAMES,
    )

    init_coinbase_stream(
        socketio,
        {
            'fetch_klines_vol': lambda s, iv, m: fetch_klines_and_volume(
                s, iv, m, 'coinbase'
            ),
            'build_payload': lambda s, iv, m, k, v, p: build_payload(
                s, iv, m, k, v, p
            ),
            'get_vol_24h': lambda s: fetch_quote_volume_24h(s, 'coinbase'),
            'update_ticker': lambda s, v: update_ticker_cache(s, v, 'coinbase'),
            'record_trade': lambda s, trade: record_order_flow_trade(
                s, trade, 'coinbase'
            ),
            'store_payload': store_hook,
            'has_subscribers': subscribers_hook,
        },
        sorted(CRYPTO_SYMBOLS),
        STREAM_TIMEFRAMES,
    )

    # STREAMING DE STOCKS VIA YAHOO FINANCE WS (wss://streamer.finance.yahoo.com):
    # solo llegan QUOTES (protobuf en base64) cuando hay cambios reales de
    # cotizacion. El WS actualiza el cierre de la vela viva y recalcula el payload;
    # si Yahoo no envia nada (fin de semana, feriado), el polling REST sigue como
    # respaldo sin ningun cambio de comportamiento.
    init_yahoo_stream(
        socketio,
        {
            'fetch_klines_vol': lambda s, iv, m: fetch_klines_and_volume(s, iv, m),
            'build_payload': lambda s, iv, m, k, v: build_payload(s, iv, m, k, v),
            'store_payload': store_hook,
            'has_subscribers': subscribers_hook,
        },
        sorted(STOCK_SYMBOLS),
        STREAM_TIMEFRAMES,
    )
