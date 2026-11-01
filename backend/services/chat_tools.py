"""Dispatch de tool-calls del agente.

Recibe el nombre de función y sus argumentos emitidos por el modelo, ejecuta la
herramienta correspondiente (memoria o búsqueda web) y devuelve una tupla
(resultado_para_el_modelo, meta_de_telemetria).
"""

from services.chat_memory import search_chat_history
from services.web_search import web_search


def _run_tool_call(fn_name, args, *, prompt, all_sessions, current_session_id):
    """Ejecuta una tool-call del modelo. Devuelve (resultado_para_el_modelo, meta_de_telemetria)."""
    args = args if isinstance(args, dict) else {}
    if fn_name == "search_chat_history":
        query = args.get("query", prompt)
        sym = args.get("symbol")
        result = search_chat_history(
            query=query, symbol=sym,
            all_sessions=all_sessions, current_session_id=current_session_id,
        )
        meta = {"tool": "search_chat_history", "query": query, "symbol": sym,
                "found": result.get("found_records", 0)}
    elif fn_name == "web_search":
        query = args.get("query", prompt)
        result = web_search(
            query=query, max_results=args.get("max_results", 6), time_range=args.get("time_range"),
            source=args.get("source"),
        )
        meta = {"tool": "web_search", "query": query, "source": args.get("source") or "all",
                "found": result.get("count", 0), "results": result.get("results", [])}
    else:
        result = {"error": f"herramienta desconocida: {fn_name}"}
        meta = {"tool": fn_name, "found": 0}
    return result, meta
