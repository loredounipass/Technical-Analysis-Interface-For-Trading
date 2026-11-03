"""API routes for anonymous chat history and preferences."""

from uuid import UUID

from flask import Blueprint, jsonify, request

from database import chat_store
from services.chat import AVAILABLE_MODELS

chat_sessions_bp = Blueprint("chat_sessions", __name__)
MODEL_KEYS = set(AVAILABLE_MODELS)


def _owner_id():
    try:
        return chat_store.normalize_owner_id(request.headers.get("X-Chat-Owner-ID"))
    except ValueError as error:
        return None, (jsonify({"error": str(error)}), 400)


def _session_id(raw_id):
    try:
        return UUID(raw_id), None
    except (ValueError, TypeError, AttributeError):
        return None, (jsonify({"error": "A valid session ID is required."}), 400)


@chat_sessions_bp.get("/api/chat/state")
def get_chat_state():
    owner_id = _owner_id()
    if isinstance(owner_id, tuple):
        return owner_id[1]
    return jsonify(chat_store.get_state(owner_id))


@chat_sessions_bp.post("/api/chat/state/import")
def import_legacy_state():
    owner_id = _owner_id()
    if isinstance(owner_id, tuple):
        return owner_id[1]
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object body required."}), 400
    imported = chat_store.import_legacy_state(
        owner_id,
        sessions=data.get("sessions", []),
        selected_model=data.get("selected_model"),
        web_search_enabled=data.get("web_search_enabled"),
        model_keys=MODEL_KEYS,
    )
    return jsonify({"imported": imported, **chat_store.get_state(owner_id)})


@chat_sessions_bp.patch("/api/chat/preferences")
def update_chat_preferences():
    owner_id = _owner_id()
    if isinstance(owner_id, tuple):
        return owner_id[1]
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object body required."}), 400
    selected_model = data.get("selected_model")
    web_search_enabled = data.get("web_search_enabled")
    if selected_model is not None and (
        not isinstance(selected_model, str) or selected_model not in MODEL_KEYS
    ):
        return jsonify({"error": "Unknown chat model."}), 400
    if web_search_enabled is not None and not isinstance(web_search_enabled, bool):
        return jsonify({"error": "web_search_enabled must be a boolean."}), 400
    if selected_model is None and web_search_enabled is None:
        return jsonify({"error": "At least one preference is required."}), 400
    chat_store.update_preferences(owner_id, selected_model, web_search_enabled)
    return jsonify(chat_store.get_state(owner_id))


@chat_sessions_bp.post("/api/chat/sessions")
def create_chat_session():
    owner_id = _owner_id()
    if isinstance(owner_id, tuple):
        return owner_id[1]
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object body required."}), 400
    symbol = data.get("symbol", "BTCUSDT")
    market = data.get("market", "crypto")
    interval = data.get("interval", "15m")
    if not isinstance(symbol, str) or not symbol.strip() or len(symbol) > 32:
        return jsonify({"error": "symbol must be a non-empty string of at most 32 characters."}), 400
    if market not in ("crypto", "stock"):
        return jsonify({"error": "market must be crypto or stock."}), 400
    if not isinstance(interval, str) or not interval or len(interval) > 8:
        return jsonify({"error": "interval must be a non-empty string of at most 8 characters."}), 400
    title = data.get("title") or f"{symbol.strip()} Analysis"
    if not isinstance(title, str):
        return jsonify({"error": "title must be a string."}), 400
    initial_message = data.get("initial_message")
    if initial_message is not None and (
        not isinstance(initial_message, dict)
        or initial_message.get("role") != "assistant"
        or not isinstance(initial_message.get("content"), str)
        or len(initial_message["content"]) > 100_000
    ):
        return jsonify({"error": "initial_message must be a valid assistant message."}), 400
    only_if_empty = data.get("only_if_empty", False)
    if not isinstance(only_if_empty, bool):
        return jsonify({"error": "only_if_empty must be a boolean."}), 400
    session_id = chat_store.create_session(
        owner_id,
        title=title[:120],
        symbol=symbol.strip(),
        market=market,
        interval=interval,
        initial_message=initial_message,
        only_if_empty=only_if_empty,
    )
    return jsonify({"id": session_id}), 201


@chat_sessions_bp.post("/api/chat/sessions/<session_id>/messages")
def create_chat_message(session_id):
    owner_id = _owner_id()
    if isinstance(owner_id, tuple):
        return owner_id[1]
    session_uuid, error_response = _session_id(session_id)
    if error_response:
        return error_response
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "JSON object body required."}), 400
    role = data.get("role")
    content = data.get("content")
    if role not in ("user", "assistant") or not isinstance(content, str) or not content:
        return jsonify({"error": "role and non-empty content are required."}), 400
    if len(content) > 100_000:
        return jsonify({"error": "Message content is too long."}), 413
    if not chat_store.add_message(owner_id, session_uuid, data):
        return jsonify({"error": "Chat session not found."}), 404
    return jsonify({"saved": True}), 201


@chat_sessions_bp.patch("/api/chat/sessions/<session_id>/welcome")
def update_chat_welcome(session_id):
    owner_id = _owner_id()
    if isinstance(owner_id, tuple):
        return owner_id[1]
    session_uuid, error_response = _session_id(session_id)
    if error_response:
        return error_response
    message = request.get_json(silent=True)
    if (
        not isinstance(message, dict)
        or message.get("role") != "assistant"
        or not isinstance(message.get("content"), str)
        or not message["content"].startswith("¡Hola!")
    ):
        return jsonify({"error": "A valid welcome message is required."}), 400
    if not chat_store.update_welcome_message(owner_id, session_uuid, message):
        return jsonify({"error": "Welcome message or chat session not found."}), 404
    return jsonify({"saved": True})


@chat_sessions_bp.delete("/api/chat/sessions/<session_id>")
def delete_chat_session(session_id):
    owner_id = _owner_id()
    if isinstance(owner_id, tuple):
        return owner_id[1]
    session_uuid, error_response = _session_id(session_id)
    if error_response:
        return error_response
    if not chat_store.delete_session(owner_id, session_uuid):
        return jsonify({"error": "Chat session not found."}), 404
    return jsonify({"deleted": True})
