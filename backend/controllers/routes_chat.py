"""Blueprint de rutas de chat/AI: /api/chat y /api/models

Endpoint del agente de trading AI con contexto multi-temporalidad.
"""

import logging

import json
from flask import Blueprint, jsonify, request, Response, stream_with_context
from services.nvidia_chat import nvidia_chat, nvidia_chat_stream, NvidiaChatError, AVAILABLE_MODELS, classify_intent
from common.cache import rate_limited

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__)

# Timeframes disponibles para el contexto multi-temporalidad del agente
MTF_TIMEFRAMES = ('1m', '5m', '15m', '1h', '6h', '1d')

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
    web_search_enabled = bool(data.get('web_search', False))

    # ── Intent classification: decide if we need market data ──
    intent = classify_intent(prompt)
    logger.info(f"[Chat] Intent: {intent} | web_search={web_search_enabled} | model={model_key} | Prompt: {prompt[:80]}")

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

    # Si el cliente solicita streaming (SSE en tiempo real con pensamientos)
    if data.get('stream', False):
        def generate_sse():
            try:
                for event in nvidia_chat_stream(
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
                    web_search_enabled=web_search_enabled,
                ):
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

        return Response(
            stream_with_context(generate_sse()),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'X-Accel-Buffering': 'no',
                'Connection': 'keep-alive',
            }
        )

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
            web_search_enabled=web_search_enabled,
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
                    web_search_enabled=web_search_enabled,
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
            'reasoning': config.get('reasoning', False),
        })
    return jsonify(models)


@chat_bp.route('/api/search/health')
def search_health():
    """Diagnostico de busqueda web para depurar en el servidor desplegado.

    Uso: GET /api/search/health?q=Binance+hack&source=all&time_range=week
    Devuelve config real (orden de proveedores, key cargada) + una busqueda en
    vivo con temporizacion y errores crudos. No revela la key completa.
    """
    import time as _t
    from urllib.parse import unquote
    import services.web_search as ws

    q = unquote(request.args.get('q', 'Binance hack'))
    src = (request.args.get('source') or 'all').lower()
    tr = request.args.get('time_range') or None

    t0 = _t.monotonic()
    r = ws.web_search(q, max_results=5, source=src, time_range=tr)
    secs = round(_t.monotonic() - t0, 2)

    key = ws._SERPAPI_API_KEY
    return jsonify({
        'config': {
            'WEB_SEARCH_PROVIDER': ws._PROVIDER_ORDER,
            'SERPAPI_KEY_LOADED': bool(ws._HAS_SERPAPI),
            'SERPAPI_KEY_HEAD': (key[:6] + '…' + key[-4:]) if ws._HAS_SERPAPI else None,
        },
        'query': q, 'source': src, 'time_range': tr,
        'seconds': secs,
        'count': r.get('count'), 'provider': r.get('provider'),
        'error': r.get('error'), 'widened': r.get('widened'),
        'debug': r.get('debug'),
        'sample_urls': [x.get('url') for x in (r.get('results') or [])[:5]],
    })
