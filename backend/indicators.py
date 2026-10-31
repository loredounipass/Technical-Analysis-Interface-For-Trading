"""Indicadores tecnicos puros: funciones sin estado ni side-effects.

Todas las funciones reciben listas de floats/ints y devuelven listas del
mismo largo.  NO dependen de Flask, requests ni de ningun otro modulo del
proyecto.
"""

import statistics


# ─────────────────────────────────────────────────────────────────────
# UTILIDADES
# ─────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────
# MEDIAS MOVILES
# ─────────────────────────────────────────────────────────────────────

# CALCULA LA MEDIA MOVIL SIMPLE (SMA) DE UNA SERIE SOBRE UN PERIODO DADO
def compute_sma(series, period):
    out = []
    for i in range(len(series)):
        if i + 1 < period:
            out.append(None)
        else:
            window = series[i + 1 - period:i + 1]
            out.append(sum(window) / period)
    return out


# SMA DE UNA SERIE QUE PUEDE CONTENER None: si el periodo contiene None, el
# resultado es None (propaga el vacio inicial sin distorsionar el calculo)
def compute_sma_series(series, period):
    out = []
    for i in range(len(series)):
        if i + 1 < period:
            out.append(None)
            continue
        window = series[i + 1 - period:i + 1]
        if any(v is None for v in window):
            out.append(None)
        else:
            out.append(sum(window) / period)
    return out


# CALCULA LA SERIE DE MEDIA MOVIL EXPONENCIAL (EMA) PARA CADA PUNTO DE LA SERIE
def compute_ema_series(series, period):
    emas = []
    k = 2 / (period + 1)
    ema_prev = None
    for i, price in enumerate(series):
        if i < period - 1:
            emas.append(None)
            continue
        if ema_prev is None:
            sma = sum(series[i + 1 - period:i + 1]) / period
            ema_prev = sma
            emas.append(ema_prev)
        else:
            ema = price * k + ema_prev * (1 - k)
            emas.append(ema)
            ema_prev = ema
    return emas


# ─────────────────────────────────────────────────────────────────────
# OSCILADORES
# ─────────────────────────────────────────────────────────────────────

# CALCULA LA SERIE DE RSI (INDICADOR DE FUERZA RELATIVA) SOBRE UNA LISTA DE PRECIOS
def compute_rsi_series(prices, period=14):
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    seed = deltas[:period]
    up = sum(x for x in seed if x > 0) / period
    down = -sum(x for x in seed if x < 0) / period
    rs = up / down if down != 0 else 0
    rsi = [None] * (period)
    rsi.append(100 - 100 / (1 + rs))
    up_avg = up
    down_avg = down
    for delta in deltas[period:]:
        up_val = max(delta, 0)
        down_val = -min(delta, 0)
        up_avg = (up_avg * (period - 1) + up_val) / period
        down_avg = (down_avg * (period - 1) + down_val) / period
        rs = up_avg / down_avg if down_avg != 0 else 0
        rsi.append(100 - 100 / (1 + rs))
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
    for i in range(period, len(trs)):
        tr_s = tr_s - tr_s / period + trs[i]
        p_s = p_s - p_s / period + pdi_raw[i]
        m_s = m_s - m_s / period + mdi_raw[i]
        plus_di[i] = 100 * p_s / tr_s if tr_s else 0.0
        minus_di[i] = 100 * m_s / tr_s if tr_s else 0.0
        total_di = plus_di[i] + minus_di[i]
        dx_values.append(100 * abs(plus_di[i] - minus_di[i]) / total_di if total_di else 0.0)

    if len(dx_values) >= period:
        adx[period + period - 1] = sum(dx_values[:period]) / period
        for j in range(period, len(dx_values)):
            adx[period + j] = (adx[period + j - 1] * (period - 1) + dx_values[j]) / period
    return adx, plus_di, minus_di


# ─────────────────────────────────────────────────────────────────────
# ZONAS DE PRICE ACTION: ORDER BLOCKS Y FAIR VALUE GAPS
# ─────────────────────────────────────────────────────────────────────

# ATR SIMPLE PREVIO A UNA VELA: no usa el rango del propio impulso para
# evitar que el movimiento medido influe en su umbral de validacion.
def _prior_average_true_range(highs, lows, closes, end_index, period=14):
    if end_index < period + 1:
        return None
    true_ranges = []
    for i in range(end_index - period, end_index):
        true_ranges.append(max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        ))
    return sum(true_ranges) / period


