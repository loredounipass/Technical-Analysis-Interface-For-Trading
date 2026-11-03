"""Configuracion e identidad del proveedor Coinbase.

Contiene las URLs base, headers y granularidades compartidas por los fetchers
de Coinbase, junto con el mapeo de simbolo USDT -> product id en USD.
"""

COINBASE_BASE = 'https://api.exchange.coinbase.com'
COINBASE_ADV_BASE = 'https://api.coinbase.com/api/v3/brokerage/market'
COINBASE_HEADERS = {'User-Agent': 'woody-quant/1.0', 'Accept': 'application/json'}
# Granularidad en segundos que Coinbase acepta DIRECTAMENTE en /candles.
# Ojo: 21600 son 6 HORAS, no 4. No existe 4h ni 1w nativos aqui.
COINBASE_GRANULARITY = {'1m': 60, '5m': 300, '15m': 900, '1h': 3600, '6h': 21600, '1d': 86400}
# Timeframes que Coinbase NO soporta de forma nativa se construyen agregando
# velas base: label -> (granularidad base en segundos, velas base por vela). Evita
# el antiguo bug donde '4h' caia a 21600 (6h) y '1w' al fallback de 900 (15m).
COINBASE_AGGREGATION = {
    '30m': (900, 2),
    '2h': (3600, 2),
    '4h': (3600, 4),
    '12h': (21600, 2),
    '1w': (86400, 7),
}
COINBASE_PAGE = 300  # max velas por peticion de /candles


def coinbase_product_id(symbol):
    """BTCUSDT -> BTC-USD (Coinbase cotiza contra USD, no USDT)."""
    base = symbol[:-4] if symbol.endswith('USDT') else symbol
    return f"{base}-USD"
