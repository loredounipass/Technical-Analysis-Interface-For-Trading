"""Configuracion e identidad de Coinbase (fuente primaria de crypto).

Contiene las URLs base, headers y granularidades compartidas por los fetchers
de Coinbase, junto con el mapeo de simbolo USDT -> product id en USD.
"""

COINBASE_BASE = 'https://api.exchange.coinbase.com'
COINBASE_ADV_BASE = 'https://api.coinbase.com/api/v3/brokerage/market'
COINBASE_HEADERS = {'User-Agent': 'woody-quant/1.0', 'Accept': 'application/json'}
# Granularidad en segundos que acepta /products/{id}/candles
COINBASE_GRANULARITY = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '4h': 21600, '1d': 86400}
COINBASE_PAGE = 300  # max velas por peticion de /candles


def coinbase_product_id(symbol):
    """BTCUSDT -> BTC-USD (Coinbase cotiza contra USD, no USDT)."""
    base = symbol[:-4] if symbol.endswith('USDT') else symbol
    return f"{base}-USD"
