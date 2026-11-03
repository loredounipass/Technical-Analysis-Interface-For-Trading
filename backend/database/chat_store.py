"""PostgreSQL persistence for anonymous chat sessions."""

import json
import os
import time
from pathlib import Path
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def normalize_owner_id(value):
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError("A valid X-Chat-Owner-ID UUID is required.") from error


def get_connection():
    return psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "trading"),
        user=os.getenv("POSTGRES_USER", "trading"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
        row_factory=dict_row,
    )


def initialize_database():
    with get_connection() as connection:
        schema = SCHEMA_PATH.read_text(encoding="utf-8")
        for statement in schema.split(";"):
            if statement.strip():
                connection.execute(statement)


def _ensure_preferences(cursor, owner_id):
    cursor.execute(
        """
        INSERT INTO chat_preferences (owner_id)
        VALUES (%s)
        ON CONFLICT (owner_id) DO NOTHING
        """,
        (owner_id,),
    )


def get_state(owner_id):
    with get_connection() as connection, connection.cursor() as cursor:
        _ensure_preferences(cursor, owner_id)
        cursor.execute(
            """
            SELECT selected_model, web_search_enabled
            FROM chat_preferences
            WHERE owner_id = %s
            """,
            (owner_id,),
        )
        preferences = cursor.fetchone()
        cursor.execute(
            """
            SELECT id, title, symbol, market, interval, created_at, updated_at
            FROM chat_sessions
            WHERE owner_id = %s
            ORDER BY updated_at DESC, created_at DESC
            """,
            (owner_id,),
        )
        sessions = cursor.fetchall()
        if sessions:
            cursor.execute(
                """
                SELECT m.session_id, m.role, m.content, m.timestamp, m.metadata
                FROM chat_messages AS m
                JOIN chat_sessions AS s ON s.id = m.session_id
                WHERE s.owner_id = %s
                ORDER BY m.timestamp, m.id
                """,
                (owner_id,),
            )
            messages_by_session = {str(session["id"]): [] for session in sessions}
            for row in cursor.fetchall():
                message = {
                    "role": row["role"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    **row["metadata"],
                }
                messages_by_session[str(row["session_id"])].append(message)

            for session in sessions:
                session["id"] = str(session["id"])
                session["timestamp"] = int(session["created_at"].timestamp() * 1000)
                session["messages"] = messages_by_session[session["id"]]
                del session["created_at"]
                del session["updated_at"]

        return {
            "selected_model": preferences["selected_model"],
            "web_search_enabled": preferences["web_search_enabled"],
            "sessions": sessions,
        }


def get_memory_sessions(owner_id):
    """Fetch this browser owner's chat history directly from PostgreSQL."""
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT s.id, s.title, s.symbol, m.id AS message_id,
                   m.role, m.content, m.timestamp, m.metadata
            FROM chat_sessions AS s
            JOIN chat_messages AS m ON m.session_id = s.id
            WHERE s.owner_id = %s
            ORDER BY s.updated_at DESC, m.timestamp, m.id
            """,
            (owner_id,),
        )
        sessions = {}
        for row in cursor.fetchall():
            session_id = str(row["id"])
            session = sessions.setdefault(
                session_id,
                {
                    "id": session_id,
                    "title": row["title"],
                    "symbol": row["symbol"],
                    "messages": [],
                },
            )
            session["messages"].append({
                "message_id": row["message_id"],
                "role": row["role"],
                "content": row["content"],
                "timestamp": row["timestamp"],
                **row["metadata"],
            })
        return list(sessions.values())


def update_session_title(owner_id, session_id, title):
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE chat_sessions
            SET title = %s, updated_at = NOW()
            WHERE id = %s AND owner_id = %s
            """,
            (title, session_id, owner_id),
        )
        return cursor.rowcount > 0


def update_preferences(owner_id, selected_model=None, web_search_enabled=None):
    with get_connection() as connection, connection.cursor() as cursor:
        _ensure_preferences(cursor, owner_id)
        if selected_model is not None:
            cursor.execute(
                """
                UPDATE chat_preferences
                SET selected_model = %s, updated_at = NOW()
                WHERE owner_id = %s
                """,
                (selected_model, owner_id),
            )
        if web_search_enabled is not None:
            cursor.execute(
                """
                UPDATE chat_preferences
                SET web_search_enabled = %s, updated_at = NOW()
                WHERE owner_id = %s
                """,
                (web_search_enabled, owner_id),
            )


def _insert_message(cursor, session_id, message):
    role = message.get("role")
    content = message.get("content")
    if role not in ("user", "assistant") or not isinstance(content, str):
        return
    metadata = {
        key: value
        for key, value in message.items()
        if key not in ("role", "content", "timestamp")
    }
    timestamp = message.get("timestamp")
    if not isinstance(timestamp, int):
        timestamp = time.time_ns() // 1_000_000
    cursor.execute(
        """
        INSERT INTO chat_messages (session_id, role, content, timestamp, metadata)
        VALUES (%s, %s, %s, %s, %s::jsonb)
        """,
        (session_id, role, content, timestamp, json.dumps(metadata)),
    )


