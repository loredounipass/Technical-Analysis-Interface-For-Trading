"""Libro de ordenes real (crypto) + volume profile / proxy de volumen (stocks).

Calcula dominancia compradora, mejores niveles bid/ask y el depth raw que
dibuja el bubble map de liquidez.
"""

import logging

from services.indicators import price_decimals
from services.data_fetchers import fetch_order_book_depth

logger = logging.getLogger(__name__)


def compute_liquidity(symbol, market, precio, opens, highs, lows, closes,
                      quote_volumes, provider='coinbase'):
    """Devuelve el bloque de liquidez: bid_vol, ask_vol, best_bid, best_ask,
    buyer_percent, ob_source y depth_raw.

    Crypto: profundidad del LIBRO DEL PROVEEDOR SELECCIONADO (bids/asks reales).
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

    depth_raw = None
    if market == 'crypto':
        try:
            depth = fetch_order_book_depth(symbol, provider)
            if depth and depth.get('bids') and depth.get('asks'):
                bids = [(float(p), float(q)) for p, q in depth['bids']]
                asks = [(float(p), float(q)) for p, q in depth['asks']]
                bid_vol = sum(q * p for p, q in bids[:20])
                ask_vol = sum(q * p for p, q in asks[:20])
                best_bid = bids[0][0]
                best_ask = asks[0][0]
                ob_source = 'order_book'
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
        'depth_raw': depth_raw,
    }