# CANDIDATOS DE ORDER BLOCK: ultima vela opuesta seguida (en un maximo de
# tres velas) de un desplazamiento con cuerpo >= 1.2 ATR, cuerpo >= 55% del
# rango y ruptura del rango previo. No afirma la existencia de ordenes
# institucionales; solo detecta una configuracion de price action en OHLC.
def compute_order_blocks(opens, highs, lows, closes, times,
                         lookback=200, limit=12, atr_period=14):
    n = len(closes)
    if n < atr_period + 2 or not all(
        len(series) == n for series in (opens, highs, lows, times)
    ):
        return []

    zones = []
    for i in range(max(1, n - lookback), n - 1):
        is_bullish_origin = closes[i] < opens[i]
        is_bearish_origin = closes[i] > opens[i]
        if not (is_bullish_origin or is_bearish_origin):
            continue

        side = 'bullish' if is_bullish_origin else 'bearish'
        for j in range(i + 1, min(i + 4, n)):
            atr = _prior_average_true_range(highs, lows, closes, j, atr_period)
            candle_range = highs[j] - lows[j]
            body = abs(closes[j] - opens[j])
            if not atr or candle_range <= 0:
                continue
            if body < atr * 1.2 or body / candle_range < 0.55:
                continue

            bullish_displacement = (
                side == 'bullish'
                and closes[j] > opens[j]
                and closes[j] > max(highs[i:j])
            )
            bearish_displacement = (
                side == 'bearish'
                and closes[j] < opens[j]
                and closes[j] < min(lows[i:j])
            )
            if not (bullish_displacement or bearish_displacement):
                continue

            zone = {
                'id': f'ob-{side}-{times[i]}',
                'side': side,
                'originIndex': i,
                'confirmationIndex': j,
                'originTime': times[i],
                'confirmationTime': times[j],
                'top': highs[i],
                'bottom': lows[i],
                'impulseAtr': round(body / atr, 2),
                'impulseBodyPercent': round(body / candle_range * 100, 1),
                'status': 'active',
                'testedAt': None,
                'invalidatedAt': None,
            }

            for k in range(j + 1, n):
                invalidated = (
                    closes[k] < zone['bottom'] if side == 'bullish'
                    else closes[k] > zone['top']
                )
                if invalidated:
                    zone['status'] = 'invalidated'
                    zone['invalidatedAt'] = times[k]
                    break
                tested = (
                    lows[k] <= zone['top'] if side == 'bullish'
                    else highs[k] >= zone['bottom']
                )
                if tested:
                    zone['status'] = 'tested'
                    if zone['testedAt'] is None:
                        zone['testedAt'] = times[k]

            zones.append(zone)
            break

    zones.sort(key=lambda zone: (
        zone['status'] == 'invalidated', -zone['confirmationIndex']
    ))
    return zones[:limit]


# FAIR VALUE GAPS DE TRES VELAS: bullish low[i] > high[i-2]; bearish
# high[i] < low[i-2]. El relleno se calcula solo con velas posteriores a la
# formacion y se expresa como porcentaje real del rango original.
def compute_fair_value_gaps(highs, lows, closes, times, lookback=200, limit=12):
    n = len(closes)
    if n < 3 or not all(len(series) == n for series in (highs, lows, times)):
        return []

    gaps = []
    for i in range(max(2, n - lookback), n):
        side = None
        if lows[i] > highs[i - 2]:
            side = 'bullish'
            bottom = highs[i - 2]
            top = lows[i]
        elif highs[i] < lows[i - 2]:
            side = 'bearish'
            bottom = highs[i]
            top = lows[i - 2]
        if side is None:
            continue

        size = top - bottom
        if size <= 0:
            continue
        gap = {
            'id': f'fvg-{side}-{times[i]}',
            'side': side,
            'formationIndex': i,
            'formedAt': times[i],
            'top': top,
            'bottom': bottom,
            'midpoint': (top + bottom) / 2,
            'sizePercent': round(size / closes[i] * 100, 4) if closes[i] else None,
            'status': 'open',
            'fillPercent': 0.0,
            'firstTouchAt': None,
            'filledAt': None,
        }

        max_fill = 0.0
        for k in range(i + 1, n):
            touched = lows[k] < top if side == 'bullish' else highs[k] > bottom
            if touched and gap['firstTouchAt'] is None:
                gap['firstTouchAt'] = times[k]
            penetration = (
                top - lows[k] if side == 'bullish'
                else highs[k] - bottom
            )
            max_fill = max(max_fill, min(size, max(0.0, penetration)))
            filled = lows[k] <= bottom if side == 'bullish' else highs[k] >= top
            if filled:
                gap['filledAt'] = times[k]
                break

        gap['fillPercent'] = round(max_fill / size * 100, 1)
        if gap['filledAt'] is not None:
            gap['status'] = 'filled'
            gap['fillPercent'] = 100.0
        elif max_fill > 0:
            gap['status'] = 'partial'
        gaps.append(gap)

    gaps.sort(key=lambda gap: (
        gap['status'] == 'filled', -gap['formationIndex']
    ))
    return gaps[:limit]


