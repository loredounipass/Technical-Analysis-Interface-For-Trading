"""Conexion compartida a Redis (singleton perezoso).

Redis es la unica fuente de datos de mercado que leen la API HTTP, los sockets
y el agente de chat. Quien escribe es exclusivamente el feeder worker
(ver feeder.py), que es el unico proceso autorizado a hablar con los exchanges.

Todo es perezoso: si la libreria o el servidor no estan disponibles, redis_enabled()
devuelve False y la aplicacion sigue usando el cache en memoria de common/cache.py
(modo Docker local simple / Vercel serverless sin Redis).
"""

import os
import logging
import threading

logger = logging.getLogger(__name__)

_client = None
_client_lock = threading.Lock()
_import_failed = False


def market_backend():
    """'redis' o 'memory'. Se define con MARKET_BACKEND en el entorno."""
    return (os.getenv('MARKET_BACKEND', 'memory') or 'memory').strip().lower()


def is_feeder_role():
    """True cuando el proceso es el worker que alimenta Redis."""
    return (os.getenv('MARKET_ROLE', 'api') or 'api').strip().lower() == 'feeder'


def redis_url():
    return os.getenv('REDIS_URL', 'redis://localhost:6379/0')


def get_redis():
    """Devuelve el cliente compartido o None si Redis no esta disponible."""
    global _client, _import_failed
    if market_backend() != 'redis' or _import_failed:
        return None
    with _client_lock:
        if _client is not None:
            return _client
        try:
            import redis
        except ImportError:
            _import_failed = True
            logger.warning(
                "[Redis] MARKET_BACKEND=redis pero la libreria 'redis' no esta "
                "instalada; se usera cache en memoria."
            )
            return None
        try:
            candidate = redis.Redis.from_url(
                redis_url(),
                decode_responses=False,
                socket_timeout=3,
                socket_connect_timeout=3,
                health_check_interval=30,
                max_connections=int(os.getenv('REDIS_MAX_CONNECTIONS', '24')),
            )
            candidate.ping()
        except Exception as e:
            _import_failed = True
            logger.error(f"[Redis] No se pudo conectar ({redis_url()}): {e}. "
                         f"Fallback a cache en memoria.")
            return None
        _client = candidate
        logger.info(f"[Redis] Conectado a {redis_url()} (MARKET_BACKEND=redis)")
        return _client


def redis_enabled():
    return get_redis() is not None


def reset_client_for_tests():
    """Permite re-elegir backend despues de cambiar variables de entorno."""
    global _client, _import_failed
    with _client_lock:
        _client = None
        _import_failed = False
