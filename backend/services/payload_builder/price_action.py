"""Price action (order blocks, FVG, swings) y order flow por mercado."""

import logging

from services.indicators import (
    compute_order_blocks, compute_fair_value_gaps, compute_liquidity_swings,
    compute_order_flow, compute_order_flow_proxy,
)
from services.data_fetchers import get_order_flow_trades

logger = logging.getLogger(__name__)


def compute_price_action(klines, symbol, market, opens, highs, lows,
                         closes, timestamps, quote_volumes, provider='coinbase'):
    """Calcula order blocks, fair value gaps, swings de liquidez y order flow.

    El price action se calcula exclusivamente con velas reales del exchange
    (guardado por `if klines`); el order flow usa el tape real en crypto y un
    proxy direccional por vela en stocks/indices.
    """
    order_blocks = []
    fair_value_gaps = []
    liquidity_swings = []
    order_flow = None
    if klines:
        try:
            order_blocks = compute_order_blocks(
                opens, highs, lows, closes, timestamps
            )
            fair_value_gaps = compute_fair_value_gaps(
                highs, lows, closes, timestamps
            )
            liquidity_swings = compute_liquidity_swings(
                highs, lows, closes, timestamps
            )
        except Exception as e:
            logger.error(f"[TradingData] price action fallo para {symbol}: {e}")
    if market == 'crypto':
        try:
            order_flow = compute_order_flow(
                get_order_flow_trades(symbol, provider=provider),
                provider=provider,
            )
        except Exception as e:
            logger.warning(f"[TradingData] order flow fallo para {symbol}: {e}")
    elif klines and closes:
        # Stocks/indices: Yahoo no expone tape; proxy direccional por vela
        try:
            order_flow = compute_order_flow_proxy(
                opens, highs, lows, closes, quote_volumes, timestamps
            )
        except Exception as e:
            logger.warning(f"[TradingData] order flow proxy fallo para {symbol}: {e}")

    return order_blocks, fair_value_gaps, liquidity_swings, order_flow
