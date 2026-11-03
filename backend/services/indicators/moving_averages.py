"""Medias moviles: SMA, SMA nullable y EMA."""


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
