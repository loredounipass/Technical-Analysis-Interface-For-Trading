"""PostgreSQL persistence for user accounts.

Follows the same connection pattern established by ``database.chat_store``:
one short-lived ``psycopg`` connection per operation, ``dict_row`` factory,
and explicit SQL statements.
"""

from uuid import UUID

from psycopg.errors import IntegrityError, UniqueViolation
from database.chat_store import get_connection


# ── Helpers ──────────────────────────────────────────────────────────────────


def _normalize_user_id(value):
    """Coerce *value* to a ``UUID``, raising ``ValueError`` on failure."""
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError("A valid user ID (UUID) is required.") from error


# ── Create ───────────────────────────────────────────────────────────────────


def create_user(email: str, username: str, password_hash: str) -> dict:
    """Insert a new user row and return the created record.

    Parameters
    ----------
    email:
        The user's email address.
    username:
        The chosen username.
    password_hash:
        The bcrypt hash of the user's password.

    Returns
    -------
    dict
        The newly created user with keys ``id``, ``email``, ``username``,
        ``is_active``, ``created_at``, and ``updated_at``.
    """
    try:
        with get_connection() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO users (email, username, password_hash)
                VALUES (%s, %s, %s)
                RETURNING id, email, username, is_active, created_at, updated_at
                """,
                (email, username, password_hash),
            )
            return cursor.fetchone()
    except (UniqueViolation, IntegrityError) as exc:
        err_msg = str(exc).lower()
        if "email" in err_msg:
            raise ValueError("Email already registered.") from exc
        if "username" in err_msg:
            raise ValueError("Username already taken.") from exc
        raise ValueError("User with this email or username already exists.") from exc


# ── Read ─────────────────────────────────────────────────────────────────────


def find_by_email(email: str) -> dict | None:
    """Find a user by email address (case-insensitive).

    The returned dict **includes** ``password_hash`` so the caller can
    verify credentials.

    Parameters
    ----------
    email:
        The email address to look up.

    Returns
    -------
    dict | None
        The user record, or ``None`` if not found.
    """
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, email, username, password_hash, is_active,
                   created_at, updated_at
            FROM users
            WHERE lower(email) = lower(%s)
            """,
            (email,),
        )
        return cursor.fetchone()


def find_by_id(user_id) -> dict | None:
    """Find a user by primary key.

    The returned dict does **not** include ``password_hash``.

    Parameters
    ----------
    user_id:
        The UUID (or string representation) of the user.

    Returns
    -------
    dict | None
        The user record, or ``None`` if not found.
    """
    uid = _normalize_user_id(user_id)
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, email, username, is_active, created_at, updated_at
            FROM users
            WHERE id = %s
            """,
            (uid,),
        )
        return cursor.fetchone()


def find_by_username(username: str) -> dict | None:
    """Find a user by username (case-insensitive).

    The returned dict **includes** ``password_hash`` so the caller can
    verify credentials.

    Parameters
    ----------
    username:
        The username to look up.

    Returns
    -------
    dict | None
        The user record, or ``None`` if not found.
    """
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, email, username, password_hash, is_active,
                   created_at, updated_at
            FROM users
            WHERE lower(username) = lower(%s)
            """,
            (username,),
        )
        return cursor.fetchone()


# ── Existence checks ────────────────────────────────────────────────────────


def email_exists(email: str) -> bool:
    """Return ``True`` if a user with the given email already exists.

    Parameters
    ----------
    email:
        The email address to check (case-insensitive).
    """
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower(%s))",
            (email,),
        )
        return cursor.fetchone()["exists"]


def username_exists(username: str) -> bool:
    """Return ``True`` if a user with the given username already exists.

    Parameters
    ----------
    username:
        The username to check (case-insensitive).
    """
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            "SELECT EXISTS(SELECT 1 FROM users WHERE lower(username) = lower(%s))",
            (username,),
        )
        return cursor.fetchone()["exists"]


# ── Update ───────────────────────────────────────────────────────────────────

_ALLOWED_UPDATE_FIELDS = {"email", "username", "is_active"}


def update_user(user_id, **fields) -> dict | None:
    """Update one or more fields on the user record.

    Only the fields ``email``, ``username``, and ``is_active`` may be
    updated.  ``updated_at`` is always set to ``NOW()``.

    Parameters
    ----------
    user_id:
        The UUID (or string representation) of the user to update.
    **fields:
        Keyword arguments whose keys must be in the allowed set.

    Returns
    -------
    dict | None
        The updated user (without ``password_hash``), or ``None`` if the
        user was not found.

    Raises
    ------
    ValueError
        If no valid fields are provided or a field name is not allowed.
    """
    uid = _normalize_user_id(user_id)

    invalid = set(fields) - _ALLOWED_UPDATE_FIELDS
    if invalid:
        raise ValueError(f"Cannot update field(s): {', '.join(sorted(invalid))}")

    if not fields:
        raise ValueError("No fields provided for update.")

    set_clauses = []
    params = []
    for column, value in fields.items():
        set_clauses.append(f"{column} = %s")
        params.append(value)
    set_clauses.append("updated_at = NOW()")
    params.append(uid)

    query = (
        f"UPDATE users SET {', '.join(set_clauses)} "
        f"WHERE id = %s "
        f"RETURNING id, email, username, is_active, created_at, updated_at"
    )

    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(query, tuple(params))
        return cursor.fetchone()
