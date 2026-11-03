"""Herramienta MCP de memoria: búsqueda en el historial de sesiones pasadas.

Se expone al modelo como `search_chat_history` (ver chat/config.CHAT_TOOLS) y
es despachada por services.chat.tools._run_tool_call.
"""

import datetime
import re
from typing import Optional

from database import chat_store


def search_chat_history(
    query: str,
    symbol: Optional[str] = None,
    session_id: Optional[str] = None,
    session_name: Optional[str] = None,
    owner_id=None,
) -> dict:
    """Busca en el historial de sesiones pasadas fragmentos relevantes de usuario y asistente."""
    if not isinstance(query, str) or not query.strip():
        return {
            "found_records": 0,
            "message": "La búsqueda requiere un texto no vacío."
        }
    if session_id is not None and not isinstance(session_id, str):
        return {
            "found_records": 0,
            "message": "El ID de sesión debe ser texto."
        }
    if session_name is not None and not isinstance(session_name, str):
        return {
            "found_records": 0,
            "message": "El nombre de sesión debe ser texto."
        }
    if symbol is not None and not isinstance(symbol, str):
        return {
            "found_records": 0,
            "message": "El símbolo debe ser texto."
        }

    if owner_id is None:
        return {
            "found_records": 0,
            "message": "No se pudo identificar al propietario del historial guardado."
        }

    all_sessions = chat_store.get_memory_sessions(owner_id)
    if not all_sessions:
        return {
            "found_records": 0,
            "message": "No se encontraron sesiones previas guardadas en el historial."
        }

    query_tokens = [t.lower() for t in re.split(r'[\s,;.?!]+', query) if t]
    symbol_clean = symbol.upper().replace("/", "").replace("-", "") if symbol else None

    matches = []

    for session in all_sessions:
        s_id = str(session.get("id", ""))
        s_title = str(session.get("title", ""))
        s_symbol = str(session.get("symbol", "")).upper().replace("/", "")
        s_messages = session.get("messages", [])

        if session_id and s_id != str(session_id):
            continue
        if session_name and session_name.casefold() not in s_title.casefold():
            continue
        symbol_matches = bool(symbol_clean and (symbol_clean in s_symbol or s_symbol in symbol_clean))
        if symbol_clean and not symbol_matches:
            continue

        for msg in s_messages:
            content = msg.get("content", "")
            role = msg.get("role", "")
            if not content or role not in ("user", "assistant"):
                continue

            ts = msg.get("timestamp")
            date_str = ""
            if ts:
                try:
                    date_str = datetime.datetime.fromtimestamp(ts / 1000.0).strftime("%Y-%m-%d %H:%M")
                except Exception:
                    date_str = ""

            content_lower = content.lower()
            score = 0
            for token in query_tokens:
                if token in content_lower:
                    score += 1

            if query.strip() and query.casefold() in content_lower:
                score += len(query_tokens) + 1

            if score > 0:
                matches.append({
                    "message_id": msg.get("message_id"),
                    "session_id": s_id,
                    "session_name": s_title,
                    "symbol": s_symbol,
                    "role": role,
                    "timestamp": ts,
                    "date": date_str or None,
                    "content": content,
                    "score": score,
                })

    matches.sort(key=lambda x: x["score"], reverse=True)

    if not matches:
        return {
            "found_records": 0,
            "query": query,
            "session_id": session_id,
            "session_name": session_name,
            "message": f"No se encontraron mensajes relacionados con '{query}' en el historial."
        }

    return {
        "found_records": len(matches),
        "query": query,
        "session_id": session_id,
        "session_name": session_name,
        "results": matches,
    }