# ─────────────────────────────────────────────────────────────────────
# PIVOT POINTS
# ─────────────────────────────────────────────────────────────────────

# CALCULA PIVOT POINTS CLASICOS (estilo TradingView/Binance): se toman el
# maximo, el minimo y el cierre del ULTIMO DIA COMPLETADO (UTC). Si ese dia no
# tiene velas (fin de semana/feriado para stocks), se retrocede al ultimo dia
# con datos (p. ej. viernes). Si no hay ningun dia completo, cae a la ventana
# movil de las ultimas 24h. Nunca devuelve None si existe historial.
def compute_pivots(highs, lows, closes, times):
    if not times:
        return (None, None, None, None, None, None)
    now_ms = times[-1]
    day_ms = 86400000
    today_start = (now_ms // day_ms) * day_ms
    bars = None
    for back in range(1, 8):
        day_start = today_start - back * day_ms
        day_bars = [
            (t, h, l, c)
            for t, h, l, c in zip(times, highs, lows, closes)
            if day_start <= t < day_start + day_ms
        ]
        if len(day_bars) >= 1:
            bars = day_bars
            break
    if bars is None:
        bars = [
            (t, h, l, c)
            for t, h, l, c in zip(times, highs, lows, closes)
            if t <= now_ms and now_ms - t <= day_ms
        ]
        bars = bars[:-1] if len(bars) > 1 else bars
    if len(bars) < 1:
        return (None, None, None, None, None, None)
    h = max(b[1] for b in bars)
    l = min(b[2] for b in bars)
    c = bars[-1][3]
    p = (h + l + c) / 3
    r1 = 2 * p - l
    s1 = 2 * p - h
    r2 = p + (h - l)
    s2 = p - (h - l)
    r3 = h + 2 * (p - l)
    s3 = l - 2 * (h - p)
    return r1, r2, r3, s1, s2, s3


# ─────────────────────────────────────────────────────────────────────
# CONSENSO DE SEÑALES
# ─────────────────────────────────────────────────────────────────────

# CONSENSO DE SEÑALES (estilo TradingView) SOBRE OSCILADORES Y MEDIAS MOVILES
def compute_signal_summary(rsi, stoch_k, stoch_d, cci, macd_v, macd_sig, adx_v,
                           plus_di, minus_di, rsi_stoch, ema50, ema100, ema200, precio, mfi=None):
    buy = 0
    sell = 0
    neutral = 0

    def vote(value, buy_threshold, sell_threshold):
        nonlocal buy, sell, neutral
        if value is None:
            neutral += 1
            return
        if value > buy_threshold:
            buy += 1
        elif value < sell_threshold:
            sell += 1
        else:
            neutral += 1

    # Osciladores: logica mean-reversion estilo TradingView.
    # Overbought (valor alto) = SELL, Oversold (valor bajo) = BUY.
    vote(rsi, 30, 70)
    vote(stoch_k, 20, 80)
    vote(stoch_d, 20, 80)
    vote(cci, -100, 100)
    if mfi is not None:
        vote(mfi, 20, 80)
    if macd_v is not None and macd_sig is not None:
        if macd_v > macd_sig:
            buy += 1
        else:
            sell += 1
    else:
        neutral += 1
    vote(rsi_stoch, 20, 80)
    if plus_di is not None and minus_di is not None and adx_v is not None:
        if adx_v >= 20:
            if plus_di > minus_di:
                buy += 1
            else:
                sell += 1
        else:
            neutral += 1
    else:
        neutral += 1

    for ema in (ema50, ema100, ema200):
        if ema is not None and precio is not None:
            if precio > ema:
                buy += 1
            else:
                sell += 1
        else:
            neutral += 1
    if ema50 is not None and ema200 is not None:
        if ema50 > ema200:
            buy += 1
        else:
            sell += 1
    else:
        neutral += 1
    return buy, sell, neutral
