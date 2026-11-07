"""JWT authentication guard decorator.

Protects Flask routes by validating the ``Authorization: Bearer <token>``
header.  On success the authenticated user dict is stored in
:data:`flask.g.current_user` so downstream handlers can access it.

Usage
-----
::

    from auth.guards import jwt_required

    @app.route("/api/profile")
    @jwt_required
    def get_profile():
        user = g.current_user
        return {"id": str(user["id"]), "email": user["email"]}

The decorator performs the following checks in order:

1. Extracts the ``Authorization`` header.
2. Verifies it starts with ``"Bearer "``.
3. Decodes and validates the JWT (signature, expiry).
4. Confirms the token type is ``TOKEN_TYPE_ACCESS``.
5. Checks the token's JTI is not blacklisted.
6. Loads the user from the database by the token's ``sub`` claim.
7. Confirms the user exists **and** ``is_active`` is ``True``.
8. Stores the user in ``flask.g.current_user``.

Any failure returns a ``401 Unauthorized`` JSON response.
"""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, TypeVar

from flask import g, jsonify, request

from auth.constants import TOKEN_TYPE_ACCESS
from auth.strategies.jwt_strategy import decode_token, is_blacklisted
from database import user_store

_F = TypeVar("_F", bound=Callable[..., Any])


def jwt_required(fn: _F) -> _F:
    """Decorator that enforces JWT authentication on a Flask route.

    Parameters
    ----------
    fn : callable
        The Flask view function to protect.

    Returns
    -------
    callable
        A wrapper that runs authentication checks before calling *fn*.
        If any check fails, a ``({"error": "..."}, 401)`` tuple is
        returned instead.
    """

    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        # 0. Check if already verified by the global guard
        if getattr(g, "current_user", None) is not None:
            return fn(*args, **kwargs)

        # 1. Extract the Authorization header.
        auth_header: str | None = request.headers.get("Authorization")
        if not auth_header:
            return jsonify({"error": "Missing Authorization header."}), 401

        # 2. Verify the Bearer scheme.
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Invalid Authorization header format."}), 401

        # 3. Extract the raw token string.
        token: str = auth_header[7:]  # len("Bearer ") == 7

        try:
            # 4. Decode and validate the JWT.
            payload: dict = decode_token(token)

            # 5. Ensure this is an access token (not a refresh token).
            if payload.get("type") != TOKEN_TYPE_ACCESS:
                return jsonify({"error": "Invalid token type."}), 401

            # 6. Check whether the JTI has been revoked.
            if is_blacklisted(payload["jti"]):
                return jsonify({"error": "Token has been revoked."}), 401

            # 7. Load the user from the database.
            user: dict | None = user_store.find_by_id(payload["sub"])
            if user is None:
                return jsonify({"error": "User not found."}), 401

            # 8. Verify the account is still active.
            if not user.get("is_active"):
                return jsonify({"error": "Account is deactivated."}), 401

            # 9. Attach the user and token payload to the request context.
            g.current_user = user
            g.jwt_payload = payload

        except ValueError as exc:
            # decode_token raises ValueError for expired / invalid tokens.
            return jsonify({"error": str(exc)}), 401
        except Exception:
            return jsonify({"error": "Authentication failed."}), 401

        # 10. All checks passed — invoke the original handler.
        return fn(*args, **kwargs)

    return wrapper  # type: ignore[return-value]
