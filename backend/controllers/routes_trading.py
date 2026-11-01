"""Blueprint de rutas de trading: /api/trading/<symbol>

Endpoint principal para obtener datos de trading (precios, indicadores, historial)
con soporte para crypto y stocks, rate limiting y cache.
"""

import logging
from flask import Blueprint, jsonify, request
from common.cache import rate_limited

logger = logging.getLogger(__name__)

trading_bp = Blueprint('trading', __name__)

_get_cached_fn = None


def init_trading_routes(get_trading_cached_fn):
    """Inyecta la función de obtención de datos cacheados para evitar imports circulares."""
    global _get_cached_fn
    _get_cached_fn = get_trading_cached_fn


@trading_bp.route('/api/trading/<symbol>')
def get_trading_data(symbol):
    """ENDPOINT: OBTIENE DATOS DE TRADING PARA UN SIMBOLO, APLICANDO RATE LIMIT POR IP."""
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    interval = request.args.get('interval', '15m')
    market = request.args.get('market', 'crypto')
    force = request.args.get('force', '0') == '1'
    if market not in ('crypto', 'stock'):
        market = 'crypto'
    try:
        data = _get_cached_fn(symbol, interval, market, force=force)
        return jsonify(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        if '429' in str(e):
            return jsonify({'error': 'TradingView Rate Limit Exceeded'}), 429
        return jsonify({'error': str(e)}), 500
