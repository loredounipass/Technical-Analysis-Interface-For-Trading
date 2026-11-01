"""Herramienta MCP de memoria: búsqueda en el historial de sesiones pasadas.

Se expone al modelo como `search_chat_history` (ver chat_config.CHAT_TOOLS) y
es despachada por services.chat_tools._run_tool_call.
"""

import datetime
import re
from typing import Optional


def search_chat_history(
    query: str,
    symbol: Optional[str] = None,
    all_sessions: Optional[list] = None,
    current_session_id: Optional[str] = None
) -> dict:
    """Busca en el historial de sesiones pasadas fragmentos relevantes de usuario y asistente."""
    if not all_sessions:
        return {
            "found_records": 0,
            "message": "No se encontraron sesiones previas guardadas en el historial."
        }

    query_tokens = [t.lower() for t in re.split(r'[\s,;.?!]+', query) if len(t) >= 2]
    symbol_clean = symbol.upper().replace("/", "").replace("-", "") if symbol else None

    matches = []

    for session in all_sessions:
        s_id = str(session.get("id", ""))
        s_symbol = str(session.get("symbol", "")).upper().replace("/", "")
        s_messages = session.get("messages", [])

        symbol_matches = bool(symbol_clean and (symbol_clean in s_symbol or s_symbol in symbol_clean))

        for idx, msg in enumerate(s_messages):
            if s_id == str(current_session_id) and idx >= len(s_messages) - 1:
                continue

            content = msg.get("content", "")
            role = msg.get("role", "")
            if not content or role not in ("user", "assistant"):
                continue

            # Omitir saludo generico inicial
            if idx == 0 and role == "assistant" and "¡Hola!" in content:
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
                if token in s_symbol.lower():
                    score += 1.5

            if symbol_matches:
                score += 2

            if score > 0:
                speaker = "Usuario" if role == "user" else "Woody AI"
                clean_content = content.strip().replace("\n", " ")
                snippet = f"[{date_str or 'Sesión previa'}] [{s_symbol or 'General'}] {speaker}: \"{clean_content}\""
                matches.append({
                    "session_id": s_id,
                    "symbol": s_symbol,
                    "score": score,
                    "snippet": snippet
                })

    matches.sort(key=lambda x: x["score"], reverse=True)
    top = matches

    if not top:
        return {
            "found_records": 0,
            "query": query,
            "message": f"Búsqueda finalizada. No se encontraron mensajes relacionados con '{query}' en el historial."
        }

    return {
        "found_records": len(top),
        "query": query,
        "results": [m["snippet"] for m in top]
    }
