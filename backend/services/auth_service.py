"""Authentication service — business-logic orchestrator.

Coordinates user registration, login, token refresh, logout, and profile
retrieval by delegating to the password strategy, JWT strategy, and user
store.  All public functions return plain ``dict`` payloads ready for JSON
serialisation; validation errors are raised as ``ValueError`` so that the
controller layer can map them to the appropriate HTTP status codes.
"""

import logging
import time

from auth.constants import (
    LOGIN_ATTEMPTS_WINDOW,
    MAX_LOGIN_ATTEMPTS,
    REDIS_LOGIN_ATTEMPTS_PREFIX,
    TOKEN_TYPE_REFRESH,
)
from auth.dto import AuthResponseDTO, UserResponseDTO
from auth.strategies import jwt_strategy, password_strategy
from database import user_store

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

def register(dto) -> dict:
    """Register a new user account.

    Parameters
    ----------
    dto : auth.dto.RegisterDTO
        Validated registration payload (email, username, password).

    Returns
    -------
    dict
        ``AuthResponseDTO``-shaped dictionary with user info and token pair.

    Raises
    ------
    ValueError
        If the email is already registered or the username is taken.
    """
    email_lower = dto.email.lower()

    if user_store.email_exists(email_lower):
        raise ValueError("Email already registered.")

    if user_store.username_exists(dto.username):
        raise ValueError("Username already taken.")

    password_hash = password_strategy.hash_password(dto.password)
    user = user_store.create_user(email_lower, dto.username, password_hash)

    tokens = jwt_strategy.generate_token_pair(str(user["id"]))

    logger.info("User registered successfully: %s (%s)", dto.username, email_lower)

    return AuthResponseDTO.from_user_and_tokens(user, tokens).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------

def _login_attempts_key(email: str) -> str:
    """Build the Redis key that tracks failed login attempts for *email*."""
    return f"{REDIS_LOGIN_ATTEMPTS_PREFIX}:{email}"


def _increment_login_attempts(email: str) -> None:
    """Increment the brute-force counter for *email* and set/refresh the TTL."""
    redis = jwt_strategy._get_auth_redis()
    if redis is None:
        return
    try:
        key = _login_attempts_key(email)
        redis.incr(key)
        redis.expire(key, LOGIN_ATTEMPTS_WINDOW)
    except Exception as exc:
        logger.warning("Failed to record login attempt in Redis: %s", exc)


def _clear_login_attempts(email: str) -> None:
    """Delete the brute-force counter after a successful login."""
    redis = jwt_strategy._get_auth_redis()
    if redis is None:
        return
    try:
        redis.delete(_login_attempts_key(email))
    except Exception as exc:
        logger.warning("Failed to clear login attempts in Redis: %s", exc)


def login(dto) -> dict:
    """Authenticate a user with email and password.

    Parameters
    ----------
    dto : auth.dto.LoginDTO
        Validated login payload (email, password).

    Returns
    -------
    dict
        ``AuthResponseDTO``-shaped dictionary with user info and token pair.

    Raises
    ------
    ValueError
        On rate-limiting, invalid credentials, or deactivated account.
    """
    email_lower = dto.email.lower()

    # --- Brute-force protection -------------------------------------------
    redis = jwt_strategy._get_auth_redis()
    if redis is not None:
        try:
            attempts_key = _login_attempts_key(email_lower)
            current_attempts = redis.get(attempts_key)
            if current_attempts is not None and int(current_attempts) >= MAX_LOGIN_ATTEMPTS:
                logger.warning("Login blocked (too many attempts): %s", email_lower)
                raise ValueError("Too many login attempts. Try again later.")
        except ValueError:
            raise
        except Exception as exc:
            logger.warning("Could not check login attempts in Redis: %s", exc)

    # --- Find user --------------------------------------------------------
    user = user_store.find_by_email(email_lower)
    if user is None:
        # Equalize execution time with dummy bcrypt to prevent user enumeration via timing attack
        password_strategy.dummy_verify_password(dto.password)
        _increment_login_attempts(email_lower)
        logger.warning("Login failed (unknown email): %s", email_lower)
        raise ValueError("Invalid email or password.")

    # --- Account status ---------------------------------------------------
    if not user.get("is_active", True):
        logger.warning("Login failed (deactivated account): %s", email_lower)
        raise ValueError("Account is deactivated.")

    # --- Password verification --------------------------------------------
    if not password_strategy.verify_password(dto.password, user["password_hash"]):
        _increment_login_attempts(email_lower)
        logger.warning("Login failed (wrong password): %s", email_lower)
        raise ValueError("Invalid email or password.")

    # --- Success ----------------------------------------------------------
    _clear_login_attempts(email_lower)
    tokens = jwt_strategy.generate_token_pair(str(user["id"]))

    logger.info("User logged in: %s", email_lower)

    return AuthResponseDTO.from_user_and_tokens(user, tokens).model_dump(mode="json")


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

