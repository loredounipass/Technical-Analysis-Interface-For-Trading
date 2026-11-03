"""Libro de ordenes real (crypto) + volume profile / proxy de volumen (stocks).

Calcula dominancia compradora, mejores niveles bid/ask y el depth raw que
dibuja el bubble map de liquidez.
"""

import logging

from services.indicators import price_decimals
from services.data_fetchers import fetch_order_book_depth
from services.data_fetchers.coinbase_order_book import order_book_age

logger = logging.getLogger(__name__)


# La dominancia compradora se mide sobre una BANDA de precio alrededor del mid,
# no sobre los N niveles mas cercanos. Medido contra el exchange real (24
# lecturas de ETHUSDT en 100 s, misma peticion para las dos definiciones):
#   top-20 niveles : recorre 75.8 pts, salta 15.21 pts entre lecturas (p90 36.3)
#   banda 0.10%    : recorre 20.3 pts, salta  3.22 pts entre lecturas (p90  6.8)
# Un top-20 crudo cubre apenas 0.009%-0.02% del precio (3.31 USD sobre 77.900 en
# BTCUSDT): en esa lamina decide una sola orden y el numero se movia 46 pts en
# los 12 s que tarda el libro en renovarse. La banda sigue siendo 100% ordenes
# reales (178 niveles y 2.25 M USDT en ETHUSDT), solo contados en un ancho que
# significa algo, y da una definicion comparable entre Binance y Coinbase.
DEPTH_BAND_PCT = 0.10          # ancho TOTAL (+/- 0.05% alrededor del mid)
DEPTH_BAND_MIN_LEVELS = 20     # por debajo de esto la lectura es ruido
DEPTH_BAND_APERTURAS = (1, 5, 20)   # 0.10% -> 0.50% -> 2.00% en pares iliquidos


# SUMA EL NOTIONAL DENTRO DE LA BANDA de precio alrededor del mid. Devuelve
# (bid_notional, ask_notional, niveles_usados, ancho_usado_pct). Si la banda
# captura menos de DEPTH_BAND_MIN_LEVELS niveles (par iliquido) se abre hasta
# 20x antes de aceptar la lectura: el ancho realmente usado viaja en el payload
# para que el panel y el modelo digan lo que se midio, no lo que se queria.
def _sumar_banda(bids, asks, banda_pct=DEPTH_BAND_PCT):
    mid = (bids[0][0] + asks[0][0]) / 2
    if mid <= 0:
        return None, None, 0, None
    intentos = [banda_pct * f for f in DEPTH_BAND_APERTURAS]
    for ancho in intentos:
        tol = ancho / 200.0
        sel_b = [(p, q) for p, q in bids if p >= mid * (1 - tol)]
        sel_a = [(p, q) for p, q in asks if p <= mid * (1 + tol)]
        niveles = len(sel_b) + len(sel_a)
        if niveles >= DEPTH_BAND_MIN_LEVELS or ancho == intentos[-1]:
            return (sum(p * q for p, q in sel_b),
                    sum(p * q for p, q in sel_a), niveles, round(ancho, 4))
    return None, None, 0, None


