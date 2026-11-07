from flask import Flask, request, g
from flask_cors import CORS
from flask_socketio import SocketIO
import os
import logging
from dotenv import load_dotenv

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
from pathlib import Path
load_dotenv()
_backend_env = Path(__file__).resolve().parent / ".env"
if _backend_env.is_file():
    load_dotenv(_backend_env)

# ─────────────────────────────────────────────────────────────────────
# Modulos internos
# ─────────────────────────────────────────────────────────────────────
from common.cache import get_trading_cached
from common import market_store
from common.redis_client import redis_url, market_backend, is_feeder_role
from services.payload_builder import fetch_trading_data
from controllers.routes_trading import trading_bp, init_trading_routes
from controllers.routes_news import news_bp
from controllers.routes_chat import chat_bp, init_chat_routes
from controllers.routes_chat_sessions import chat_sessions_bp
from controllers.routes_tts import tts_bp
from database.chat_store import initialize_database
from common.sockets import init_sockets
from gateways.stream_manager import init_market_streams
from services.chat.tools import set_market_data_source
from controllers.routes_auth import auth_bp
from auth.guards import is_public_route
from auth.strategies.jwt_strategy import decode_token, is_blacklisted
from auth.constants import TOKEN_TYPE_ACCESS
from database import user_store

# ─────────────────────────────────────────────────────────────────────
# Flask app + CORS + SocketIO
# ─────────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

# Confía en X-Forwarded-For/Proto del proxy inverso para ver la IP real del cliente.
# Sin esto, request.remote_addr es siempre 127.0.0.1 (el proxy)
# y el rate limiting se aplica a TODOS los usuarios como si fueran uno solo.
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

# Origenes permitidos para CORS (separados por coma). En produccion se debe
# configurar la URL del frontend, ej: https://mi-frontend.onrender.com
DEFAULT_ORIGIN = "http://localhost:3000"
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGIN).split(",") if o.strip()
]
if DEFAULT_ORIGIN not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(DEFAULT_ORIGIN)

CORS(app, resources={
    r"/*": {
        "origins": ALLOWED_ORIGINS,
        "methods": ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "X-Chat-Owner-ID", "Authorization"]
    }
})

# Initialize SocketIO
# Con Redis activo, el manager de salas tambien vive en Redis: cualquier replica
# de la API puede emitir a una sala aunque la conexion del cliente este en otra.
socketio_kwargs = {}
if market_store.redis_active():
    socketio_kwargs['message_queue'] = redis_url()
logger.info(
    f"[App] MARKET_BACKEND={market_backend()} redis_available={market_store.redis_active()} "
    f"role={'feeder' if is_feeder_role() else 'api'}"
)
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS,
                    async_mode='threading', **socketio_kwargs)


# ─────────────────────────────────────────────────────────────────────
# GUARD GLOBAL DE JWT — protege TODAS las rutas excepto las marcadas @public.
# Equivale a APP_GUARD(JwtAuthGuard) de NestJS: la autenticación es opt-out,
# no opt-in. Los health-checks y las rutas de auth llevan @public.
# ─────────────────────────────────────────────────────────────────────
@app.before_request
def global_jwt_guard():
    """Enforce JWT authentication on every route unless marked @public."""
    # Preflight CORS (OPTIONS) nunca lleva token.
    if request.method == "OPTIONS":
        return None

    # Solo aplicar a rutas de la API (/api/*), permitiendo /socket.io y estáticos.
    if not request.path.startswith("/api/"):
        return None

    # Si la ruta no coincide con ningún endpoint, dejar que Flask gestione el 404
    if request.endpoint is None:
        return None

    # Buscar la view function para esta ruta; solo se omite auth si tiene @public explícito
    view_fn = app.view_functions.get(request.endpoint)
    if view_fn is not None and is_public_route(view_fn):
        return None  # Ruta pública explícita, saltar auth.

    # ── Extraer y validar Bearer token ──
    from flask import jsonify as _jsonify
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return _jsonify({"error": "Missing or invalid Authorization header."}), 401

    token = auth_header[7:].strip()
    if not token:
        return _jsonify({"error": "Missing token in Authorization header."}), 401
    try:
        payload = decode_token(token)
    except ValueError as error:
        return _jsonify({"error": str(error)}), 401
    except Exception:
        return _jsonify({"error": "Authentication failed."}), 401

    if payload.get("type") != TOKEN_TYPE_ACCESS:
        return _jsonify({"error": "Invalid token type."}), 401

    if is_blacklisted(payload["jti"]):
        return _jsonify({"error": "Token has been revoked."}), 401

    try:
        user = user_store.find_by_id(payload["sub"])
    except ValueError:
        return _jsonify({"error": "Invalid user ID in token."}), 401
    except Exception as db_err:
        logger.exception("[Auth] Database error looking up user %s: %s", payload.get("sub"), db_err)
        return _jsonify({"error": "Database authentication error."}), 500

    if user is None or not user.get("is_active"):
        return _jsonify({"error": "User not found or inactive."}), 401

    # Inyectar usuario autenticado y payload en el contexto de Flask.
    g.current_user = user
    g.jwt_payload = payload
    return None



@app.before_request
def log_request_info():
    logger.info("--- NUEVA PETICIÓN ---")
    logger.info(f"Origin: {request.headers.get('Origin')}")
    logger.info(f"Method: {request.method}")
    logger.info(f"URL: {request.url}")
    logger.info("----------------------")


@app.after_request
def set_security_headers(response):
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' wss: https:; "
        "font-src 'self'; "
        "frame-ancestors 'none'"
    )
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    return response


# ─────────────────────────────────────────────────────────────────────
# Cache wrapper (inyecta fetch_trading_data para evitar imports circulares)
# ─────────────────────────────────────────────────────────────────────
def _get_trading_cached(symbol, interval_str='15m', market='crypto', force=False,
                        provider='coinbase'):
    return get_trading_cached(symbol, interval_str, market, force=force,
                              fetch_fn=fetch_trading_data, provider=provider)


# La tool MCP get_selected_market_data consulta el feed por su cuenta en vez de
# depender solo del snapshot del request (evita el falso "sin datos").
set_market_data_source(_get_trading_cached)


# ─────────────────────────────────────────────────────────────────────
# Registrar blueprints (auth + trading + news + chat/AI)
# ─────────────────────────────────────────────────────────────────────
app.register_blueprint(auth_bp)

init_trading_routes(_get_trading_cached)
app.register_blueprint(trading_bp)

app.register_blueprint(news_bp)

init_chat_routes(_get_trading_cached)
app.register_blueprint(chat_bp)
app.register_blueprint(chat_sessions_bp)

# TTS: no requiere inyeccion de cache; expone POST /api/tts (audio/wav).
app.register_blueprint(tts_bp)

initialize_database()


# ─────────────────────────────────────────────────────────────────────
# SOCKETS & REAL-TIME STREAMING
# ─────────────────────────────────────────────────────────────────────
init_sockets(socketio, _get_trading_cached)
if market_store.redis_active() and not market_store.is_feeder_role():
    # El unico cliente de los exchanges es el feeder worker (feeder.py).
    # La API no abre WebSockets a Binance/Coinbase ni polla REST: solo lee
    # Redis y reenvia a los clientes.
    logger.info("[App] Redis activo: streams deshabilitados en la API "
                "(el feeder es el unico escritor del feed).")
else:
    init_market_streams(socketio)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    socketio.run(app, port=port, debug=debug, host='0.0.0.0', allow_unsafe_werkzeug=True)
