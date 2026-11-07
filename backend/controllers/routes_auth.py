"""Authentication routes — /api/auth/*

Exposes endpoints for user registration, login, token refresh, logout,
and profile retrieval. Follows the NestJS controller pattern with DTO
validation, route-level guards, and modular separation of concerns.
"""

import logging
from flask import Blueprint, jsonify, request, g
from pydantic import ValidationError

from auth.guards import jwt_required, public
from auth.dto import RegisterDTO, LoginDTO, RefreshTokenDTO
from auth.strategies import jwt_strategy
from common.cache import rate_limited
from services import auth_service

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)


def _format_validation_error(error: ValidationError) -> dict:
    """Format Pydantic ValidationError into a clean client-friendly error response."""
    formatted_errors = []
    for err in error.errors():
        field = ".".join(str(loc) for loc in err["loc"])
        formatted_errors.append({
            "field": field,
            "message": err["msg"]
        })
    return {
        "error": "Validation failed.",
        "details": formatted_errors
    }


# ─── POST /api/auth/register ─────────────────────────────────────────
@auth_bp.post("/api/auth/register")
@public
def register():
    """Register a new user account.

    Request Body:
        email (str): Valid email address
        username (str): 3-30 chars, alphanumeric, underscores, hyphens
        password (str): 8-72 chars, uppercase, lowercase, digit, and symbol

    Returns:
        201: AuthResponseDTO with user data and JWT token pair
        400: Validation error
        409: Email or username already exists
        429: Rate limited
    """
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object body is required."}), 400

    try:
        dto = RegisterDTO(**data)
    except ValidationError as error:
        return jsonify(_format_validation_error(error)), 400

    try:
        response = auth_service.register(dto)
        return jsonify(response), 201
    except ValueError as error:
        error_msg = str(error)
        logger.warning("[Auth] Registration rejected: %s", error_msg)
        return jsonify({"error": error_msg}), 409
    except Exception as error:
        logger.exception("[Auth] Unexpected error during registration")
        return jsonify({"error": "Failed to register user."}), 500


# ─── POST /api/auth/login ────────────────────────────────────────────
@auth_bp.post("/api/auth/login")
@public
def login():
    """Authenticate a user and return access + refresh tokens.

    Request Body:
        email (str): Registered email address
        password (str): User password

    Returns:
        200: AuthResponseDTO with user data and JWT token pair
        400: Validation error
        401: Invalid credentials
        403: Account deactivated
        429: Too many login attempts or rate limited
    """
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object body is required."}), 400

    try:
        dto = LoginDTO(**data)
    except ValidationError as error:
        return jsonify(_format_validation_error(error)), 400

    try:
        response = auth_service.login(dto)
        return jsonify(response), 200
    except ValueError as error:
        error_msg = str(error)
        if "Too many login attempts" in error_msg:
            return jsonify({"error": error_msg}), 429
        if "deactivated" in error_msg.lower():
            return jsonify({"error": error_msg}), 403
        return jsonify({"error": error_msg}), 401
    except Exception as error:
        logger.exception("[Auth] Unexpected error during login")
        return jsonify({"error": "Authentication failed."}), 500


# ─── POST /api/auth/refresh ──────────────────────────────────────────
@auth_bp.post("/api/auth/refresh")
@public
def refresh():
    """Issue a new token pair using a valid refresh token.

    Request Body:
        refresh_token (str): JWT refresh token

    Returns:
        200: New access and rotated refresh token
        400: Validation error
        401: Invalid, expired, or revoked refresh token
        429: Rate limited
    """
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({"error": "Too many requests. Please slow down."}), 429

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object body is required."}), 400

    try:
        dto = RefreshTokenDTO(**data)
    except ValidationError as error:
        return jsonify(_format_validation_error(error)), 400

    try:
        response = auth_service.refresh(dto.refresh_token)
        return jsonify(response), 200
    except ValueError as error:
        logger.warning("[Auth] Token refresh failed: %s", error)
        return jsonify({"error": str(error)}), 401
    except Exception as error:
        logger.exception("[Auth] Unexpected error during token refresh")
        return jsonify({"error": "Failed to refresh token."}), 500


# ─── POST /api/auth/logout ───────────────────────────────────────────
@auth_bp.post("/api/auth/logout")
@jwt_required
def logout():
    """Invalidate current access token (blacklist) and refresh token.

    Headers:
        Authorization: Bearer <access_token>

    Request Body (optional):
        refresh_token (str): Refresh token to revoke

    Returns:
        200: Logout confirmation message
    """
    user = getattr(g, "current_user", None)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    payload = getattr(g, "jwt_payload", None)
    if not payload:
        auth_header = request.headers.get("Authorization", "")
        token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
        try:
            payload = jwt_strategy.decode_token(token)
        except Exception:
            return jsonify({"message": "Logged out successfully."}), 200

    data = request.get_json(silent=True) or {}
    refresh_token_str = data.get("refresh_token") if isinstance(data, dict) else None
    all_devices = bool(data.get("all_devices", False)) if isinstance(data, dict) else False

    result = auth_service.logout(
        user_id=str(user["id"]),
        access_token_jti=payload.get("jti", ""),
        access_token_exp=payload.get("exp", 0),
        refresh_token_str=refresh_token_str,
        all_devices=all_devices,
    )
    return jsonify(result), 200


# ─── GET /api/auth/profile ───────────────────────────────────────────
@auth_bp.get("/api/auth/profile")
@jwt_required
def get_profile():
    """Return the profile of the currently authenticated user.

    Headers:
        Authorization: Bearer <access_token>

    Returns:
        200: User profile (id, email, username, is_active, created_at)
    """
    user = getattr(g, "current_user", None)
    if not user:
        return jsonify({"error": "Unauthorized"}), 401

    try:
        profile = auth_service.get_profile(str(user["id"]))
        return jsonify(profile), 200
    except ValueError as error:
        return jsonify({"error": str(error)}), 404
    except Exception as error:
        logger.exception("[Auth] Failed to load profile")
        return jsonify({"error": "Failed to load user profile."}), 500

