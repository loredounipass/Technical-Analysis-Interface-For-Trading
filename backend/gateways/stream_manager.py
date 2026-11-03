"""Gestor y orquestador de streams en tiempo real (Coinbase WS + Yahoo Finance WS).

Centraliza la configuración y el cableado de callbacks para los streams
de mercado en vivo, desacoplando app.py de los detalles de streaming.
"""

from common.sockets import subscriber_rooms
from gateways.binance_stream import init_binance_stream
from gateways.coinbase_stream import init_coinbase_stream
from gateways.yahoo_stream import init_yahoo_stream
from services.data_fetchers import (
    fetch_klines_and_volume, fetch_quote_volume_24h, update_ticker_cache,
    record_order_flow_trade,
)
from common.cache import store_payload, CRYPTO_SYMBOLS, STOCK_SYMBOLS
from services.payload_builder import build_payload

STREAM_TIMEFRAMES = ['1m', '5m', '15m', '1h', '6h', '1d']


def init_market_streams(socketio):
    """Inicializa streams independientes para cada proveedor de mercado."""
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
            'store_payload': store_payload,
            'has_subscribers': lambda room: room in subscriber_rooms,
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
            'store_payload': store_payload,
            'has_subscribers': lambda room: room in subscriber_rooms,
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
            'store_payload': store_payload,
            'has_subscribers': lambda room: room in subscriber_rooms,
        },
        sorted(STOCK_SYMBOLS),
        STREAM_TIMEFRAMES,
    )
