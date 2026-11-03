"""Entry point REST/socket: klines + volumen + indicadores + precio en vivo."""

import logging

from services.data_fetchers import fetch_klines_and_volume, fetch_last_price
from services.payload_builder.builder import build_payload

logger = logging.getLogger(__name__)


def fetch_trading_data(symbol, interval_str='15m', market='crypto',
                       provider='coinbase'):
    """ENTRY POINT REST/SOCKET: KLINES + VOLUMEN + INDICADORES COMPLETOS."""
    provider = 'yahoo' if market == 'stock' else provider
    klines, vol_24h = fetch_klines_and_volume(
        symbol, interval_str, market, provider
    )
    payload = build_payload(
        symbol, interval_str, market, klines, vol_24h, provider
    )
    # Precio principal: ticker EN VIVO. Crypto: Coinbase (el cierre de la ultima
    # vela REST puede llevar unos segundos de retraso por la paginacion).
    # Stocks/indices/oro: Yahoo regularMarketPrice (el cierre de la vela viva del
    # chart puede atrasarse unos minutos respecto al quote actual).
    if klines:
        try:
            live_price = fetch_last_price(symbol, market, provider)
            if live_price and live_price > 0:
                payload['precio'] = live_price
        except Exception as e:
            logger.warning(f"[TradingData] ticker en vivo fallo para {symbol}: {e}")
    return payload
