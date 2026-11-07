"""JWT token encoding, decoding, and Redis-backed token management.

This module maintains its **own** Redis connection dedicated to
authentication concerns (token blacklisting, refresh-token tracking).
It is completely independent of the market-data Redis client in
``common/redis_client.py`` and is always initialised regardless of the
``MARKET_BACKEND`` environment variable.

The auth Redis client uses ``decode_responses=True`` (strings) whereas the
market client uses ``decode_responses=False`` (bytes).
"""

import logging
import os
from pathlib import Path
import threading
import time
from uuid import uuid4

import jwt
from dotenv import load_dotenv

from auth.constants import (
    DEFAULT_ACCESS_TOKEN_TTL,
    DEFAULT_REFRESH_TOKEN_TTL,
    MAX_SESSIONS_PER_USER,
    REDIS_BLACKLIST_PREFIX,
    REDIS_REFRESH_PREFIX,
    REDIS_ROTATED_PREFIX,
    ROTATED_TOKEN_TTL,
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_REFRESH,
)

logger = logging.getLogger(__name__)

# ── Configuration ────────────────────────────────────────────────────────────

load_dotenv()
_backend_env = Path(__file__).resolve().parents[2] / ".env"
if _backend_env.is_file():
    load_dotenv(_backend_env)

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    logger.warning(
        "[JWT] JWT_SECRET_KEY environment variable is not set. "
        "Using development fallback secret key. "
        "Set JWT_SECRET_KEY in production!"
    )
    SECRET_KEY = "synapse-development-secret-key-change-in-production-only-min-32-chars"

ALGORITHM = "HS256"
ACCESS_TTL = int(os.getenv("JWT_ACCESS_TTL", DEFAULT_ACCESS_TOKEN_TTL))
REFRESH_TTL = int(os.getenv("JWT_REFRESH_TTL", DEFAULT_REFRESH_TOKEN_TTL))

# ── Auth-dedicated Redis client (lazy singleton with auto-reconnect) ──────────

_auth_redis_client = None
_auth_redis_lock = threading.Lock()
_auth_redis_missing_library = False
_last_auth_redis_failure = 0.0
_REDIS_RETRY_COOLDOWN = 5.0  # seconds before attempting reconnection


def _get_auth_redis():
    """Return the auth-dedicated Redis client, or ``None`` if unavailable.

    This function creates a lazy singleton ``redis.Redis`` instance that
    connects using the ``REDIS_URL`` environment variable. Unlike the
    market-data client, this connection is **always** attempted regardless
    of ``MARKET_BACKEND`` — authentication always needs Redis for token
    management. If connection fails, it automatically retries after a 5s
    cooldown without permanently disabling Redis.

    Returns
    -------
    redis.Redis | None
        The connected Redis client, or ``None`` if Redis is unavailable.
    """
    global _auth_redis_client, _auth_redis_missing_library, _last_auth_redis_failure

    if _auth_redis_missing_library:
        return None

    # Fast path without acquiring lock
    if _auth_redis_client is not None:
        return _auth_redis_client

    now = time.time()
    if now - _last_auth_redis_failure < _REDIS_RETRY_COOLDOWN:
        return None

    with _auth_redis_lock:
        if _auth_redis_client is not None:
            return _auth_redis_client

        try:
            import redis as _redis_lib
        except ImportError:
            _auth_redis_missing_library = True
            logger.critical(
                "[AuthRedis] The 'redis' library is not installed. "
                "Token blacklisting and refresh-token tracking will be disabled."
            )
            return None

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        try:
            candidate = _redis_lib.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=3,
                socket_connect_timeout=3,
                health_check_interval=30,
            )
            candidate.ping()
        except Exception as exc:
            _last_auth_redis_failure = time.time()
            logger.warning(
                "[AuthRedis] Could not connect to Redis at %s (%s). Will retry in %ss.",
                redis_url,
                exc,
                _REDIS_RETRY_COOLDOWN,
            )
            return None

        _auth_redis_client = candidate
        logger.info("[AuthRedis] Connected to %s (auth-dedicated client)", redis_url)
        return _auth_redis_client


# ── Access tokens ────────────────────────────────────────────────────────────


