from flask import Flask, request
from flask_cors import CORS
from flask_socketio import SocketIO
import os
import logging
from dotenv import load_dotenv

# Configurar logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()

# ─────────────────────────────────────────────────────────────────────
# Modulos internos
# ─────────────────────────────────────────────────────────────────────
from common.cache import get_trading_cached
from services.payload_builder import fetch_trading_data
from controllers.routes_trading import trading_bp, init_trading_routes
from controllers.routes_news import news_bp
from controllers.routes_chat import chat_bp, init_chat_routes
from controllers.routes_tts import tts_bp
from common.sockets import init_sockets
from gateways.stream_manager import init_market_streams

# ─────────────────────────────────────────────────────────────────────
# Flask app + CORS + SocketIO
# ─────────────────────────────────────────────────────────────────────
app = Flask(__name__)

# Confia en X-Forwarded-For/Proto de Render para ver la IP real del cliente.
# Sin esto, request.remote_addr es siempre 127.0.0.1 (el proxy de Render)
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
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins=ALLOWED_ORIGINS, async_mode='threading')



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
    return response


# ─────────────────────────────────────────────────────────────────────
# Cache wrapper (inyecta fetch_trading_data para evitar imports circulares)
# ─────────────────────────────────────────────────────────────────────
def _get_trading_cached(symbol, interval_str='15m', market='crypto', force=False):
    return get_trading_cached(symbol, interval_str, market, force=force,
                              fetch_fn=fetch_trading_data)


# ─────────────────────────────────────────────────────────────────────
# Registrar blueprints (trading + news + chat/AI)
# ─────────────────────────────────────────────────────────────────────
init_trading_routes(_get_trading_cached)
app.register_blueprint(trading_bp)

app.register_blueprint(news_bp)

init_chat_routes(_get_trading_cached)
app.register_blueprint(chat_bp)

# TTS: no requiere inyeccion de cache; expone POST /api/tts (audio/wav).
app.register_blueprint(tts_bp)


# ─────────────────────────────────────────────────────────────────────
# SOCKETS & REAL-TIME STREAMING
# ─────────────────────────────────────────────────────────────────────
init_sockets(socketio, _get_trading_cached)
init_market_streams(socketio)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_DEBUG', 'false').lower() == 'true'
    socketio.run(app, port=port, debug=debug, host='0.0.0.0', allow_unsafe_werkzeug=True)