def compute_liquidity(symbol, market, precio, opens, highs, lows, closes,
                      quote_volumes, provider='coinbase'):
    """Devuelve el bloque de liquidez: bid_vol, ask_vol, best_bid, best_ask,
    buyer_percent, ob_source y depth_raw.

    Crypto: profundidad del LIBRO DEL PROVEEDOR SELECCIONADO (bids/asks reales).
    La dominancia se agrega por banda de precio (_sumar_banda), no por numero de
    niveles. Se expone tambien book_age (segundos del snapshot) y ob_band (ancho
    realmente usado), para que nada del libro se presente como instantaneo.
    No hay fallback cruzado: si Coinbase no responde, el libro queda vacio y se
    usa el perfil de volumen de las velas; nunca se toma el libro del otro
    exchange (auditado con datos reales: con Coinbase bloqueado por red, el feed
    de Binance arma su propio libro sin una sola peticion al otro proveedor).
    Stocks: Yahoo no expone depth publico → proxy direccional con el
    volumen real de las ultimas velas (alcistas = comprador, bajistas = vendedor)
    y volume profile como mapa de liquidez.
    """
    bid_vol = None
    ask_vol = None
    best_bid = None
    best_ask = None
    buyer_percent = None
    ob_source = None
    ob_band = None
    book_age = None

    depth_raw = None
    if market == 'crypto':
        try:
            depth = fetch_order_book_depth(symbol, provider)
            if depth and depth.get('bids') and depth.get('asks'):
                bids = [(float(p), float(q)) for p, q in depth['bids']]
                asks = [(float(p), float(q)) for p, q in depth['asks']]
                bid_vol, ask_vol, _niveles, ob_band = _sumar_banda(bids, asks)
                best_bid = bids[0][0]
                best_ask = asks[0][0]
                ob_source = 'order_book'
                # El libro se baja cada DEPTH_TTL; la edad real del que sirve la
                # cache es lo que hay que mostrar, no "live".
                book_age = order_book_age(symbol, provider)
                # Guardar depth raw para el bubble map de liquidez
                depth_raw = {
                    'bids': [[p, q] for p, q in bids[:40]],
                    'asks': [[p, q] for p, q in asks[:40]],
                }
        except Exception as e:
            logger.warning(f"[TradingData] order book fallo para {symbol}: {e}")

    # US EQUITIES & FALLBACK: Si no hay order book directo (p.ej. acciones donde no hay L2 público),
    # calcular el mapa de liquidez y depth_raw con el Volume Profile real de las velas
    if depth_raw is None and closes:
        try:
            window_len = min(60, len(closes))
            w_highs = highs[-window_len:]
            w_lows = lows[-window_len:]
            w_closes = closes[-window_len:]
            w_opens = opens[-window_len:]
            w_vols = quote_volumes[-window_len:] if quote_volumes else [abs(c - o) * 100 for c, o in zip(w_closes, w_opens)]

            min_p = min(w_lows)
            max_p = max(w_highs)

            # Rango de precios para 30 niveles a cada lado
            bid_range = max(precio - min_p, precio * 0.015)
            ask_range = max(max_p - precio, precio * 0.015)
            bid_step = bid_range / 30.0
            ask_step = ask_range / 30.0
            dec = price_decimals(precio)

            avg_vol = (sum(w_vols) / len(w_vols)) if w_vols else 1000.0

            bids_profile = []
            for i in range(1, 31):
                level_p = round(precio - i * bid_step, dec)
                # Volumen acumulado en velas que cotizaron en este nivel.
                # Sin volumen REAL el nivel se omite: antes se interpolaba
                # avg_vol*(0.3..1.0) y el bubble map mostraba liquidez
                # inventada en precios que nunca se tocaron.
                lvl_vol = sum(w_vols[j] for j in range(len(w_closes)) if w_lows[j] <= level_p <= max(w_opens[j], w_closes[j]))
                if lvl_vol <= 0:
                    continue
                # quote_volumes ahora es volumen en MONEDA COTIZADA (USDT/dolar)
                # para ambos mercados. Se divide por el precio para recuperar la
                # CANTIDAD en unidades base (monedas para crypto, acciones para
                # stocks), que es lo que dibuja el bubble map.
                qty = lvl_vol / max(level_p, 0.0001)
                bids_profile.append([level_p, round(qty, 4 if market == 'crypto' else 2)])

            asks_profile = []
            for i in range(1, 31):
                level_p = round(precio + i * ask_step, dec)
                lvl_vol = sum(w_vols[j] for j in range(len(w_closes)) if min(w_opens[j], w_closes[j]) <= level_p <= w_highs[j])
                if lvl_vol <= 0:
                    continue
                qty = lvl_vol / max(level_p, 0.0001)
                asks_profile.append([level_p, round(qty, 4 if market == 'crypto' else 2)])

            depth_raw = {
                'bids': bids_profile,
                'asks': asks_profile,
                'source': 'volume_profile' if market == 'stock' else 'synthetic_profile',
            }

            if best_bid is None and bids_profile:
                best_bid = bids_profile[0][0]
            if best_ask is None and asks_profile:
                best_ask = asks_profile[0][0]
            if ob_source is None:
                ob_source = 'volume_profile' if market == 'stock' else 'synthetic_profile'
        except Exception as e:
            logger.warning(f"[TradingData] volume profile de liquidez fallo para {symbol}: {e}")

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

    return {
        'bid_vol': bid_vol,
        'ask_vol': ask_vol,
        'best_bid': best_bid,
        'best_ask': best_ask,
        'buyer_percent': buyer_percent,
        'ob_source': ob_source,
        'ob_band': ob_band,
        'book_age': book_age,
        'depth_raw': depth_raw,
    }
