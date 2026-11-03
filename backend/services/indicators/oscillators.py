"""Osciladores y-Series: RSI, MACD, Bollinger, Stochastic, StochRSI, CCI, MFI y ADX."""

import statistics

from services.indicators.moving_averages import (
    compute_sma, compute_sma_series, compute_ema_series,
)


# VALOR RSI A PARTIR DE LA GANANCIA MEDIA Y LA PERDIDA MEDIA. SI NO HAY
# PERDIDAS (avg_loss == 0) EL RSI VA A 100 (SOBRECOMPRA), Y SI TAMPOCO HAY
# GANANCIA (SERIE PLANA) ES 50 (NEUTRO). CORRIGE EL CASO QUE ANTES DEVOLVIA 0.
def _rsi_value(avg_gain, avg_loss):
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100 - 100 / (1 + rs)


# CALCULA LA SERIE DE RSI (INDICADOR DE FUERZA RELATIVA) SOBRE UNA LISTA DE PRECIOS
def compute_rsi_series(prices, period=14):
    # Con menos de period+1 precios no hay deltas suficientes para sembrar la
    # media Wilder: la serie va toda en None (mismo contrato que MFI/ADX) en
    # lugar de devolver una serie mas larga que el input con un valor falso.
    if len(prices) < period + 1:
        return [None] * len(prices)
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    seed = deltas[:period]
    up = sum(x for x in seed if x > 0) / period
    down = -sum(x for x in seed if x < 0) / period
    rsi = [None] * (period)
    rsi.append(_rsi_value(up, down))
    up_avg = up
    down_avg = down
    for delta in deltas[period:]:
        up_val = max(delta, 0)
        down_val = -min(delta, 0)
        up_avg = (up_avg * (period - 1) + up_val) / period
        down_avg = (down_avg * (period - 1) + down_val) / period
        rsi.append(_rsi_value(up_avg, down_avg))
    if len(rsi) < len(prices):
        rsi = [None] * (len(prices) - len(rsi)) + rsi
    return rsi


# CALCULA LA SERIE MACD Y SU LINEA DE SEÑAL A PARTIR DE PRECIOS (USANDO EMA)
def compute_macd_series(prices, fast=12, slow=26, signal=9):
    ema_fast = compute_ema_series(prices, fast)
    ema_slow = compute_ema_series(prices, slow)
    macd = []
    for ef, es in zip(ema_fast, ema_slow):
        if ef is None or es is None:
            macd.append(None)
        else:
            macd.append(ef - es)
    macd_values = [m for m in macd if m is not None]
    signal_line = []
    if len(macd_values) >= signal:
        sig_ema = compute_ema_series(macd_values, signal)
        sig_full = [None] * (len(macd) - len(sig_ema)) + sig_ema
        signal_line = sig_full
    else:
        signal_line = [None] * len(macd)
    return macd, signal_line


# CALCULA LAS BANDAS DE BOLLINGER: UPPER, MIDDLE(SMA) Y LOWER PARA UNA SERIE DE PRECIOS
def compute_bollinger_series(prices, period=20, mult=2):
    middle = compute_sma(prices, period)
    upper = []
    lower = []
    for i in range(len(prices)):
        if i + 1 < period:
            upper.append(None)
            lower.append(None)
            continue
        window = prices[i + 1 - period:i + 1]
        sd = statistics.pstdev(window)
        upper.append(middle[i] + mult * sd if middle[i] is not None else None)
        lower.append(middle[i] - mult * sd if middle[i] is not None else None)
    return upper, middle, lower


# CALCULA LA SERIE DE STOCHASTIC %K Y %D (14, 3, 3)
def compute_stoch_series(highs, lows, closes, k_period=14, k_smooth=3, d_period=3):
    k_raw = []
    for i in range(len(closes)):
        if i + 1 < k_period:
            k_raw.append(None)
            continue
        ll = min(lows[i + 1 - k_period:i + 1])
        hh = max(highs[i + 1 - k_period:i + 1])
        k_raw.append(0.0 if hh == ll else (closes[i] - ll) / (hh - ll) * 100)
    k = compute_sma_series(k_raw, k_smooth)
    d = compute_sma_series(k, d_period)
    return k, d


# CALCULA EL STOCHASTIC RSI %K (14, 14, 3, 3) A PARTIR DE LA SERIE DE RSI
def compute_stoch_rsi_series(rsi_series, stoch_period=14, k_smooth=3, d_period=3):
    vals = []
    for i in range(len(rsi_series)):
        if i + 1 < stoch_period:
            vals.append(None)
            continue
        window = rsi_series[i + 1 - stoch_period:i + 1]
        if any(v is None for v in window):
            vals.append(None)
            continue
        ll, hh = min(window), max(window)
        vals.append(0.0 if hh == ll else (rsi_series[i] - ll) / (hh - ll) * 100)
    k = compute_sma_series(vals, k_smooth)
    return k


