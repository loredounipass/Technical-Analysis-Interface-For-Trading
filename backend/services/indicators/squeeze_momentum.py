"""Squeeze Momentum (TTM Squeeze / LazyBear): compresion de volatilidad + momentum.

Deteccion de "squeeze": las Bandas de Bollinger (20, 2) quedan DENTRO de los
Canales de Keltner (20, 1.5ATR). Mientras mas apretada la Bollinger respecto a
Keltner, mas energia almacenada (baja volatilidad) y mas probable una expansion.

El histograma de momentum es la misma linea que dibuja TradingView/exchanges:
    momentum = linreg(close - mid2, mom_period, 0)
donde mid2 = ( (HHV(high,p)+LLV(low,p))/2 + SMA(close,p) ) / 2.

Funciones puras: reciben listas de floats y devuelven listas del mismo largo.
No dependen de Flask, requests, numpy ni de ningun otro modulo del proyecto;
solo usan compute_sma de moving_averages, tambien pura.
"""

import statistics

from services.indicators.moving_averages import compute_sma


# MAXIMO RODANTE (HHV) de una serie sobre `period`. None hasta tener ventana
# completa, alineado por indice con la serie de entrada (mismo contrato SMA).
def _rolling_max(series, period):
    out = []
    for i in range(len(series)):
        if i + 1 < period:
            out.append(None)
        else:
            out.append(max(series[i + 1 - period:i + 1]))
    return out


# MINIMO RODANTE (LLV) de una serie sobre `period`. Mismo alineado que HHV.
def _rolling_min(series, period):
    out = []
    for i in range(len(series)):
        if i + 1 < period:
            out.append(None)
        else:
            out.append(min(series[i + 1 - period:i + 1]))
    return out


# DESVIACION ESTANDAR MUESTRAL (ddof=1) rodante, igual que ta.stdev de Pine /
# TradingView. Se usa para las Bollinger del squeeze para que la condicion
# BB-dentro-de-KC coincida con la del indicador original de los exchanges.
def _rolling_stdev_sample(series, period):
    out = []
    for i in range(len(series)):
        if i + 1 < period:
            out.append(None)
        else:
            window = series[i + 1 - period:i + 1]
            out.append(statistics.stdev(window) if len(window) > 1 else 0.0)
    return out


# RANGO VERDADERO (True Range): max(H-L, |H-Cprev|, |L-Cprev|). La primera vela
# no tiene cierre previo, asi que usa su propio H-L.
def _true_range(highs, lows, closes):
    tr = []
    for i in range(len(closes)):
        if i == 0:
            tr.append(highs[0] - lows[0])
        else:
            tr.append(max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1]),
            ))
    return tr


# REGRESION LINEAL RODANTE (linreg(src, length, 0) de Pine): para cada ventana
# de `period` valores ajusta y = a + b*x por minimos cuadrados y devuelve el
# valor FITTEADO en el extremo derecho (x = period-1). None si la ventana tiene
# algun hueco. Implementado en Python puro (sin numpy) para mantener el módulo
# sin dependencias externas.
def _rolling_linreg(series, period):
    n = len(series)
    out = [None] * n
    if n < period or period < 2:
        return out
    sum_x = period * (period - 1) / 2.0
    sum_x2 = (period - 1) * period * (2 * period - 1) / 6.0
    denom = period * sum_x2 - sum_x * sum_x
    for i in range(period - 1, n):
        window = series[i + 1 - period:i + 1]
        if any(v is None for v in window):
            continue
        sum_y = sum(window)
        sum_xy = sum(x * y for x, y in enumerate(window))
        slope = (period * sum_xy - sum_x * sum_y) / denom
        intercept = (sum_y - slope * sum_x) / period
        out[i] = intercept + slope * (period - 1)
    return out


# CALCULA LA SERIE DE SQUEEZE MOMENTUM.
# Devuelve una tupla (momentum, sqz_state) con listas del mismo largo que
# `closes`:
#   momentum  -> float|None, altura con signo de cada barra del histograma.
#   sqz_state -> 'on'|'off'|'no'|None por vela: Bollinger dentro de Keltner
#               ('on' = comprimido), fuera ('off' = expandido), parcialmente
#               solapadas ('no') y None antes de converger.
def compute_squeeze_momentum_series(highs, lows, closes,
                                    bb_period=20, bb_mult=2.0,
                                    kc_period=20, kc_mult=1.5,
                                    mom_period=20):
    n = len(closes)
    momentum = [None] * n
    sqz_state = [None] * n
    if n < max(bb_period, kc_period, mom_period) + 1:
        return momentum, sqz_state

    # Bollinger (20, 2) con desviacion muestral, igual que TradingView.
    bb_basis = compute_sma(closes, bb_period)
    bb_dev = _rolling_stdev_sample(closes, bb_period)
    bb_upper = [b + bb_mult * d if b is not None and d is not None else None
                for b, d in zip(bb_basis, bb_dev)]
    bb_lower = [b - bb_mult * d if b is not None and d is not None else None
                for b, d in zip(bb_basis, bb_dev)]

    # Keltner (20, 1.5 * SMA(True Range)) centrado en SMA(close).
    kc_mid = compute_sma(closes, kc_period)
    kc_range = compute_sma(_true_range(highs, lows, closes), kc_period)
    kc_upper = [m + kc_mult * r if m is not None and r is not None else None
                for m, r in zip(kc_mid, kc_range)]
    kc_lower = [m - kc_mult * r if m is not None and r is not None else None
                for m, r in zip(kc_mid, kc_range)]

    # Momentum original (sin suavizar): close - mid2, mid2 promedio entre el
    # punto medio HHV/LLV y la SMA de cierre.
    hh = _rolling_max(highs, mom_period)
    ll = _rolling_min(lows, mom_period)
    mid1 = [(h + l) / 2.0 if h is not None and l is not None else None
            for h, l in zip(hh, ll)]
    mid2 = [(m + sma) / 2.0 if m is not None and sma is not None else None
            for m, sma in zip(mid1, compute_sma(closes, mom_period))]
    raw_momentum = [c - m if c is not None and m is not None else None
                    for c, m in zip(closes, mid2)]
    momentum = _rolling_linreg(raw_momentum, mom_period)

    # Estado de squeeze vela a vela.
    for i in range(n):
        if bb_upper[i] is None or bb_lower[i] is None or kc_upper[i] is None or kc_lower[i] is None:
            continue
        on = bb_lower[i] > kc_lower[i] and bb_upper[i] < kc_upper[i]
        off = bb_lower[i] < kc_lower[i] and bb_upper[i] > kc_upper[i]
        sqz_state[i] = 'on' if on else ('off' if off else 'no')

    return momentum, sqz_state
