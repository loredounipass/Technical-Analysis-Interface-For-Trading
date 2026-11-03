"""Order flow: delta comprador/vendedor desde tape real o proxy por vela."""


# ORDER FLOW EJECUTADO: recibe trades normalizados con side de AGRESOR,
# price, size y time en ms. El delta es buy quote volume - sell quote volume
# dentro de la muestra; no se etiqueta como CVD de sesion.
def compute_order_flow_proxy(opens, highs, lows, closes, quote_volumes,
                             timestamps, sample_limit=60):
    """PROXY de order flow basado en direccion y volumen de velas.

    Yahoo/stocks no expone trades individuales (tape); se atribuye el volumen
    de cada vela a comprador o vendedor segun la direccion del cuerpo. Los
    doji se dividen 50/50. Es una aproximacion direccional, NO un trade tape real.
    """
    n = len(closes)
    if n < 3 or not quote_volumes or len(quote_volumes) < 3:
        return None
    sample_size = min(sample_limit, n)
    start = n - sample_size
    buy_vol = 0.0
    sell_vol = 0.0
    buy_count = 0
    sell_count = 0
    events = []
    for i in range(start, n):
        o = float(opens[i])
        c = float(closes[i])
        v = float(quote_volumes[i]) if i < len(quote_volumes) else 0.0
        if v <= 0:
            continue
        if c > o:
            buy_vol += v
            buy_count += 1
            events.append({'id': f'ev-{i}', 'time': timestamps[i],
                           'side': 'buy', 'price': c, 'size': v,
                           'quoteVolume': v})
        elif c < o:
            sell_vol += v
            sell_count += 1
            events.append({'id': f'ev-{i}', 'time': timestamps[i],
                           'side': 'sell', 'price': c, 'size': v,
                           'quoteVolume': v})
        else:
            buy_vol += v * 0.5
            sell_vol += v * 0.5
            buy_count += 1
            sell_count += 1
            events.append({'id': f'ev-{i}', 'time': timestamps[i],
                           'side': 'buy', 'price': c, 'size': v * 0.5,
                           'quoteVolume': v * 0.5})
    total = buy_vol + sell_vol
    if total <= 0:
        return None
    delta = buy_vol - sell_vol
    # Top candles by volume for the "tape" section
    events.sort(key=lambda e: e['quoteVolume'], reverse=True)
    return {
        'source': 'candle_volume_direction_proxy',
        'sideClassification': 'inferred_from_candle_direction',
        'scope': f'latest_{sample_size}_candles_proxy',
        'tradeCount': buy_count + sell_count,
        'buyTradeCount': buy_count,
        'sellTradeCount': sell_count,
        'buyVolume': buy_vol,
        'sellVolume': sell_vol,
        'delta': delta,
        'buyPercent': round(buy_vol / total * 100, 1),
        'sellPercent': round(sell_vol / total * 100, 1),
        'deltaPercent': round(delta / total * 100, 1),
        'windowStart': timestamps[start],
        'windowEnd': timestamps[n - 1],
        'recentTrades': list(reversed(events[:25])),
    }


def compute_order_flow(trades, sample_limit=200):
    if not trades:
        return None
    sample = trades[-sample_limit:]
    buy_volume = sum(t['price'] * t['size'] for t in sample if t['side'] == 'buy')
    sell_volume = sum(t['price'] * t['size'] for t in sample if t['side'] == 'sell')
    total_volume = buy_volume + sell_volume
    if total_volume <= 0:
        return None

    delta = buy_volume - sell_volume
    recent_trades = [{
        'id': t['id'],
        'time': t['time'],
        'side': t['side'],
        'price': t['price'],
        'size': t['size'],
        'quoteVolume': t['price'] * t['size'],
    } for t in reversed(sample[-25:])]
    return {
        'source': 'coinbase_exchange_executed_trades',
        'sideClassification': 'aggressor_inferred_from_maker_side',
        'scope': f'latest_{len(sample)}_executed_trades',
        'tradeCount': len(sample),
        'buyTradeCount': sum(1 for t in sample if t['side'] == 'buy'),
        'sellTradeCount': sum(1 for t in sample if t['side'] == 'sell'),
        'buyVolume': buy_volume,
        'sellVolume': sell_volume,
        'delta': delta,
        'buyPercent': round(buy_volume / total_volume * 100, 1),
        'sellPercent': round(sell_volume / total_volume * 100, 1),
        'deltaPercent': round(delta / total_volume * 100, 1),
        'windowStart': sample[0]['time'],
        'windowEnd': sample[-1]['time'],
        'recentTrades': recent_trades,
    }
