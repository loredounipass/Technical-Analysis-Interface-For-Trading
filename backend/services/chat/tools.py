"""Dispatch de tool-calls del agente.

Recibe el nombre de función y sus argumentos emitidos por el modelo, ejecuta la
herramienta correspondiente (memoria o búsqueda web) y devuelve una tupla
(resultado_para_el_modelo, meta_de_telemetria).
"""

import logging

from services.chat.memory import search_chat_history
from services.chat.web_search import web_search
from database import chat_store

logger = logging.getLogger(__name__)

# Fuente autoritativa del feed (se inyecta desde app.py con la funcion de cache).
# Sin ella la tool era un mero espejo del snapshot del request: si el snapshot
# venia vacio o sin 'provider', reportaba "sin datos" aunque el exchange
# estuviera respondiendo, y el agente retractaba un analisis correcto.
_market_data_source = None


def set_market_data_source(fetch_fn):
    """Inyecta fetch_fn(symbol, interval, market, provider=...) -> payload."""
    global _market_data_source
    _market_data_source = fetch_fn


def _resolve_feed_snapshot(data):
    """Devuelve (data, provider, available) consultando el feed cuando el
    snapshot del request no lo trae. La tool es la fuente de verdad."""
    market = data.get("market", "crypto")
    provider = "yahoo" if market == "stock" else data.get("provider")
    available = (
        provider in ("binance", "coinbase", "yahoo")
        and data.get("precio") is not None
    )
    if available or _market_data_source is None or not data.get("symbol"):
        return data, provider, available

    try:
        fetched = _market_data_source(
            data["symbol"],
            data.get("timeframe") or "15m",
            market,
            provider=provider if provider in ("binance", "coinbase", "yahoo") else (
                "yahoo" if market == "stock" else "coinbase"
            ),
        )
    except Exception as error:
        logger.warning(
            f"[Chat] Feed propio de la tool fallo para {data.get('symbol')}: {error}"
        )
        return data, provider, False

    if not isinstance(fetched, dict) or fetched.get("precio") is None:
        return data, provider, False

    # El feed prevalece; la identidad del request (symbol/timeframe/market)
    # del snapshot original no se pisa con el payload del exchange.
    data = {**fetched, **{k: v for k, v in data.items() if v is not None}}
    market = data.get("market", "crypto")
    provider = "yahoo" if market == "stock" else data.get("provider")
    return data, provider, provider in ("binance", "coinbase", "yahoo")


def run_tool_call(
    fn_name, args, *, prompt, owner_id, current_session_id, indicator_data=None
):
    """Ejecuta una tool-call del modelo. Devuelve (resultado_para_el_modelo, meta_de_telemetria)."""
    args = args if isinstance(args, dict) else {}
    if fn_name == "get_selected_market_data":
        data = indicator_data if isinstance(indicator_data, dict) else {}
        data, selected_provider, available = _resolve_feed_snapshot(data)
        market = data.get("market", "crypto")
        history = data.get("history")
        times = history.get("times") if isinstance(history, dict) else None
        order_flow = data.get("orderFlow")
        order_flow_provider = (
            order_flow.get("provider")
            if isinstance(order_flow, dict)
            else None
        )
        order_flow_matches_provider = (
            order_flow_provider == selected_provider
            if order_flow_provider
            else False
        )
        result = {
            "available": available,
            "source": "backend_selected_market_feed",
            "provider": selected_provider,
            "symbol": data.get("symbol"),
            "market": market,
            "timeframe": data.get("timeframe"),
            "price": data.get("precio"),
            "volume_24h": data.get("volumen"),
            "candle_volume": data.get("volCandle"),
            "best_bid": data.get("bestBid"),
            "best_ask": data.get("bestAsk"),
            "order_book_source": data.get("orderBookSource"),
            "order_flow": order_flow if order_flow_matches_provider else None,
            "order_flow_provider": order_flow_provider,
            "order_flow_matches_selected_provider": order_flow_matches_provider,
            "rsi": data.get("rsi"),
            "macd_histogram": data.get("macdHistogram"),
            "adx": data.get("adx"),
            "data_timestamp": times[-1] if isinstance(times, list) and times else None,
        }
        if not available:
            result["message"] = (
                "El backend no tiene un precio disponible en el feed seleccionado "
                "para esta solicitud. No inventes valores de mercado."
            )
        meta = {
            "tool": "get_selected_market_data",
            "provider": selected_provider,
            "symbol": data.get("symbol"),
            "available": available,
        }
    elif fn_name == "search_chat_history":
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