# CALCULA LA SERIE DE CCI (20) SOBRE TYPICAL PRICE
def compute_cci_series(highs, lows, closes, period=20):
    tp = [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
    sma_tp = compute_sma_series(tp, period)
    out = []
    for i in range(len(tp)):
        if i + 1 < period or sma_tp[i] is None:
            out.append(None)
            continue
        window = tp[i + 1 - period:i + 1]
        md = sum(abs(x - sma_tp[i]) for x in window) / period
        out.append(0.0 if md == 0 else (tp[i] - sma_tp[i]) / (0.015 * md))
    return out


# CALCULA LA SERIE DE MFI (14) - MONEY FLOW INDEX (RSI DE VOLUMEN)
def compute_mfi_series(highs, lows, closes, volumes, period=14):
    n = len(closes)
    out = [None] * n
    if n < period + 1:
        return out
    tp = [(h + l + c) / 3.0 for h, l, c in zip(highs, lows, closes)]
    pos_mf = [0.0] * n
    neg_mf = [0.0] * n
    for i in range(1, n):
        v = float(volumes[i]) if volumes and i < len(volumes) and volumes[i] is not None else 0.0
        raw_flow = tp[i] * v
        if tp[i] > tp[i - 1]:
            pos_mf[i] = raw_flow
        elif tp[i] < tp[i - 1]:
            neg_mf[i] = raw_flow
    for i in range(period, n):
        p_sum = sum(pos_mf[i - period + 1 : i + 1])
        n_sum = sum(neg_mf[i - period + 1 : i + 1])
        if n_sum == 0:
            out[i] = 100.0 if p_sum > 0 else 50.0
        else:
            mr = p_sum / n_sum
            out[i] = round(100.0 - (100.0 / (1.0 + mr)), 2)
    return out


# CALCULA ADX (14) CON SUAVIZADO WILDER, MAS +DI / -DI
def compute_adx_series(highs, lows, closes, period=14):
    n = len(closes)
    adx = [None] * n
    plus_di = [None] * n
    minus_di = [None] * n
    if n < period + 1:
        return adx, plus_di, minus_di

    trs = []
    pdi_raw = []
    mdi_raw = []
    for i in range(1, n):
        tr = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
        up = highs[i] - highs[i - 1]
        dn = lows[i - 1] - lows[i]
        trs.append(tr)
        pdi_raw.append(up if up > 0 and up > dn else 0.0)
        mdi_raw.append(dn if dn > 0 and dn > up else 0.0)

    tr_s = sum(trs[:period])
    p_s = sum(pdi_raw[:period])
    m_s = sum(mdi_raw[:period])
    dx_values = []
    # Primera DI con las sumas crudas de las velas 1..period: pertenece a la
    # vela `period` (alineación canónica Wilder/TA-Lib).
    tr_s0 = tr_s
    if tr_s0:
        plus_di[period] = 100 * p_s / tr_s0
        minus_di[period] = 100 * m_s / tr_s0
    else:
        plus_di[period] = 0.0
        minus_di[period] = 0.0
    total_di = plus_di[period] + minus_di[period]
    dx_values.append(100 * abs(plus_di[period] - minus_di[period]) / total_di if total_di else 0.0)
    for i in range(period, len(trs)):
        tr_s = tr_s - tr_s / period + trs[i]
        p_s = p_s - p_s / period + pdi_raw[i]
        m_s = m_s - m_s / period + mdi_raw[i]
        # trs[i] pertenece a la vela i+1 (trs arranca en la vela 1); el valor
        # suavizado de DI se calcula CON datos de la vela i+1, asi que se
        # almacena en el indice i+1 para alinear la serie con las velas.
        bar = i + 1
        plus_di[bar] = 100 * p_s / tr_s if tr_s else 0.0
        minus_di[bar] = 100 * m_s / tr_s if tr_s else 0.0
        total_di = plus_di[bar] + minus_di[bar]
        dx_values.append(100 * abs(plus_di[bar] - minus_di[bar]) / total_di if total_di else 0.0)

    if len(dx_values) >= period:
        # dx_values[j] corresponde a la vela period+j: la media de los
        # primeros `period` DX es el ADX de la vela 2*period-1; luego recursa
        # Wilder (adx[i] = (adx[i-1]*(p-1) + dx[i]) / p) vela a vela.
        adx[2 * period - 1] = sum(dx_values[:period]) / period
        for j in range(period, len(dx_values)):
            bar = period + j
            adx[bar] = (adx[bar - 1] * (period - 1) + dx_values[j]) / period
    return adx, plus_di, minus_di
