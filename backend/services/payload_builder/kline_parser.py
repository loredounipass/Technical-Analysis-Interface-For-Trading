"""Parseo de klines crudas al conjunto de series que consume el builder."""


def parse_klines(klines):
    """Convierte la lista de klines en las series OHLCV + volumenes.

    Reproduce el bloque de parsing original de build_payload: series vacias si no
    hay klines, y proxy de actividad deterministico cuando Yahoo reporta
    volumen 0 (forex =X / indices =F).
    """
    opens = []
    highs = []
    lows = []
    closes = []
    timestamps = []
    quote_volumes = []
    base_volumes = []
    if klines:
        opens = [float(k[1]) for k in klines]
        highs = [float(k[2]) for k in klines]
        lows = [float(k[3]) for k in klines]
        closes = [float(k[4]) for k in klines]
        timestamps = [int(k[0]) for k in klines]
        quote_volumes = [float(k[7]) for k in klines]
        # Volumen por vela en MONEDA BASE (k[5]: ETH, BTC, acciones). Es el dato
        # CRUDO que reporta el exchange, SIN ninguna conversion de precio, por lo
        # que es EXACTO. El quote (k[7]) en cambio, para Coinbase se estima como
        # base*close y puede desviar 1-3%. Se expone para mostrar el "Vol (ETH)"
        # real, igual que el indicador Vol(ETH) de Binance.
        base_volumes = [float(k[5]) for k in klines]
        # Yahoo NO expone volumen para forex (=X) y varios indices/futuros (=F):
        # llegan todas las velas en 0. Sin volumen, el proxy de order flow, el
        # libro de liquidez por volume profile y la dominancia compradora quedan
        # vacios ("Waiting for order flow...", "No order book data available").
        # Se sustituye un proxy de actividad deterministico por vela: el rango
        # REAL (high-low) expresado en pips notacionales ((high-low)/close*1e5).
        # Solo usa velas que existieron (no inventa niveles nuevos) y da una
        # escala legible al bubble map y al delta direccional.
        if klines and not any(v > 0 for v in quote_volumes):
            quote_volumes = [
                (float(k[2]) - float(k[3])) / float(k[4]) * 100000.0
                for k in klines
            ]
    return {
        'opens': opens,
        'highs': highs,
        'lows': lows,
        'closes': closes,
        'timestamps': timestamps,
        'quote_volumes': quote_volumes,
        'base_volumes': base_volumes,
    }
