"""Cliente de streaming SSE del agente NVIDIA (`nvidia_chat_stream`).

Emite eventos en tiempo real (type: thought / content / tool / done / error)
mientras el modelo razona y responde. Comparte con `nvidia_chat` el armado del
request via services.chat.context.resolve_request_context (aqui con
streaming=True). Los dos fallos de preparacion (NO_API_KEY / UNKNOWN_MODEL) se
convierten en un evento de error, igual que antes.

MAX_CONTINUATIONS: en razonadores, finish_reason='length' corta el informe; se
re-invoca hasta completarlo sin repetir. empty_rounds evita el bucle inoperante
cuando una ronda gasta todo el presupuesto en 'thinking'.
"""

import json
import logging
from urllib.request import Request, urlopen

from services.chat.config import NvidiaChatError
from services.chat.context import resolve_request_context
from services.chat.tools import run_tool_call

logger = logging.getLogger(__name__)

# Maximo de rondas de tool-calling y de continuaciones por longitud.
MAX_TOOL_ROUNDS = 5
MAX_CONTINUATIONS = 6


def _iter_chunks(resp):
    """Rinde cada chunk JSON de una respuesta SSE, saltando lineas vacias,
    el centinela [DONE], las que no empiezan con 'data: ' y las que no son JSON
    valido (comportamiento identical al try/except pass de los loops originales).
    """
    for raw_line in resp:
        line = raw_line.decode("utf-8").strip()
        if not line or line == "data: [DONE]":
            continue
        if not line.startswith("data: "):
            continue
        try:
            yield json.loads(line[6:])
        except Exception:
            pass


