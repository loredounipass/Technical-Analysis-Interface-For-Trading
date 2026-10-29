"""Gestor y orquestador de streams en tiempo real (Binance WS + Yahoo Finance WS).

Centraliza la configuración y el cableado de callbacks para los streams
de mercado en vivo, desacoplando app.py de los detalles de streaming.
"""

from sockets import subscriber_rooms
from binance_stream import init_binance_stream
from yahoo_stream import init_yahoo_stream
from data_fetchers import (
    fetch_klines_and_volume, fetch_quote_volume_24h, update_ticker_cache,
)
from cache import store_payload, CRYPTO_SYMBOLS, STOCK_SYMBOLS
from payload_builder import build_payload

STREAM_TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d']


def init_market_streams(socketio):
    """Inicializa los streams en tiempo real de Binance (crypto) y Yahoo Finance (stocks)."""
    # STREAMING EN TIEMPO REAL DE BINANCE: actualiza la caché y emite a las salas
    # con la vela viva (klines + volumen 24h) sin hacer re-fetch REST.
    init_binance_stream(
        socketio,
        {
            'fetch_klines_vol': lambda s, iv, m: fetch_klines_and_volume(s, iv, m),
            'build_payload': lambda s, iv, m, k, v: build_payload(s, iv, m, k, v),
            'get_vol_24h': fetch_quote_volume_24h,
            'update_ticker': update_ticker_cache,
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