def encode_access_token(user_id: str) -> tuple[str, str, int]:
    """Create a signed JWT access token.

    Parameters
    ----------
    user_id:
        The unique identifier of the authenticated user.

    Returns
    -------
    tuple[str, str, int]
        A 3-tuple of ``(token, jti, expires_in)`` where *token* is the
        encoded JWT string, *jti* is its unique identifier, and
        *expires_in* is the TTL in seconds.
    """
    now = int(time.time())
    jti = uuid4().hex
    payload = {
        "sub": str(user_id),
        "jti": jti,
        "type": TOKEN_TYPE_ACCESS,
        "iat": now,
        "exp": now + ACCESS_TTL,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token, jti, ACCESS_TTL


# ── Refresh tokens ───────────────────────────────────────────────────────────


def encode_refresh_token(user_id: str) -> tuple[str, str]:
    """Create a signed JWT refresh token and persist it in Redis.

    Parameters
    ----------
    user_id:
        The unique identifier of the authenticated user.

    Returns
    -------
    tuple[str, str]
        A 2-tuple of ``(token, jti)``.
    """
    now = int(time.time())
    jti = uuid4().hex
    payload = {
        "sub": str(user_id),
        "jti": jti,
        "type": TOKEN_TYPE_REFRESH,
        "iat": now,
        "exp": now + REFRESH_TTL,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    store_refresh_token(str(user_id), jti)
    return token, jti


def generate_token_pair(user_id: str) -> dict:
    """Generate both an access and a refresh token for *user_id*.

    Parameters
    ----------
    user_id:
        The unique identifier of the authenticated user.

    Returns
    -------
    dict
        ``{"access_token": str, "refresh_token": str, "expires_in": int}``
    """
    access_token, _access_jti, expires_in = encode_access_token(user_id)
    refresh_token, _refresh_jti = encode_refresh_token(user_id)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": expires_in,
    }


# ── Token decoding ───────────────────────────────────────────────────────────


def decode_token(token: str) -> dict:
    """Decode and verify a JWT token.

    Parameters
    ----------
    token:
        The raw JWT string.

    Returns
    -------
    dict
        The decoded payload.

    Raises
    ------
    ValueError
        If the token is expired or otherwise invalid.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise ValueError("Token has expired.")
    except jwt.InvalidTokenError:
        raise ValueError("Invalid token.")


# ── Blacklist management ─────────────────────────────────────────────────────


def is_blacklisted(jti: str) -> bool:
    """Check whether the token identified by *jti* has been blacklisted.

    If Redis is unavailable the function **fails open** (returns ``False``)
    to avoid locking every user out, but logs a warning.

    Parameters
    ----------
    jti:
        The JWT ID (``jti`` claim) to check.

    Returns
    -------
    bool
        ``True`` if the token is blacklisted.
    """
    client = _get_auth_redis()
    if client is None:
        logger.warning(
            "[AuthRedis] Redis unavailable — cannot verify blacklist for jti=%s. "
            "Failing open.",
            jti,
        )
        return False
    key = f"{REDIS_BLACKLIST_PREFIX}:{jti}"
    try:
        return bool(client.exists(key))
    except Exception as exc:
        logger.warning(
            "[AuthRedis] Redis error during blacklist check for jti=%s: %s. Failing open.",
            jti,
            exc,
        )
        return False


def blacklist_token(jti: str, remaining_ttl: int) -> None:
    """Add the token identified by *jti* to the blacklist.

    The key is stored with an expiry equal to *remaining_ttl* so it is
    automatically cleaned up after the token would have expired anyway.

    Parameters
    ----------
    jti:
        The JWT ID (``jti`` claim) of the token to blacklist.
    remaining_ttl:
        Seconds until the token naturally expires.
    """
    if remaining_ttl <= 0:
        return

    client = _get_auth_redis()
    if client is None:
        logger.warning(
            "[AuthRedis] Redis unavailable — could not blacklist jti=%s.",
            jti,
        )
        return
    key = f"{REDIS_BLACKLIST_PREFIX}:{jti}"
    try:
        client.setex(key, remaining_ttl, "1")
    except Exception as exc:
        logger.warning("[AuthRedis] Redis error blacklisting jti=%s: %s", jti, exc)


# ── Refresh-token persistence ───────────────────────────────────────────────


def store_refresh_token(user_id: str, jti: str) -> None:
    """Persist a refresh-token reference in Redis and enforce max active sessions.

    Parameters
    ----------
    user_id:
        The owner of the token.
    jti:
        The JWT ID of the refresh token.
    """
    client = _get_auth_redis()
    if client is None:
        logger.warning(
            "[AuthRedis] Redis unavailable — could not store refresh token "
            "for user_id=%s.",
            user_id,
        )
        return
    key = f"{REDIS_REFRESH_PREFIX}:{user_id}:{jti}"
    try:
        # Enforce maximum concurrent active sessions per user
        pattern = f"{REDIS_REFRESH_PREFIX}:{user_id}:*"
        cursor, keys = client.scan(cursor=0, match=pattern, count=100)
        if keys and len(keys) >= MAX_SESSIONS_PER_USER:
            excess = len(keys) - MAX_SESSIONS_PER_USER + 1
            if excess > 0:
                client.delete(*keys[:excess])
        client.setex(key, REFRESH_TTL, "1")
    except Exception as exc:
        logger.warning(
            "[AuthRedis] Redis error storing refresh token for user_id=%s: %s",
            user_id,
            exc,
        )


def record_rotated_token(jti: str) -> None:
    """Record an already-rotated refresh token JTI to enable token theft detection.

    If an already rotated token is presented again, it indicates a compromised
    token or session hijacking attempt.
    """
    client = _get_auth_redis()
    if client is None:
        return
    key = f"{REDIS_ROTATED_PREFIX}:{jti}"
    try:
        client.setex(key, ROTATED_TOKEN_TTL, "1")
    except Exception as exc:
        logger.warning("[AuthRedis] Redis error recording rotated token jti=%s: %s", jti, exc)


def is_rotated_token(jti: str) -> bool:
    """Check whether a refresh token has already been rotated (indicates token theft)."""
    client = _get_auth_redis()
    if client is None:
        return False
    key = f"{REDIS_ROTATED_PREFIX}:{jti}"
    try:
        return bool(client.exists(key))
    except Exception as exc:
        logger.warning("[AuthRedis] Redis error checking rotated token jti=%s: %s", jti, exc)
        return False


def validate_refresh_token(user_id: str, jti: str) -> bool:
    """Return ``True`` if the refresh token is still registered in Redis.

    Parameters
    ----------
    user_id:
        The owner of the token.
    jti:
        The JWT ID of the refresh token.

    Returns
    -------
    bool
        ``True`` if the key exists (token is still valid).
    """
    client = _get_auth_redis()
    if client is None:
        logger.warning(
            "[AuthRedis] Redis unavailable — cannot validate refresh token "
            "for user_id=%s.",
            user_id,
        )
        return False
    key = f"{REDIS_REFRESH_PREFIX}:{user_id}:{jti}"
    try:
        return bool(client.exists(key))
    except Exception as exc:
        logger.warning(
            "[AuthRedis] Redis error validating refresh token for user_id=%s: %s",
            user_id,
            exc,
        )
        return False


def revoke_refresh_token(user_id: str, jti: str) -> None:
    """Delete a single refresh-token reference from Redis.

    Parameters
    ----------
    user_id:
        The owner of the token.
    jti:
        The JWT ID of the refresh token to revoke.
    """
    client = _get_auth_redis()
    if client is None:
        logger.warning(
            "[AuthRedis] Redis unavailable — could not revoke refresh token "
            "for user_id=%s.",
            user_id,
        )
        return
    key = f"{REDIS_REFRESH_PREFIX}:{user_id}:{jti}"
    try:
        client.delete(key)
    except Exception as exc:
        logger.warning(
            "[AuthRedis] Redis error revoking refresh token for user_id=%s: %s",
            user_id,
            exc,
        )


def revoke_all_refresh_tokens(user_id: str) -> None:
    """Revoke every refresh token belonging to *user_id*.

    Uses ``SCAN`` to iterate over matching keys without blocking Redis, then
    deletes them all.

    Parameters
    ----------
    user_id:
        The user whose refresh tokens should be revoked.
    """
    client = _get_auth_redis()
    if client is None:
        logger.warning(
            "[AuthRedis] Redis unavailable — could not revoke all refresh tokens "
            "for user_id=%s.",
            user_id,
        )
        return
    pattern = f"{REDIS_REFRESH_PREFIX}:{user_id}:*"
    try:
        cursor = 0
        while True:
            cursor, keys = client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                client.delete(*keys)
            if cursor == 0:
                break
    except Exception as exc:
        logger.warning(
            "[AuthRedis] Redis error revoking all refresh tokens for user_id=%s: %s",
            user_id,
            exc,
        )
