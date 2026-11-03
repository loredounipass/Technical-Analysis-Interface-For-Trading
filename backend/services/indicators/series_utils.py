"""Utilidades de series y escala de precio compartidas por los indicadores."""


# RETORNA EL ULTIMO VALOR NO-NULO DE UNA SERIE (None si no hay ninguno)
def last_non_none(series):
    if not series:
        return None
    for v in reversed(series):
        if v is not None:
            return v
    return None


# DECIMALES DINAMICOS ESTILO BINANCE: escala segun la magnitud del precio.
# PEPE (~0.000011) y similares necesitan 8 decimales; BTC 2; DOGE/XRP 4-6.
def price_decimals(price):
    if not price or price <= 0:
        return 2
    if price < 0.0001:
        return 8
    if price < 0.01:
        return 6
    if price < 1:
        return 4
    if price < 100:
        return 3
    return 2


# CONVENCION FOREX: los pares con sufijo =X de Yahoo cotizan con 5 decimales
# (los que incluyen JPY, 3). Sin esto, EURUSD a 1.12 se mostraria con 3
# decimales y las variaciones del par parecerian siempre 0.00.
def forex_decimals(symbol):
    if not symbol or not symbol.endswith('=X'):
        return None
    base = symbol[:-2]
    if base.endswith('JPY'):
        return 3
    return 5
