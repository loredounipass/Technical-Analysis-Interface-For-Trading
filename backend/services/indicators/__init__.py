"""Indicadores tecnicos puros: funciones sin estado ni side-effects.

Todas las funciones reciben listas de floats/ints y devuelven listas del
mismo largo.  NO dependen de Flask, requests ni de ningun otro modulo del
proyecto.

El modulo se dividio en submodulos por dominio tecnico (series_utils,
moving_averages, oscillators, price_action_zones, order_flow, pivot_points,
signal_consensus) y aqui se re-exporta toda la API publica, de modo que
`from services.indicators import ...` siga funcionando exactamente igual.
"""

from services.indicators.series_utils import (
    last_non_none, price_decimals, forex_decimals,
)
from services.indicators.moving_averages import (
    compute_sma, compute_sma_series, compute_ema_series,
)
from services.indicators.oscillators import (
    compute_rsi_series, compute_macd_series, compute_bollinger_series,
    compute_stoch_series, compute_stoch_rsi_series, compute_cci_series,
    compute_mfi_series, compute_adx_series,
)
from services.indicators.price_action_zones import (
    compute_order_blocks, compute_fair_value_gaps, compute_liquidity_swings,
)
from services.indicators.order_flow import (
    compute_order_flow_proxy, compute_order_flow,
)
from services.indicators.pivot_points import compute_pivots
from services.indicators.signal_consensus import compute_signal_summary


__all__ = [
    "last_non_none", "price_decimals", "forex_decimals",
    "compute_sma", "compute_sma_series", "compute_ema_series",
    "compute_rsi_series", "compute_macd_series", "compute_bollinger_series",
    "compute_stoch_series", "compute_stoch_rsi_series", "compute_cci_series",
    "compute_mfi_series", "compute_adx_series",
    "compute_order_blocks", "compute_fair_value_gaps", "compute_liquidity_swings",
    "compute_order_flow_proxy", "compute_order_flow",
    "compute_pivots",
    "compute_signal_summary",
]