def refresh(refresh_token_str: str) -> dict:
    """Issue a new access/refresh token pair from a valid refresh token.

    The old refresh token is revoked immediately to enforce one-time use
    (rotation).

    Parameters
    ----------
    refresh_token_str : str
        The raw JWT refresh token string.

    Returns
    -------
    dict
        Dictionary with ``access_token``, ``refresh_token``, ``token_type``,
        and ``expires_in``.

    Raises
    ------
    ValueError
        If the token is expired, invalid, not a refresh token, or has been
        revoked.
    """
    # decode_token raises ValueError on expired / invalid tokens
    payload = jwt_strategy.decode_token(refresh_token_str)

    if payload.get("type") != TOKEN_TYPE_REFRESH:
        raise ValueError("Invalid token type.")

    user_id = payload["sub"]
    jti = payload["jti"]

    # 1. Token theft detection: if an already-rotated token is presented, revoke everything
    if jwt_strategy.is_rotated_token(jti):
        logger.critical(
            "[Security] Refresh token reuse detected for user %s (jti=%s). "
            "Suspected token theft! Revoking all sessions.",
            user_id,
            jti,
        )
        jwt_strategy.revoke_all_refresh_tokens(user_id)
        raise ValueError("Security alert: token reuse detected. All sessions terminated.")

    # 2. Check active token validity in Redis
    if not jwt_strategy.validate_refresh_token(user_id, jti):
        raise ValueError("Refresh token has been revoked or expired.")

    # 3. Rotate token: mark old JTI as rotated and revoke from active
    jwt_strategy.revoke_refresh_token(user_id, jti)
    jwt_strategy.record_rotated_token(jti)
    tokens = jwt_strategy.generate_token_pair(user_id)

    logger.info("Tokens refreshed for user %s", user_id)

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "Bearer",
        "expires_in": tokens["expires_in"],
    }


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

def logout(
    user_id: str,
    access_token_jti: str,
    access_token_exp: int,
    refresh_token_str: str | None = None,
    all_devices: bool = False,
) -> dict:
    """Invalidate the caller's tokens.

    The access token is blacklisted for its remaining TTL so that it cannot be
    reused. If a refresh token is provided it is revoked as well. If all_devices
    is True, all active refresh tokens for the user are revoked.

    Parameters
    ----------
    user_id : str
        ID of the authenticated user.
    access_token_jti : str
        ``jti`` claim from the access JWT.
    access_token_exp : int
        ``exp`` claim (Unix epoch) from the access JWT.
    refresh_token_str : str or None
        Optional raw refresh token to revoke.
    all_devices : bool
        If True, revoke all refresh tokens for user across all devices.

    Returns
    -------
    dict
        ``{"message": "Logged out successfully."}``
    """
    remaining_ttl = max(0, access_token_exp - int(time.time()))
    if remaining_ttl > 0:
        jwt_strategy.blacklist_token(access_token_jti, remaining_ttl)

    if all_devices:
        jwt_strategy.revoke_all_refresh_tokens(user_id)
    elif refresh_token_str:
        try:
            refresh_payload = jwt_strategy.decode_token(refresh_token_str)
            jwt_strategy.revoke_refresh_token(
                refresh_payload["sub"],
                refresh_payload["jti"],
            )
        except (ValueError, KeyError):
            # If the refresh token is already expired / invalid we still
            # consider the logout successful — the access token is blacklisted
            # which is the primary goal.
            logger.debug("Refresh token decode failed during logout; ignoring.")

    logger.info("User %s logged out", user_id)

    return {"message": "Logged out successfully."}


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------

def get_profile(user_id: str) -> dict:
    """Return the public profile for the user identified by *user_id*.

    Parameters
    ----------
    user_id : str
        The unique user identifier.

    Returns
    -------
    dict
        ``UserResponseDTO``-shaped dictionary (no sensitive fields).

    Raises
    ------
    ValueError
        If no user is found for the given ID.
    """
    user = user_store.find_by_id(user_id)
    if user is None:
        raise ValueError("User not found.")

    return UserResponseDTO.model_validate(user).model_dump(mode="json")
