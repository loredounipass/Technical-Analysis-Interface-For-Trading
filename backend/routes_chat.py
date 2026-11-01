"""Blueprint de rutas de chat/AI: /api/chat y /api/models

Endpoint del agente de trading AI con contexto multi-temporalidad.
"""

import logging

from flask import Blueprint, jsonify, request
from nvidia_chat import nvidia_chat, NvidiaChatError, AVAILABLE_MODELS, classify_intent
from cache import rate_limited

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__)

# Timeframes disponibles para el contexto multi-temporalidad del agente
MTF_TIMEFRAMES = ('1m', '5m', '15m', '1h', '4h', '1d')

# Se inyecta desde app.py al registrar el blueprint
_get_cached_fn = None


def init_chat_routes(get_trading_cached_fn):
    """Inyecta la funcion de cache para evitar imports circulares."""
    global _get_cached_fn
    _get_cached_fn = get_trading_cached_fn


def _build_multi_timeframe_context(symbol, current_interval, market):
    """Snapshots compactos del MISMO activo en TODAS las temporalidades para
    que el agente compare alineacion de tendencias entre marcos. Lee de la
    cache de get_trading_cached (throttle REFRESH_MIN_GAP): la primera llamada
    por timeframe puede hacer un fetch REST, las siguientes son instantaneas."""
    snapshots = []
    for tf in MTF_TIMEFRAMES:
        if tf == current_interval:
            continue
        try:
            d = _get_cached_fn(symbol, tf, market)
        except Exception as e:
            logger.warning(f"[Chat] MTF fallo {symbol} {tf} ({market}): {e}")
            continue
        if not d or not isinstance(d, dict) or d.get('precio') is None:
            continue
        hist = d.get('history') or {}
        times = hist.get('times') or []
        snapshots.append({
            'timeframe': tf,
            'precio': d.get('precio'),
            'rsi': d.get('rsi'),
            'stochK': d.get('stochK'),
            'stochD': d.get('stochD'),
            'macdHistogram': d.get('macdHistogram'),
            'adx': d.get('adx'),
            'cci': d.get('cci'),
            'mfi': d.get('mfi'),
            'ema50': d.get('ema50'),
            'bbUpper': d.get('bbUpper'),
            'bbLower': d.get('bbLower'),
            'buySignals': d.get('buySignals'),
            'sellSignals': d.get('sellSignals'),
            'neutralSignals': d.get('neutralSignals'),
            'ts': times[-1] if times else None,
        })
    return snapshots


@chat_bp.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """AI Trading Agent chat endpoint. Fetches latest indicator data for context."""
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429
    data = request.get_json()
    if not data:
        return jsonify({'error': 'JSON body required'}), 400

    prompt = data.get('prompt', '').strip()
    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400
    model_key = data.get('model', 'nvidia-nemotron')
    symbol = data.get('symbol', 'BTCUSDT')
    interval = data.get('interval', '15m')
    market = data.get('market', 'crypto')
    if market not in ('crypto', 'stock'):
        market = 'crypto'
    history = data.get('history', [])
    global_context = data.get('global_context', '')
    temperature = data.get('temperature', 0.3)
    all_sessions = data.get('all_sessions', [])
    current_session_id = data.get('current_session_id')

    # ── Intent classification: decide if we need market data ──
    intent = classify_intent(prompt)
    logger.info(f"[Chat] Intent: {intent} | Prompt: {prompt[:80]}")

    # Only fetch indicator data for analysis / ambiguous intents
    indicator_data = None
    if intent in ('analysis', 'ambiguous'):
        try:
            frontend_data = data.get('indicator_data')
            cached_data = _get_cached_fn(symbol, interval, market) if _get_cached_fn else {}

            # Merge: usar datos cacheados/frescos del backend y sobreescribir con datos en vivo del frontend
            if cached_data and isinstance(cached_data, dict):
                indicator_data = dict(cached_data)
            else:
                indicator_data = {}

            if frontend_data and isinstance(frontend_data, dict) and frontend_data.get('precio'):
                for k, v in frontend_data.items():
                    if v is not None:
                        indicator_data[k] = v

            indicator_data['symbol'] = symbol
            indicator_data['timeframe'] = interval
            indicator_data['market'] = market

            # Multi-timeframe context
            indicator_data['multi_timeframe'] = _build_multi_timeframe_context(
                symbol, interval, market
            )
        except Exception as e:
            logger.warning(f"[Chat] Error obteniendo indicator_data: {e}")
            if not indicator_data:
                indicator_data = data.get('indicator_data') or {'symbol': symbol, 'error': str(e)}

    # Primer intento con historial completo y herramientas MCP de memoria
    try:
        response, memory_accessed = nvidia_chat(
            prompt=prompt,
            model_key=model_key,
            temperature=temperature,
            max_tokens=4096,
            history=history,
            global_context=global_context,
            indicator_data=indicator_data,
            intent=intent,
            all_sessions=all_sessions,
            current_session_id=current_session_id,
        )
        return jsonify({
            'response': response,
            'model': model_key,
            'intent': intent,
            'memory_accessed': memory_accessed,
        })
    except NvidiaChatError as e:
        # Si fallo con historial y HAY historial, reintentar SIN historial
        # (el cambio de modelo puede causar incompatibilidad con el contexto previo)
        if history:
            logger.warning(f"[Chat] Reintentando sin historial tras error: {e}")
            try:
                response, memory_accessed = nvidia_chat(
                    prompt=prompt,
                    model_key=model_key,
                    temperature=temperature,
                    max_tokens=4096,
                    history=None,
                    global_context=global_context,
                    indicator_data=indicator_data,
                    intent=intent,
                    all_sessions=all_sessions,
                    current_session_id=current_session_id,
                )
                return jsonify({
                    'response': response,
                    'model': model_key,
                    'context_reset': True,
                    'intent': intent,
                    'memory_accessed': memory_accessed,
                })
            except NvidiaChatError as retry_err:
                return jsonify({
                    'error': str(retry_err),
                    'error_code': retry_err.code,
                }), 503
        # Sin historial o segundo fallo: devolver el error específico
        return jsonify({
            'error': str(e),
            'error_code': e.code,
        }), 503
    except Exception as e:
        return jsonify({'error': f'Chat error: {str(e)}'}), 500


@chat_bp.route('/api/models')
def get_models():
    """Returns available AI models."""
    models = []
    for key, config in AVAILABLE_MODELS.items():
        models.append({
            'key': key,
            'name': config['name'],
            'provider': config['provider'],
            'free': config.get('free', False),
        })
    return jsonify(models)