def nvidia_chat_stream(
    prompt: str,
    model_key: str = "nvidia-nemotron",
    temperature: float | None = None,
    max_tokens: int | None = None,
    history: list | None = None,
    global_context: str | None = None,
    indicator_data: dict | None = None,
    intent: str = "analysis",
    owner_id=None,
    current_session_id: str | None = None,
    web_search_enabled: bool = False,
):
    """Generates real-time SSE events for model reasoning (thoughts) and response content."""
    try:
        ctx = resolve_request_context(
            prompt, model_key, temperature, max_tokens, history,
            global_context, indicator_data, intent, web_search_enabled, streaming=True,
        )
    except NvidiaChatError as e:
        yield {"type": "error", "error": str(e), "error_code": e.code}
        return

    model_id = ctx["model_id"]
    model_name = ctx["model_name"]
    timeout = ctx["timeout"]
    sampling = ctx["sampling"]
    effective_max_tokens = ctx["effective_max_tokens"]
    url = ctx["url"]
    headers = ctx["headers"]
    request_tools = ctx["request_tools"]
    required_initial_tool = ctx["required_initial_tool"]
    initial_messages = ctx["initial_messages"]

    messages = list(initial_messages)
    tools_used = []
    answered = False

    try:
        for round_index in range(MAX_TOOL_ROUNDS):
            tool_choice = "auto"
            if round_index == 0 and required_initial_tool:
                tool_choice = {
                    "type": "function",
                    "function": {"name": required_initial_tool},
                }
            payload_dict = {
                "model": model_id,
                "messages": messages,
                **sampling,
                "max_tokens": effective_max_tokens,
                # `tools` en TODAS las rondas: si desaparece, el modelo emite el
                # tool_call como texto (XML) y se filtra al usuario.
                "tools": request_tools,
                "tool_choice": tool_choice,
                "stream": True,
            }
            req = Request(url, data=json.dumps(payload_dict).encode("utf-8"), headers=headers, method="POST")

            tool_calls_acc = []
            round_content = []
            finish_reason = None
            with urlopen(req, timeout=timeout) as resp:
                for chunk_json in _iter_chunks(resp):
                    try:
                        choices = chunk_json.get("choices", [])
                        if not choices:
                            continue
                        if choices[0].get("finish_reason"):
                            finish_reason = choices[0]["finish_reason"]
                        delta = choices[0].get("delta", {})

                        # Stream real-time reasoning / thoughts
                        if "reasoning_content" in delta and delta["reasoning_content"]:
                            yield {"type": "thought", "chunk": delta["reasoning_content"]}

                        # Stream real-time response content
                        if "content" in delta and delta["content"]:
                            round_content.append(delta["content"])
                            yield {"type": "content", "chunk": delta["content"]}

                        # Accumulate tool calls (memoria o web_search) de esta ronda
                        if "tool_calls" in delta and delta["tool_calls"]:
                            for tc in delta["tool_calls"]:
                                idx = tc.get("index", 0)
                                while len(tool_calls_acc) <= idx:
                                    tool_calls_acc.append({"id": "", "function": {"name": "", "arguments": ""}})
                                if tc.get("id"):
                                    tool_calls_acc[idx]["id"] = tc["id"]
                                fn = tc.get("function", {})
                                if fn.get("name"):
                                    tool_calls_acc[idx]["function"]["name"] = fn["name"]
                                if fn.get("arguments"):
                                    tool_calls_acc[idx]["function"]["arguments"] += fn["arguments"]
                    except Exception:
                        pass

            # Sin tool_calls => la respuesta final fue streamiada en esta ronda.
            if not tool_calls_acc:
                if round_index == 0 and required_initial_tool:
                    yield {
                        "type": "error",
                        "error": (
                            "No se pudo verificar el proveedor de mercado seleccionado "
                            "mediante la herramienta de datos."
                        ),
                        "error_code": "MARKET_DATA_TOOL_REQUIRED",
                    }
                    return
                answered = True
                # Si el modelo se corto por limite de tokens (finish_reason=='length'),
                # continuar la generacion hasta completar el informe, sin repetir.
                full_text = "".join(round_content)
                cont = 0
                empty_rounds = 0
                while finish_reason == "length" and cont < MAX_CONTINUATIONS:
                    cont += 1
                    logger.info(f"[NvidiaChatStream] respuesta cortada por longitud; continuando {cont}/{MAX_CONTINUATIONS}")
                    req_messages = messages + [
                        {"role": "assistant", "content": full_text},
                        {"role": "user", "content": "Continuá EXACTAMENTE desde donde quedaste, sin repetir lo ya escrito y sin títulos nuevos: completá la respuesta hasta el final."},
                    ]
                    cont_payload = {
                        "model": model_id,
                        "messages": req_messages,
                        **sampling,
                        "max_tokens": effective_max_tokens,
                        "stream": True,
                    }
                    req2 = Request(url, data=json.dumps(cont_payload).encode("utf-8"), headers=headers, method="POST")
                    more = []
                    finish_reason = None
                    with urlopen(req2, timeout=timeout) as resp2:
                        for cj in _iter_chunks(resp2):
                            try:
                                ch2 = cj.get("choices", [])
                                if not ch2:
                                    continue
                                if ch2[0].get("finish_reason"):
                                    finish_reason = ch2[0]["finish_reason"]
                                d2 = ch2[0].get("delta", {})
                                if d2.get("content"):
                                    more.append(d2["content"])
                                    yield {"type": "content", "chunk": d2["content"]}
                            except Exception:
                                pass
                    full_text += "".join(more)
                    if more:
                        empty_rounds = 0
                    else:
                        # En modelos de razonamiento una ronda de continuation puede
                        # gastar todo el presupuesto en 'thinking' y no emitir contenido
                        # visible (more vacio) con finish_reason='length'. No rendirse al
                        # primer vacio: reintentar hasta 2 seguidos antes de cortar.
                        empty_rounds += 1
                        if empty_rounds >= 2:
                            break  # sin progreso real: evitar bucle inoperante
                if finish_reason == "length" and full_text.strip():
                    # Solo avisar del corte si hubo respuesta real que continuar. Si el
                    # contenido utile quedo vacio (el 'thinking' se comio el presupuesto),
                    # NO emitir nada: el frontend muestra un fallback honesto en lugar de
                    # un mensaje que seria unicamente el aviso de truncamiento.
                    yield {"type": "content", "chunk": "\n\n> \u26a0\ufe0f La respuesta se cort\u00f3 por el l\u00edmite de tokens del modelo."}
                break

            assistant_tool_msg = {"role": "assistant", "content": "", "tool_calls": []}
            for tc in tool_calls_acc:
                assistant_tool_msg["tool_calls"].append({
                    "id": tc.get("id") or "call_0",
                    "type": "function",
                    "function": tc.get("function", {})
                })
            messages.append(assistant_tool_msg)

            for tc in tool_calls_acc:
                fn = tc.get("function", {})
                fn_name = fn.get("name")
                raw_args = fn.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    args = {"query": str(raw_args)}

                query = args.get("query", prompt)
                src = (str(args.get("source") or "all")).lower() if fn_name == "web_search" else None
                if fn_name == "web_search":
                    label = {"reddit": "en Reddit", "x": "en X/Twitter", "twitter": "en X/Twitter", "news": "de noticias"}.get(src, "en la web")
                    yield {"type": "thought", "chunk": f"\n[\U0001F50D Buscando {label}: '{query}']\n"}
                elif fn_name == "rename_chat_session":
                    yield {"type": "thought", "chunk": "\n[Actualizando el nombre de la sesión]\n"}
                elif fn_name == "get_selected_market_data":
                    provider = (
                        "yahoo"
                        if indicator_data and indicator_data.get("market") == "stock"
                        else (indicator_data or {}).get("provider", "desconocido")
                    )
                    yield {
                        "type": "thought",
                        "chunk": f"\n[Verificando el feed de mercado seleccionado mediante MCP: {provider}]\n",
                    }
                else:
                    yield {"type": "thought", "chunk": f"\n[Accediendo a memoria MCP: '{query}']\n"}

                result, meta = run_tool_call(
                    fn_name, args,
                    prompt=prompt, owner_id=owner_id, current_session_id=current_session_id,
                    indicator_data=indicator_data,
                )
                tools_used.append(meta)

                if fn_name == "web_search":
                    yield {"type": "tool", "name": "web_search", "query": query, "source": src, "found": result.get("count", 0), "results": result.get("results", []), "provider": result.get("provider"), "widened": bool(result.get("widened"))}
                    if result.get("widened"):
                        yield {"type": "thought", "chunk": f"\n[\u26a0\ufe0f Sin resultados con filtro '{src}'; busqueda ampliada a web general via {result.get('provider') or 'web'}]\n"}
                elif fn_name == "rename_chat_session":
                    if result.get("renamed"):
                        yield {
                            "type": "session_renamed",
                            "session_id": result["session_id"],
                            "title": result["title"],
                        }
                    else:
                        yield {"type": "thought", "chunk": f"\n[No se pudo actualizar el título: {result.get('error')}]\n"}
                elif fn_name == "get_selected_market_data":
                    yield {
                        "type": "tool",
                        "name": "get_selected_market_data",
                        "provider": result.get("provider"),
                        "symbol": result.get("symbol"),
                        "available": result.get("available"),
                    }
                else:
                    yield {
                        "type": "tool",
                        "tool": "search_chat_history",
                        "query": query,
                        "found": result.get("found_records", 0),
                    }

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id") or "call_0",
                    "name": fn_name,
                    "content": json.dumps(result, ensure_ascii=False),
                })

        if not answered:
            # Se agotaron las rondas de herramientas sin que el modelo redacte una
            # respuesta final (pasa cuando las busquedas devuelven 0 y reintenta).
            # Forzar una ultima generacion SIN tools para que conteste con lo reunido.
            logger.info("[NvidiaChatStream] rondas agotadas; forzando respuesta final")
            final_payload = {
                "model": model_id,
                "messages": messages,
                **sampling,
                "max_tokens": effective_max_tokens,
                "stream": True,
            }
            req = Request(url, data=json.dumps(final_payload).encode("utf-8"), headers=headers, method="POST")
            with urlopen(req, timeout=timeout) as resp:
                for chunk_json in _iter_chunks(resp):
                    try:
                        choices = chunk_json.get("choices", [])
                        if not choices:
                            continue
                        delta = choices[0].get("delta", {})
                        if delta.get("reasoning_content"):
                            yield {"type": "thought", "chunk": delta["reasoning_content"]}
                        if delta.get("content"):
                            yield {"type": "content", "chunk": delta["content"]}
                    except Exception:
                        pass

        yield {"type": "done", "model": model_key, "memory_accessed": tools_used}

    except Exception as e:
        logger.error(f"[NvidiaChatStream] Error: {e}")
        yield {"type": "error", "error": str(e), "error_code": "STREAM_ERROR"}
