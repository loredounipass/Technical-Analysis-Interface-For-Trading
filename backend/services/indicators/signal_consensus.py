"""Consenso de señales (estilo TradingView) sobre osciladores y medias moviles."""


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
        # Logica mean-reversion (estilo TradingView): sobreventa (valor bajo,
        # por debajo de buy_threshold) = COMPRA; sobrecompra (valor alto, por
        # encima de sell_threshold) = VENTA; entre ambas lineas = NEUTRAL.
        if value < buy_threshold:
            buy += 1
        elif value > sell_threshold:
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
