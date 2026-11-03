"""Payload builder: construye el dict completo de indicadores + historial
a partir de klines crudas.

Funcion pura reutilizable: el hilo de streaming la invoca para recalcular
con la vela viva del exchange sin hacer re-fetch REST.

Las etapas con fronteras limpias se delegan en submodulos (kline_parser,
price_action, liquidity); aqui queda la orquestacion y las etapas que
comparten variables de forma fragil (series, historial sintetico, senales y
ensamble del resultado), conservadas tal cual.
"""

import time
import math
import logging

from services.indicators import (
    compute_rsi_series, compute_ema_series, compute_macd_series,
    compute_bollinger_series, compute_stoch_series, compute_stoch_rsi_series,
    compute_cci_series, compute_mfi_series, compute_adx_series, compute_pivots,
    compute_squeeze_momentum_series,
    compute_signal_summary, last_non_none, price_decimals, forex_decimals,
)
from services.data_fetchers import fetch_last_price, interval_seconds

from services.payload_builder.kline_parser import parse_klines
from services.payload_builder.price_action import compute_price_action
from services.payload_builder.liquidity import compute_liquidity

logger = logging.getLogger(__name__)


def build_payload(symbol, interval_str, market, klines, vol_24h=None,
                  provider='coinbase'):
    """CONSTRUYE EL PAYLOAD COMPLETO (indicadores + historia + senales) A PARTIR
    DE KLINES."""
    is_synthetic = False
    secs = interval_seconds(interval_str)
    parsed = parse_klines(klines)
    opens = parsed['opens']
    highs = parsed['highs']
    lows = parsed['lows']
    closes = parsed['closes']
    timestamps = parsed['timestamps']
    quote_volumes = parsed['quote_volumes']
    base_volumes = parsed['base_volumes']

    provider = 'yahoo' if market == 'stock' else provider
    precio = closes[-1] if closes else fetch_last_price(symbol, market, provider)

    history = {}
    if klines:
        history['opens'] = opens
        history['highs'] = highs
        history['lows'] = lows
        history['closes'] = closes
        history['times'] = timestamps
        # Volumen por vela en USDT (quote volume) para el agente y graficos
        history['volumes'] = [float(k[7]) for k in klines]
        # Volumen por vela en moneda base (exacto, sin conversion)
        history['volumesBase'] = base_volumes

    # Series tecnicas (valores actuales + historial para graficos)
    rsi_series = []
    stoch_k = []
    stoch_d = []
    stoch_rsi_k = []
    stoch_rsi_d = []
    cci_series = []
    macd_line = []
    macd_signal = []
    bb_upper = []
    bb_middle = []
    bb_lower = []
    ema50 = []
    ema100 = []
    ema200 = []
    adx = []
    plus_di = []
    minus_di = []
    squeeze_momentum = []
    squeeze_state = []
    pivots = (None, None, None, None, None, None)
    try:
        rsi_series = compute_rsi_series(closes, period=14)
        stoch_k, stoch_d = compute_stoch_series(highs, lows, closes)
        stoch_rsi_k, stoch_rsi_d = compute_stoch_rsi_series(rsi_series)
        cci_series = compute_cci_series(highs, lows, closes, period=20)
        mfi_series = compute_mfi_series(highs, lows, closes, quote_volumes if quote_volumes else [1.0] * len(closes), period=14)
        macd_line, macd_signal = compute_macd_series(closes, fast=12, slow=26, signal=9)
        bb_upper, bb_middle, bb_lower = compute_bollinger_series(closes, period=20)
        ema50 = compute_ema_series(closes, 50)
        ema100 = compute_ema_series(closes, 100)
        ema200 = compute_ema_series(closes, 200)
        adx, plus_di, minus_di = compute_adx_series(highs, lows, closes)
        squeeze_momentum, squeeze_state = compute_squeeze_momentum_series(highs, lows, closes)
        pivots = compute_pivots(highs, lows, closes, timestamps)

        history['rsi'] = rsi_series
        history['macd'] = macd_line
        history['macd_signal'] = macd_signal
        history['macd_hist'] = [
            (a - b) if (a is not None and b is not None) else None
            for a, b in zip(macd_line, macd_signal)
        ]
        history['bb_upper'] = bb_upper
        history['bb_middle'] = bb_middle
        history['bb_lower'] = bb_lower
        history['ema50'] = ema50
        history['ema100'] = ema100
        history['ema200'] = ema200
        history['rsiStoch'] = stoch_rsi_k
        history['rsiStochD'] = stoch_rsi_d
        history['stochK'] = stoch_k
        history['stochD'] = stoch_d
        history['cci'] = cci_series
        history['mfi'] = mfi_series
        history['adx'] = adx
        history['plusDi'] = plus_di
        history['minusDi'] = minus_di
        history['squeezeMomentum'] = squeeze_momentum
        history['squeezeState'] = squeeze_state
    except Exception as e:
        logger.error(f"[TradingData] calculo de indicadores fallo para {symbol}: {e}")

    # Si no hay historial real, construir una historia sintetica basada en el precio actual
    if not history.get('closes'):
        try:
            is_synthetic = True
            base = float(precio)
            synthetic = []
            s_opens = []
            s_highs = []
            s_lows = []
            prev_close = base
            for i in range(50):
                noise = 1 + 0.002 * math.sin(i / 3.0)
                close = base * noise
                open_ = prev_close
                high = max(open_, close) * 1.0005
                low = min(open_, close) * 0.9995
                synthetic.append(close)
                s_opens.append(open_)
                s_highs.append(high)
                s_lows.append(low)
                prev_close = close
            history['closes'] = synthetic
            history['opens'] = s_opens
            history['highs'] = s_highs
            history['lows'] = s_lows
            history['times'] = [int(time.time()) - (50 - i) * secs for i in range(50)]

            closes = synthetic
            highs = s_highs
            lows = s_lows
            opens = s_opens
            rsi_series = compute_rsi_series(closes, period=14)
            stoch_k, stoch_d = compute_stoch_series(highs, lows, closes)
            stoch_rsi_k, stoch_rsi_d = compute_stoch_rsi_series(rsi_series)
            cci_series = compute_cci_series(highs, lows, closes, period=20)
            mfi_series = compute_mfi_series(highs, lows, closes, [1000.0] * len(closes), period=14)
            macd_line, macd_signal = compute_macd_series(closes, fast=12, slow=26, signal=9)
            bb_upper, bb_middle, bb_lower = compute_bollinger_series(closes, period=20)
            ema50 = compute_ema_series(closes, 50)
            ema100 = compute_ema_series(closes, 100)
            ema200 = compute_ema_series(closes, 200)
            adx, plus_di, minus_di = compute_adx_series(highs, lows, closes)
            squeeze_momentum, squeeze_state = compute_squeeze_momentum_series(highs, lows, closes)
            pivots = compute_pivots(highs, lows, closes, history['times'])

            history['rsi'] = rsi_series
            history['macd'] = macd_line
            history['macd_signal'] = macd_signal
            history['macd_hist'] = [
                (a - b) if (a is not None and b is not None) else None
                for a, b in zip(macd_line, macd_signal)
            ]
            history['bb_upper'] = bb_upper
            history['bb_middle'] = bb_middle
            history['bb_lower'] = bb_lower
            history['ema50'] = ema50
            history['ema100'] = ema100
            history['ema200'] = ema200
            history['rsiStoch'] = stoch_rsi_k
            history['rsiStochD'] = stoch_rsi_d
            history['stochK'] = stoch_k
            history['stochD'] = stoch_d
            history['cci'] = cci_series
            history['mfi'] = mfi_series
            history['adx'] = adx
            history['plusDi'] = plus_di
            history['minusDi'] = minus_di
            history['squeezeMomentum'] = squeeze_momentum
            history['squeezeState'] = squeeze_state

            if vol_24h is None:
                vol_24h = precio * max(1, 86400 // secs)
        except Exception as e:
            logger.error(f"[TradingData] historia sintetica fallo para {symbol}: {e}")

    # Price action + order flow (order blocks, FVG, swings) con velas reales.
    order_blocks, fair_value_gaps, liquidity_swings, order_flow = compute_price_action(
        klines, symbol, market, opens, highs, lows, closes, timestamps,
        quote_volumes, provider
    )

    # Los indicadores se calculan con toda la historia (convergencia exacta);
    # el historial que se envia al frontend se recorta a 500 velas para navegacion profunda
    if history:
        history = {k: v[-500:] for k, v in history.items()}

    buy, sell, neutral = compute_signal_summary(
        last_non_none(rsi_series),
        last_non_none(stoch_k),
        last_non_none(stoch_d),
        last_non_none(cci_series),
        last_non_none(macd_line),
        last_non_none(macd_signal),
        last_non_none(adx),
        last_non_none(plus_di),
        last_non_none(minus_di),
        last_non_none(stoch_rsi_k),
        last_non_none(ema50),
        last_non_none(ema100),
        last_non_none(ema200),
        precio,
        last_non_none(mfi_series),
    )
    r1, r2, r3, s1, s2, s3 = pivots
    macd_curr = last_non_none(macd_line)
    macd_sig_curr = last_non_none(macd_signal)
    macd_hist = (macd_curr - macd_sig_curr) if (macd_curr is not None and macd_sig_curr is not None) else None

    # Libro de ordenes real + dominancia compradora (order book crypto, volume
    # profile / proxy de volumen en stocks).
    liq = compute_liquidity(
        symbol, market, precio, opens, highs, lows, closes, quote_volumes,
        provider
    )
    bid_vol = liq['bid_vol']
    ask_vol = liq['ask_vol']
    best_bid = liq['best_bid']
    best_ask = liq['best_ask']
    buyer_percent = liq['buyer_percent']
    ob_source = liq['ob_source']
    depth_raw = liq['depth_raw']

    result = {
        'symbol': symbol,
        'market': market,
        'provider': provider,
        'precio': precio,
        'decimales': forex_decimals(symbol) or price_decimals(precio),
        'rsi': last_non_none(rsi_series),
        'rsiStoch': last_non_none(stoch_rsi_k),
        'rsiStochD': last_non_none(stoch_rsi_d),
        'volumen': vol_24h if vol_24h is not None else (quote_volumes[-1] if quote_volumes else None),
        # Volumen de la ULTIMA VELA del timeframe activo (USDT). A diferencia del
        # 'volumen' (ticker 24h fijo), este SÍ se adapta al timeframe: en 15m es
        # lo negociado en ese bloque de 15m, en 1D el dia completo. Es el
        # equivalente al indicador VOL por vela de Binance.
        'volCandle': quote_volumes[-1] if quote_volumes else None,
        # Volumen de la ultima vela en MONEDA BASE (exacto, crudo del exchange).
        'volCandleBase': base_volumes[-1] if base_volumes else None,
        # Activo base del par (ETHUSDT -> ETH) para etiquetar la unidad. Solo
        # crypto; stocks/indices se etiquetan como 'shares'.
        'baseAsset': (symbol[:-4] if market == 'crypto' and symbol.endswith('USDT') else (symbol if market == 'crypto' else 'shares')),
        'bbUpper': last_non_none(bb_upper),
        'bbMiddle': last_non_none(bb_middle),
        'bbLower': last_non_none(bb_lower),
        'macdValue': last_non_none(macd_line),
        'macdSignal': last_non_none(macd_signal),
        'macdHistogram': macd_hist,
        'adx': last_non_none(adx),
        'plusDi': last_non_none(plus_di),
        'minusDi': last_non_none(minus_di),
        'squeezeMomentum': last_non_none(squeeze_momentum),
        'squeezeState': squeeze_state[-1] if squeeze_state else None,
        'stochK': last_non_none(stoch_k),
        'stochD': last_non_none(stoch_d),
        'cci': last_non_none(cci_series),
        'mfi': last_non_none(mfi_series),
        'ema50': last_non_none(ema50),
        'ema100': last_non_none(ema100),
        'ema200': last_non_none(ema200),
        's1': s1,
        's2': s2,
        's3': s3,
        'r1': r1,
        'r2': r2,
        'r3': r3,
        'buySignals': buy,
        'sellSignals': sell,
        'neutralSignals': neutral,
        'buyerPercent': buyer_percent,
        'bidVolume': bid_vol,
        'askVolume': ask_vol,
        'bestBid': best_bid,
        'bestAsk': best_ask,
        'orderBookSource': ob_source,
        'depthRaw': depth_raw,
        'orderBlocks': order_blocks,
        'fairValueGaps': fair_value_gaps,
        'liquiditySwings': liquidity_swings,
        'orderFlow': order_flow,
        'timeframe': interval_str,
        'history': history
    }
    if is_synthetic:
        result['synthetic'] = True
    return result
