"""Payload builder: construye el dict completo de indicadores + historial
a partir de klines crudas.

Funcion pura reutilizable: el hilo de streaming la invoca para recalcular
con la vela viva del exchange sin hacer re-fetch REST.
"""

import time
import math
import logging

from indicators import (
    compute_rsi_series, compute_ema_series, compute_macd_series,
    compute_bollinger_series, compute_stoch_series, compute_stoch_rsi_series,
    compute_cci_series, compute_adx_series, compute_pivots,
    compute_signal_summary, last_non_none, price_decimals,
)
from data_fetchers import (
    fetch_last_price, fetch_klines_and_volume, interval_seconds,
    fetch_order_book_depth,
)

logger = logging.getLogger(__name__)


def build_payload(symbol, interval_str, market, klines, vol_24h=None):
    """CONSTRUYE EL PAYLOAD COMPLETO (indicadores + historia + senales) A PARTIR
    DE KLINES."""
    is_synthetic = False
    secs = interval_seconds(interval_str)
    opens = []
    highs = []
    lows = []
    closes = []
    timestamps = []
    quote_volumes = []
    if klines:
        opens = [float(k[1]) for k in klines]
        highs = [float(k[2]) for k in klines]
        lows = [float(k[3]) for k in klines]
        closes = [float(k[4]) for k in klines]
        timestamps = [int(k[0]) for k in klines]
        quote_volumes = [float(k[7]) for k in klines]

    precio = closes[-1] if closes else fetch_last_price(symbol, market)

    history = {}
    if klines:
        history['opens'] = opens
        history['highs'] = highs
        history['lows'] = lows
        history['closes'] = closes
        history['times'] = timestamps
        # Volumen por vela en USDT (quote volume) para el agente y graficos
        history['volumes'] = [float(k[7]) for k in klines]

    # Series tecnicas (valores actuales + historial para graficos)
    rsi_series = []
    stoch_k = []
    stoch_d = []
    stoch_rsi_k = []
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
    pivots = (None, None, None, None, None, None)
    try:
        rsi_series = compute_rsi_series(closes, period=14)
        stoch_k, stoch_d = compute_stoch_series(highs, lows, closes)
        stoch_rsi_k = compute_stoch_rsi_series(rsi_series)
        cci_series = compute_cci_series(highs, lows, closes, period=20)
        macd_line, macd_signal = compute_macd_series(closes, fast=12, slow=26, signal=9)
        bb_upper, bb_middle, bb_lower = compute_bollinger_series(closes, period=20)
        ema50 = compute_ema_series(closes, 50)
        ema100 = compute_ema_series(closes, 100)
        ema200 = compute_ema_series(closes, 200)
        adx, plus_di, minus_di = compute_adx_series(highs, lows, closes)
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
        history['stochK'] = stoch_k
        history['stochD'] = stoch_d
        history['cci'] = cci_series
        history['adx'] = adx
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
            stoch_rsi_k = compute_stoch_rsi_series(rsi_series)
            cci_series = compute_cci_series(highs, lows, closes, period=20)
            macd_line, macd_signal = compute_macd_series(closes, fast=12, slow=26, signal=9)
            bb_upper, bb_middle, bb_lower = compute_bollinger_series(closes, period=20)
            ema50 = compute_ema_series(closes, 50)
            ema100 = compute_ema_series(closes, 100)
            ema200 = compute_ema_series(closes, 200)
            adx, plus_di, minus_di = compute_adx_series(highs, lows, closes)
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
            history['stochK'] = stoch_k
            history['stochD'] = stoch_d
            history['cci'] = cci_series
            history['adx'] = adx

            if vol_24h is None:
                vol_24h = precio * max(1, 86400 // secs)
        except Exception as e:
            logger.error(f"[TradingData] historia sintetica fallo para {symbol}: {e}")

    # Los indicadores se calculan con toda la historia (convergencia exacta);
    # el historial que se envia al frontend se recorta para no inflar el payload
    if history:
        history = {k: v[-300:] for k, v in history.items()}

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
    )
    r1, r2, r3, s1, s2, s3 = pivots
    macd_curr = last_non_none(macd_line)
    macd_sig_curr = last_non_none(macd_signal)
    macd_hist = (macd_curr - macd_sig_curr) if (macd_curr is not None and macd_sig_curr is not None) else None

    # ────────────────────────────────────────────────────────────────
    # LIBRO DE ÓRDENES REAL + DOMINANCIA COMPRADORA
    # Crypto: profundidad de Coinbase (bids/asks reales, 20 niveles; fallback Binance).
    # Stocks: Yahoo no expone depth público → proxy direccional con el
    # volumen real de las últimas velas (alcistas = comprador, bajistas = vendedor).
    # ────────────────────────────────────────────────────────────────
    bid_vol = None
    ask_vol = None
    best_bid = None
    best_ask = None
    buyer_percent = None
    ob_source = None

    if market == 'crypto':
        try:
            depth = fetch_order_book_depth(symbol)
            if depth and depth.get('bids') and depth.get('asks'):
                bids = [(float(p), float(q)) for p, q in depth['bids']]
                asks = [(float(p), float(q)) for p, q in depth['asks']]
                bid_vol = sum(q * p for p, q in bids[:20])
                ask_vol = sum(q * p for p, q in asks[:20])
                best_bid = bids[0][0]
                best_ask = asks[0][0]
                ob_source = 'order_book'
        except Exception as e:
            logger.warning(f"[TradingData] order book fallo para {symbol}: {e}")

    if bid_vol is None and closes:
        try:
            up_vol = 0.0
            down_vol = 0.0
            window = closes[-30:]
            vols_window = quote_volumes[-30:] if quote_volumes else []
            for i in range(1, len(window)):
                v = float(vols_window[i]) if i < len(vols_window) and vols_window[i] is not None else 0.0
                if window[i] > window[i - 1]:
                    up_vol += v
                else:
                    down_vol += v
            if up_vol + down_vol > 0:
                bid_vol = up_vol
                ask_vol = down_vol
                ob_source = 'volume_proxy'
        except Exception as e:
            logger.warning(f"[TradingData] proxy de volumen fallo para {symbol}: {e}")

    if bid_vol is not None and ask_vol is not None and (bid_vol + ask_vol) > 0:
        buyer_percent = round(bid_vol / (bid_vol + ask_vol) * 100, 1)

    result = {
        'symbol': symbol,
        'market': market,
        'precio': precio,
        'decimales': price_decimals(precio),
        'rsi': last_non_none(rsi_series),
        'rsiStoch': last_non_none(stoch_rsi_k),
        'volumen': vol_24h if vol_24h is not None else (quote_volumes[-1] if quote_volumes else None),
        'bbUpper': last_non_none(bb_upper),
        'bbMiddle': last_non_none(bb_middle),
        'bbLower': last_non_none(bb_lower),
        'macdValue': last_non_none(macd_line),
        'macdSignal': last_non_none(macd_signal),
        'macdHistogram': macd_hist,
        'adx': last_non_none(adx),
        'plusDi': last_non_none(plus_di),
        'minusDi': last_non_none(minus_di),
        'stochK': last_non_none(stoch_k),
        'stochD': last_non_none(stoch_d),
        'cci': last_non_none(cci_series),
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
        'timeframe': interval_str,
        'history': history
    }
    if is_synthetic:
        result['synthetic'] = True
    return result


def fetch_trading_data(symbol, interval_str='15m', market='crypto'):
    """ENTRY POINT REST/SOCKET: KLINES + VOLUMEN + INDICADORES COMPLETOS."""
    klines, vol_24h = fetch_klines_and_volume(symbol, interval_str, market)
    payload = build_payload(symbol, interval_str, market, klines, vol_24h)
    # Precio principal: ticker EN VIVO de Coinbase. El cierre de la ultima vela
    # REST puede llevar unos segundos de retraso (paginacion de klines), asi que
    # para el precio mostrado usamos siempre el ticker mas fresco.
    if market == 'crypto' and klines:
        try:
            live_price = fetch_last_price(symbol, market)
            if live_price and live_price > 0:
                payload['precio'] = live_price
        except Exception as e:
            logger.warning(f"[TradingData] ticker en vivo fallo para {symbol}: {e}")
    return payload
