"""Pivot points clasicos diarios (estilo TradingView/Binance)."""


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
