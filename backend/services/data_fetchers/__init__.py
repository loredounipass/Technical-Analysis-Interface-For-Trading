"""Data fetchers: funciones que obtienen datos de mercado desde APIs externas.

Coinbase Exchange / Advanced Trade, Binance (ambos proveedores de crypto) y
Yahoo Finance (stocks).
Funciones puras de I/O: no tocan cache, no dependen de Flask.

El modulo se dividio en submodulos por fuente (coinbase_client, binance,
coinbase_klines, coinbase_order_flow, coinbase_order_book, yahoo, price_utils)
y aqui se re-exporta toda la API publica, de modo que
`from services.data_fetchers import ...` siga funcionando exactamente igual.
"""

from services.data_fetchers.coinbase_client import (
    COINBASE_BASE, COINBASE_ADV_BASE, COINBASE_HEADERS,
    COINBASE_GRANULARITY, COINBASE_PAGE, coinbase_product_id,
)
from services.data_fetchers.binance import (
    fetch_klines, fetch_quote_volume_24h, update_ticker_cache,
)
from services.data_fetchers.coinbase_klines import fetch_coinbase_klines
from services.data_fetchers.coinbase_order_flow import (
    record_order_flow_trade, get_order_flow_trades,
)
from services.data_fetchers.coinbase_order_book import fetch_order_book_depth
from services.data_fetchers.yahoo import fetch_yahoo_chart
from services.data_fetchers.price_utils import (
    interval_seconds, fetch_yahoo_meta_price, fetch_last_price,
    fetch_klines_and_volume,
)


__all__ = [
    "COINBASE_BASE", "COINBASE_ADV_BASE", "COINBASE_HEADERS",
    "COINBASE_GRANULARITY", "COINBASE_PAGE", "coinbase_product_id",
    "fetch_klines", "fetch_quote_volume_24h", "update_ticker_cache",
    "fetch_coinbase_klines",
    "record_order_flow_trade", "get_order_flow_trades",
    "fetch_order_book_depth",
    "fetch_yahoo_chart",
    "interval_seconds", "fetch_yahoo_meta_price", "fetch_last_price",
    "fetch_klines_and_volume",
]
