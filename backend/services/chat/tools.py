"""Dispatch de tool-calls del agente.

Recibe el nombre de función y sus argumentos emitidos por el modelo, ejecuta la
herramienta correspondiente (memoria o búsqueda web) y devuelve una tupla
(resultado_para_el_modelo, meta_de_telemetria).
"""

from services.chat.memory import search_chat_history
from services.chat.web_search import web_search
from database import chat_store


def _run_tool_call(fn_name, args, *, prompt, owner_id, current_session_id):
    """Ejecuta una tool-call del modelo. Devuelve (resultado_para_el_modelo, meta_de_telemetria)."""
    args = args if isinstance(args, dict) else {}
    if fn_name == "search_chat_history":
        query = args.get("query", prompt)
        sym = args.get("symbol")
        requested_session_id = args.get("session_id")
        session_name = args.get("session_name")
        result = search_chat_history(
            query=query, symbol=sym,
            session_id=requested_session_id,
            session_name=session_name,
            owner_id=owner_id,
        )
        meta = {"tool": "search_chat_history", "query": query, "symbol": sym,
                "session_id": requested_session_id,
                "session_name": session_name,
                "found": result.get("found_records", 0)}
    elif fn_name == "rename_chat_session":
        title = args.get("title")
        if not isinstance(title, str) or not title.strip():
            result = {"renamed": False, "error": "A non-empty session title is required."}
        elif not chat_store.update_session_title(owner_id, current_session_id, title.strip()):
            result = {"renamed": False, "error": "Current chat session was not found."}
        else:
            result = {"renamed": True, "session_id": str(current_session_id), "title": title.strip()}
        meta = {
            "tool": "rename_chat_session",
            "session_id": str(current_session_id),
            "title": result.get("title"),
            "renamed": result.get("renamed", False),
        }
    elif fn_name == "web_search":
        query = args.get("query", prompt)
        result = web_search(
            query=query, max_results=args.get("max_results", 6), time_range=args.get("time_range"),
            source=args.get("source"),
        )
        meta = {"tool": "web_search", "query": query, "source": args.get("source") or "all",
                "found": result.get("count", 0), "results": result.get("results", []),
                "provider": result.get("provider"), "widened": bool(result.get("widened"))}
    else:
        result = {"error": f"herramienta desconocida: {fn_name}"}
        meta = {"tool": fn_name, "found": 0}
    return result, meta