def create_session(
    owner_id,
    *,
    title,
    symbol,
    market,
    interval,
    initial_message=None,
    only_if_empty=False,
):
    with get_connection() as connection, connection.cursor() as cursor:
        if only_if_empty:
            _ensure_preferences(cursor, owner_id)
            cursor.execute(
                "SELECT owner_id FROM chat_preferences WHERE owner_id = %s FOR UPDATE",
                (owner_id,),
            )
            cursor.execute(
                """
                SELECT id FROM chat_sessions
                WHERE owner_id = %s
                ORDER BY updated_at DESC, created_at DESC
                LIMIT 1
                """,
                (owner_id,),
            )
            existing_session = cursor.fetchone()
            if existing_session:
                return str(existing_session["id"])

        session_id = uuid4()
        cursor.execute(
            """
            INSERT INTO chat_sessions (id, owner_id, title, symbol, market, interval)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (session_id, owner_id, title, symbol, market, interval),
        )
        if isinstance(initial_message, dict):
            _insert_message(cursor, session_id, initial_message)
    return str(session_id)


def add_message(owner_id, session_id, message):
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id FROM chat_sessions
            WHERE id = %s AND owner_id = %s
            FOR UPDATE
            """,
            (session_id, owner_id),
        )
        if cursor.fetchone() is None:
            return False
        _insert_message(cursor, session_id, message)
        cursor.execute(
            "UPDATE chat_sessions SET updated_at = NOW() WHERE id = %s",
            (session_id,),
        )
        return True


def delete_session(owner_id, session_id):
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            "DELETE FROM chat_sessions WHERE id = %s AND owner_id = %s",
            (session_id, owner_id),
        )
        return cursor.rowcount > 0


def update_welcome_message(owner_id, session_id, message):
    metadata = {
        key: value
        for key, value in message.items()
        if key not in ("role", "content", "timestamp")
    }
    timestamp = message.get("timestamp")
    if not isinstance(timestamp, int):
        timestamp = time.time_ns() // 1_000_000
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            UPDATE chat_messages
            SET content = %s, timestamp = %s, metadata = %s::jsonb
            WHERE id = (
                SELECT m.id
                FROM chat_messages AS m
                JOIN chat_sessions AS s ON s.id = m.session_id
                WHERE s.id = %s AND s.owner_id = %s
                  AND m.role = 'assistant'
                  AND left(m.content, 6) = '¡Hola!'
                ORDER BY m.timestamp, m.id
                LIMIT 1
            )
            """,
            (
                message.get("content", ""),
                timestamp,
                json.dumps(metadata),
                session_id,
                owner_id,
            ),
        )
        return cursor.rowcount > 0


def import_legacy_state(owner_id, *, sessions, selected_model, web_search_enabled, model_keys):
    with get_connection() as connection, connection.cursor() as cursor:
        _ensure_preferences(cursor, owner_id)
        cursor.execute(
            "SELECT legacy_imported FROM chat_preferences WHERE owner_id = %s FOR UPDATE",
            (owner_id,),
        )
        if cursor.fetchone()["legacy_imported"]:
            return False

        cursor.execute(
            "SELECT EXISTS(SELECT 1 FROM chat_sessions WHERE owner_id = %s) AS has_sessions",
            (owner_id,),
        )
        if not cursor.fetchone()["has_sessions"] and isinstance(sessions, list):
            for legacy_session in sessions[:100]:
                if not isinstance(legacy_session, dict):
                    continue
                session_id = uuid4()
                title = str(legacy_session.get("title") or "Análisis")[:120]
                symbol = str(legacy_session.get("symbol") or "BTCUSDT")[:32]
                market = legacy_session.get("market")
                if market not in ("crypto", "stock"):
                    market = "crypto"
                interval = legacy_session.get("interval")
                if not isinstance(interval, str) or not interval or len(interval) > 8:
                    interval = "15m"
                cursor.execute(
                    """
                    INSERT INTO chat_sessions (id, owner_id, title, symbol, market, interval)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (session_id, owner_id, title, symbol, market, interval),
                )
                messages = legacy_session.get("messages")
                if isinstance(messages, list):
                    for message in messages[:500]:
                        if isinstance(message, dict):
                            _insert_message(cursor, session_id, message)

        if isinstance(selected_model, str) and selected_model in model_keys:
            cursor.execute(
                "UPDATE chat_preferences SET selected_model = %s WHERE owner_id = %s",
                (selected_model, owner_id),
            )
        if isinstance(web_search_enabled, bool):
            cursor.execute(
                "UPDATE chat_preferences SET web_search_enabled = %s WHERE owner_id = %s",
                (web_search_enabled, owner_id),
            )
        cursor.execute(
            "UPDATE chat_preferences SET legacy_imported = TRUE WHERE owner_id = %s",
            (owner_id,),
        )
        return True
