"""Payload builder: construye el dict completo de indicadores + historial
a partir de klines crudas.

Funcion pura reutilizable: el hilo de streaming la invoca para recalcular
con la vela viva del exchange sin hacer re-fetch REST.

El modulo se dividio en submodulos por etapa (kline_parser, price_action,
liquidity, builder, rest_entry) y aqui se re-exporta la API publica, de modo
que `from services.payload_builder import build_payload, fetch_trading_data`
siga funcionando exactamente igual.
"""

from services.payload_builder.builder import build_payload
from services.payload_builder.rest_entry import fetch_trading_data


__all__ = [
    "build_payload",
    "fetch_trading_data",
]
