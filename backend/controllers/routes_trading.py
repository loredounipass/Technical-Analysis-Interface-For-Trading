"""Blueprint de rutas de trading: /api/trading/<symbol>

Endpoint principal para obtener datos de trading (precios, indicadores, historial)
con soporte para crypto y stocks, rate limiting y cache.
"""

import logging
from flask import Blueprint, jsonify, request
from common.cache import rate_limited
from database import chat_store, market_preferences

logger = logging.getLogger(__name__)

trading_bp = Blueprint('trading', __name__)

_get_cached_fn = None


def init_trading_routes(get_trading_cached_fn):
    """Inyecta la función de obtención de datos cacheados para evitar imports circulares."""
    global _get_cached_fn
    _get_cached_fn = get_trading_cached_fn


@trading_bp.get('/api/trading/provider-preference')
def get_provider_preference():
    try:
        owner_id = chat_store.normalize_owner_id(
            request.headers.get('X-Chat-Owner-ID')
        )
        provider = market_preferences.get_crypto_provider(owner_id)
        return jsonify({'crypto_provider': provider})
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    except Exception:
        logger.exception("[TradingData] No se pudo cargar la preferencia del proveedor")
        return jsonify({'error': 'No se pudo cargar la preferencia del proveedor.'}), 500


@trading_bp.patch('/api/trading/provider-preference')
def update_provider_preference():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'JSON object body required.'}), 400
    provider = data.get('crypto_provider')
    if provider not in ('binance', 'coinbase'):
        return jsonify({'error': 'crypto_provider must be binance or coinbase.'}), 400
    try:
        owner_id = chat_store.normalize_owner_id(
            request.headers.get('X-Chat-Owner-ID')
        )
        saved_provider = market_preferences.update_crypto_provider(
            owner_id, provider
        )
        return jsonify({'crypto_provider': saved_provider})
    except ValueError as error:
        return jsonify({'error': str(error)}), 400
    except Exception:
        logger.exception("[TradingData] No se pudo guardar la preferencia del proveedor")
        return jsonify({'error': 'No se pudo guardar la preferencia del proveedor.'}), 500


@trading_bp.route('/api/trading/<symbol>')
def get_trading_data(symbol):
    """ENDPOINT: OBTIENE DATOS DE TRADING PARA UN SIMBOLO, APLICANDO RATE LIMIT POR IP."""
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    interval = request.args.get('interval', '15m')
    market = request.args.get('market', 'crypto')
    provider = request.args.get('provider', 'coinbase')
    force = request.args.get('force', '0') == '1'
    if market not in ('crypto', 'stock'):
        market = 'crypto'
    if market == 'stock':
        provider = 'yahoo'
    elif provider not in ('binance', 'coinbase'):
        return jsonify({'error': 'Proveedor no soportado'}), 400
    try:
        data = _get_cached_fn(
            symbol, interval, market, force=force, provider=provider
        )
        return jsonify(data)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        if '429' in str(e):
            return jsonify({'error': 'TradingView Rate Limit Exceeded'}), 429
        return jsonify({'error': str(e)}), 500
