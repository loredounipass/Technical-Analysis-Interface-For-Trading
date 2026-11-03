"""Blueprint de rutas de chat/AI: /api/chat y /api/models

Endpoint del agente de trading AI con contexto multi-temporalidad.
"""

import logging

import json
from uuid import UUID
from flask import Blueprint, jsonify, request, Response, stream_with_context
from services.chat import nvidia_chat, nvidia_chat_stream, NvidiaChatError, AVAILABLE_MODELS, classify_intent
from common.cache import rate_limited
from database import chat_store

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


def _build_multi_timeframe_context(symbol, current_interval, market,
                                   provider='coinbase'):
    """Snapshots compactos del MISMO activo en TODAS las temporalidades para
    que el agente compare alineacion de tendencias entre marcos. Lee de la
    cache de get_trading_cached (throttle REFRESH_MIN_GAP): la primera llamada
    por timeframe puede hacer un fetch REST, las siguientes son instantaneas."""
    snapshots = []
    for tf in MTF_TIMEFRAMES:
        if tf == current_interval:
            continue
        try:
            d = _get_cached_fn(symbol, tf, market, provider=provider)
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
            'squeezeState': d.get('squeezeState'),
            'squeezeMomentum': d.get('squeezeMomentum'),
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
    if not isinstance(data, dict):
        return jsonify({'error': 'JSON object body required'}), 400

    prompt = data.get('prompt', '')
    if not isinstance(prompt, str) or not prompt.strip():
        return jsonify({'error': 'prompt is required'}), 400
    prompt = prompt.strip()
    try:
        owner_id = chat_store.normalize_owner_id(request.headers.get('X-Chat-Owner-ID'))
        current_session_id = str(UUID(str(data.get('session_id'))))
    except ValueError as error:
        return jsonify({'error': str(error)}), 400

    state = chat_store.get_state(owner_id)
    current_session = next(
        (session for session in state['sessions'] if session['id'] == current_session_id),
        None,
    )
    if current_session is None:
        return jsonify({'error': 'Chat session not found.'}), 404

    model_key = data.get('model', state['selected_model'])
    if not isinstance(model_key, str) or model_key not in AVAILABLE_MODELS:
        return jsonify({'error': 'Unknown chat model.'}), 400
    symbol = data.get('symbol', 'BTCUSDT')
    interval = data.get('interval', '15m')
    market = data.get('market', 'crypto')
    provider = data.get('provider', 'coinbase')
    if not isinstance(symbol, str) or not symbol or not isinstance(interval, str):
        return jsonify({'error': 'symbol and interval must be strings.'}), 400
    if market not in ('crypto', 'stock'):
        market = 'crypto'
    if market == 'stock':
        provider = 'yahoo'
    elif provider not in ('binance', 'coinbase'):
        return jsonify({'error': 'Unsupported market data provider.'}), 400
    history = []
    for index, message in enumerate(current_session['messages']):
        if message.get('isError'):
            continue
        # El analisis de una respuesta previa pierde su sentido si se reenvia sin
        # decir de que exchange salio: se conservan los campos de procedencia que
        # el terminal guarda como metadata (provider/symbol/timeframe) para que
        # build_messages los etiquete.
        entry = {'role': message['role'], 'content': message['content']}
        for key in ('provider', 'symbol', 'timeframe'):
            if message.get(key) is not None:
                entry[key] = message[key]
        if index == 0 and entry['role'] == 'assistant':
            continue
        history.append(entry)
    if history and history[-1]['role'] == 'user' and history[-1]['content'] == prompt:
        history.pop()
    global_context = ' | '.join(
        f"{'Current session' if session['id'] == current_session_id else 'Session'} "
        f"[{session['symbol']}]: {session['title']}"
        for session in state['sessions']
    )
    temperature = data.get('temperature')  # None -> usa el default por modelo
    web_search_enabled = state['web_search_enabled']

    # ── Intent classification: decide if we need market data ──
    intent = classify_intent(prompt)
    logger.info(f"[Chat] Intent: {intent} | web_search={web_search_enabled} | model={model_key} | Prompt: {prompt[:80]}")

    # Snapshot del feed seleccionado: SIEMPRE se construye, sin depender de la
    # intencion. La tool MCP get_selected_market_data lo usa como fuente, y el
    # clasificador de intencion es un regex de palabras clave que clasifica como
    # 'casual' follow-ups legitimos ("y estos datos son reales?", "ETHUSDT 15m
    # — Lectura rapida"). Atar el snapshot a la intencion producia un falso
    # "sin datos" que hacia al agente retractarse de un analisis correcto.
    # El prompt sigue gateado por intencion (context.py resuelve effective_data),
    # asi que las charlas casuales no se inflan con indicadores.
    indicator_data = {}
    try:
        frontend_data = data.get('indicator_data')
        cached_data = (
            _get_cached_fn(symbol, interval, market, provider=provider)
            if _get_cached_fn else {}
        )

        # Only merge frontend values when they identify the same selected feed.
        if cached_data and isinstance(cached_data, dict):
            indicator_data = dict(cached_data)

        if (
            frontend_data
            and isinstance(frontend_data, dict)
            and frontend_data.get('provider') == provider
            and frontend_data.get('precio') is not None
        ):
            for k, v in frontend_data.items():
                if v is not None:
                    indicator_data[k] = v

        if market == 'crypto':
            order_flow = indicator_data.get('orderFlow')
            if (
                isinstance(order_flow, dict)
                and order_flow.get('provider') != provider
            ):
                logger.warning(
                    "[Chat] Omitiendo order flow de %s para solicitud del proveedor %s (%s)",
                    order_flow.get('provider', 'desconocido'),
                    provider,
                    symbol,
                )
                indicator_data['orderFlow'] = None

        # Multi-timeframe context: caro (6 temporalidades) y solo aporta al
        # informe tecnico, no a una conversacion casual.
        if intent in ('analysis', 'ambiguous'):
            indicator_data['multi_timeframe'] = _build_multi_timeframe_context(
                symbol, interval, market, provider
            )
    except Exception as e:
        logger.warning(f"[Chat] Error obteniendo indicator_data: {e}")
        if not isinstance(indicator_data, dict):
            indicator_data = {}
    finally:
        # La identidad del feed NUNCA se pierde, ni siquiera cuando el fetch
        # fallo: sin estos campos la tool reportaria 'sin datos' aunque Binance
        # estuviera respondiendo perfectamente.
        indicator_data['symbol'] = symbol
        indicator_data['timeframe'] = interval
        indicator_data['market'] = market
        indicator_data['provider'] = provider

    # Si el cliente solicita streaming (SSE en tiempo real con pensamientos)
    if data.get('stream', False):
        def generate_sse():
            try:
                for event in nvidia_chat_stream(
                    prompt=prompt,
                    model_key=model_key,
                    temperature=temperature,
                    history=history,
                    global_context=global_context,
                    indicator_data=indicator_data,
                    intent=intent,
                    owner_id=owner_id,
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
            history=history,
            global_context=global_context,
            indicator_data=indicator_data,
            intent=intent,
            owner_id=owner_id,
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
                    history=None,
                    global_context=global_context,
                    indicator_data=indicator_data,
                    intent=intent,
                    owner_id=owner_id,
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
    import services.chat.web_search as ws

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
