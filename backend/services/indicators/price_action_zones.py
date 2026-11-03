"""Zonas de price action: order blocks, fair value gaps y swings de liquidez."""


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


# LIQUIDITY SWINGS: swing high/low confirmado con dos velas a cada lado.
# Buy-side liquidity reside sobre un swing high; sell-side bajo un swing low.
# Sweep = mecha que cruza el nivel y cierre de vuelta; broken = cierre aceptado
# al otro lado. Son niveles potenciales de stops, no volumen institucional real.
def compute_liquidity_swings(highs, lows, closes, times,
                             lookback=200, limit=12, left=2, right=2):
    n = len(closes)
    if n < left + right + 2 or not all(
        len(series) == n for series in (highs, lows, times)
    ):
        return []

    swings = []
    for i in range(max(left, n - lookback), n - right):
        neighbors = [k for k in range(i - left, i + right + 1) if k != i]
        is_swing_high = all(highs[i] > highs[k] for k in neighbors)
        is_swing_low = all(lows[i] < lows[k] for k in neighbors)
        candidates = []
        if is_swing_high:
            candidates.append(('buy_side', 'swing_high', highs[i]))
        if is_swing_low:
            candidates.append(('sell_side', 'swing_low', lows[i]))

        for side, kind, level in candidates:
            swing = {
                'id': f'liquidity-{side}-{times[i]}',
                'side': side,
                'kind': kind,
                'price': level,
                'swingIndex': i,
                'confirmationIndex': i + right,
                'formedAt': times[i],
                'confirmedAt': times[i + right],
                'status': 'active',
                'sweptAt': None,
                'brokenAt': None,
                'sweepSizePercent': None,
            }
            for j in range(i + right + 1, n):
                if side == 'buy_side':
                    if closes[j] > level:
                        swing['status'] = 'broken'
                        swing['brokenAt'] = times[j]
                        break
                    if highs[j] > level and closes[j] <= level:
                        swing['status'] = 'swept'
                        swing['sweptAt'] = times[j]
                        swing['sweepSizePercent'] = round(
                            (highs[j] - level) / level * 100, 4
                        ) if level else None
                        break
                else:
                    if closes[j] < level:
                        swing['status'] = 'broken'
                        swing['brokenAt'] = times[j]
                        break
                    if lows[j] < level and closes[j] >= level:
                        swing['status'] = 'swept'
                        swing['sweptAt'] = times[j]
                        swing['sweepSizePercent'] = round(
                            (level - lows[j]) / level * 100, 4
                        ) if level else None
                        break
            swings.append(swing)

    priority = {'active': 0, 'swept': 1, 'broken': 2}
    swings.sort(key=lambda swing: (
        priority[swing['status']], -swing['confirmationIndex']
    ))
    return swings[:limit]
