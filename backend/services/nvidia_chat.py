"""Orquestador del agente de chat NVIDIA (Módulo principal).

Este módulo queda como punto de entrada: define build_messages, nvidia_chat y
nvidia_chat_stream (el loop iterativo de tool-calling). La configuración, el
clasificador de intención, el prompt, la memoria y el dispatch de herramientas
viven en submódulos hermanos (chat_config / chat_intent / chat_prompt /
chat_memory / chat_tools / web_search) para mantener este archivo enfocado.

Se reexportan classify_intent, NvidiaChatError y AVAILABLE_MODELS para que
`from services.nvidia_chat import ...` (usado por controllers/routes_chat.py)
siga funcionando sin cambios.
"""

import json
import logging
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from services.chat_config import (
    NVIDIA_API_BASE,
    REQUEST_TIMEOUT,
    AVAILABLE_MODELS,
    CHAT_TOOLS,
    WEB_SEARCH_TOOL,
    NvidiaChatError,
    get_api_key,
)
from services.chat_intent import classify_intent
from services.chat_prompt import get_trading_system_prompt
from services.chat_tools import _run_tool_call

logger = logging.getLogger(__name__)

# Reexport de nombres públicos usados por otros módulos.
__all__ = [
    "nvidia_chat",
    "nvidia_chat_stream",
    "build_messages",
    "classify_intent",
    "NvidiaChatError",
    "AVAILABLE_MODELS",
    "get_trading_system_prompt",
]


def build_messages(prompt: str, system_prompt: str, history: list | None = None) -> list[dict]:
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prompt})
    return messages


def nvidia_chat(
    prompt: str,
    model_key: str = "nvidia-nemotron",
    temperature: float | None = None,
    max_tokens: int | None = None,
    history: list | None = None,
    global_context: str | None = None,
    indicator_data: dict | None = None,
    intent: str = "analysis",
    all_sessions: list | None = None,
    current_session_id: str | None = None,
    web_search_enabled: bool = False,
) -> tuple[str, list]:
    """Call the NVIDIA API with MCP-style tool calling support for memory recall.
    Returns (response_text, tools_used). Raises NvidiaChatError on failure."""
    api_key = get_api_key()
    if not api_key:
        raise NvidiaChatError("NVIDIA_API_KEY no está configurado en el servidor.", code="NO_API_KEY")

    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        raise NvidiaChatError(f"Modelo desconocido: {model_key}", code="UNKNOWN_MODEL")
    model_id = model_config["id"]
    model_name = model_config["name"]
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))

    effective_data = indicator_data if intent in ('analysis', 'ambiguous') else None
    system_prompt = get_trading_system_prompt(effective_data, global_context, model_name, intent=intent, web_search_enabled=web_search_enabled)

    # Resuelve los parametros de inferencia POR MODELO (ver AVAILABLE_MODELS),
    # salvo que el caller los pase explicitos. Nemotron/Muse/DiffusionGemma
    # esperan temperature=1.0 / top_p=0.95; usar 0.3 los degrada.
    if temperature is None:
        temperature = float(model_config.get("temperature", 0.6))
    cfg_max = int(model_config.get("max_tokens", 8192))
    effective_max_tokens = 512 if intent == "casual" else (int(max_tokens) if max_tokens else cfg_max)
    sampling = {"temperature": temperature}
    if model_config.get("top_p") is not None:
        sampling["top_p"] = float(model_config["top_p"])
    if model_config.get("top_k") is not None:
        sampling["top_k"] = int(model_config["top_k"])
    url = f"{NVIDIA_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    request_tools = list(CHAT_TOOLS)
    if web_search_enabled:
        request_tools.append(WEB_SEARCH_TOOL)

    initial_messages = build_messages(prompt, system_prompt, history)

    MAX_TOOL_ROUNDS = 5
    messages = list(initial_messages)
    tools_used = []

    try:
        for _round in range(MAX_TOOL_ROUNDS):
            payload_dict = {
                "model": model_id,
                "messages": messages,
                **sampling,
                "max_tokens": effective_max_tokens,
                # `tools` se mantiene en TODAS las rondas: si desaparece, el modelo
                # emite el tool_call como texto (XML) y se filtra al usuario.
                "tools": request_tools,
                "tool_choice": "auto",
            }
            req = Request(url, data=json.dumps(payload_dict).encode("utf-8"), headers=headers, method="POST")
            with urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if not choices:
                logger.error(f"NVIDIA API returned no choices: {data}")
                raise NvidiaChatError("El modelo no devolvió respuesta. Intenta de nuevo.", code="NO_CHOICES")

            choice_msg = choices[0].get("message", {})
            tool_calls = choice_msg.get("tool_calls", [])

            if not tool_calls:
                content = choice_msg.get("content", "")
                if not content or not content.strip():
                    raise NvidiaChatError("El modelo devolvió una respuesta vacía.", code="EMPTY_RESPONSE")
                return content.strip(), tools_used

            logger.info(f"[NvidiaChat] {model_name} requested {len(tool_calls)} tool call(s)")
            messages.append(choice_msg)
            for tc in tool_calls:
                fn = tc.get("function", {})
                fn_name = fn.get("name")
                raw_args = fn.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    args = {"query": str(raw_args)}
                result, meta = _run_tool_call(
                    fn_name, args,
                    prompt=prompt, all_sessions=all_sessions, current_session_id=current_session_id,
                )
                tools_used.append(meta)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.get("id"),
                    "name": fn_name,
                    "content": json.dumps(result, ensure_ascii=False),
                })

        # Se agotaron las rondas de herramientas: síntesis final sin tools.
        payload_final = json.dumps({
            "model": model_id,
            "messages": messages,
            **sampling,
            "max_tokens": effective_max_tokens,
        }).encode("utf-8")
        req_final = Request(url, data=payload_final, headers=headers, method="POST")
        with urlopen(req_final, timeout=timeout) as resp_final:
            data_final = json.loads(resp_final.read().decode("utf-8"))
        final_content = data_final.get("choices", [{}])[0].get("message", {}).get("content", "")
        return (final_content.strip() if final_content else ""), tools_used

    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.error(f"NVIDIA API HTTP {e.code} for model {model_id}: {body}")

        # Si el modelo no soporta el parámetro tools (HTTP 400), reintentar sin tools
        if e.code == 400 and ("tool" in body.lower() or "schema" in body.lower() or "not supported" in body.lower()):
            logger.warning(f"[NvidiaChat] Retrying without tools for {model_name}...")
            payload_no_tools = json.dumps({
                "model": model_id,
                "messages": initial_messages,
                **sampling,
                "max_tokens": effective_max_tokens,
            }).encode("utf-8")
            req_retry = Request(url, data=payload_no_tools, headers=headers, method="POST")
            try:
                with urlopen(req_retry, timeout=timeout) as resp_retry:
                    data_retry = json.loads(resp_retry.read().decode("utf-8"))
                    content_retry = data_retry.get("choices", [{}])[0].get("message", {}).get("content", "")
                    return content_retry.strip(), []
            except Exception as retry_err:
                logger.error(f"[NvidiaChat] Retry without tools also failed: {retry_err}")

        detail = ""
        try:
            err_json = json.loads(body)
            detail = err_json.get("detail", "") or err_json.get("message", "") or err_json.get("error", "")
            if isinstance(detail, dict):
                detail = detail.get("message", str(detail))
        except Exception:
            detail = body[:200] if body else ""
        raise NvidiaChatError(
            f"Error del modelo {model_name} (HTTP {e.code}): {detail or 'Error desconocido del API'}",
            code=f"HTTP_{e.code}"
        )
    except URLError as e:
        logger.error(f"NVIDIA API request failed for {model_id}: {e.reason}")
        raise NvidiaChatError(f"No se pudo conectar al API de NVIDIA: {e.reason}", code="URL_ERROR")
    except json.JSONDecodeError as e:
        logger.error(f"NVIDIA API invalid JSON for {model_id}: {e}")
        raise NvidiaChatError("Respuesta inválida del API de NVIDIA.", code="JSON_ERROR")
    except NvidiaChatError:
        raise
    except Exception as e:
        logger.exception(f"Unexpected NVIDIA API error for {model_id}: {e}")
        raise NvidiaChatError(f"Error inesperado: {str(e)}", code="UNEXPECTED")


def nvidia_chat_stream(
    prompt: str,
    model_key: str = "nvidia-nemotron",
    temperature: float | None = None,
    max_tokens: int | None = None,
    history: list | None = None,
    global_context: str | None = None,
    indicator_data: dict | None = None,
    intent: str = "analysis",
    all_sessions: list | None = None,
    current_session_id: str | None = None,
    web_search_enabled: bool = False,
):
    """Generates real-time SSE events for model reasoning (thoughts) and response content."""
    api_key = get_api_key()
    if not api_key:
        yield {"type": "error", "error": "NVIDIA_API_KEY no está configurado en el servidor.", "error_code": "NO_API_KEY"}
        return

    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        yield {"type": "error", "error": f"Modelo desconocido: {model_key}", "error_code": "UNKNOWN_MODEL"}
        return
    model_id = model_config["id"]
    model_name = model_config["name"]
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))

    effective_data = indicator_data if intent in ('analysis', 'ambiguous') else None
    system_prompt = get_trading_system_prompt(effective_data, global_context, model_name, intent=intent, web_search_enabled=web_search_enabled)
    # Resuelve los parametros de inferencia POR MODELO (ver AVAILABLE_MODELS),
    # salvo que el caller los pase explicitos. Nemotron/Muse/DiffusionGemma
    # esperan temperature=1.0 / top_p=0.95; usar 0.3 los degrada.
    if temperature is None:
        temperature = float(model_config.get("temperature", 0.6))
    cfg_max = int(model_config.get("max_tokens", 8192))
    effective_max_tokens = 512 if intent == "casual" else (int(max_tokens) if max_tokens else cfg_max)
    sampling = {"temperature": temperature}
    if model_config.get("top_p") is not None:
        sampling["top_p"] = float(model_config["top_p"])
    if model_config.get("top_k") is not None:
        sampling["top_k"] = int(model_config["top_k"])
    url = f"{NVIDIA_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    request_tools = list(CHAT_TOOLS)
    if web_search_enabled:
        request_tools.append(WEB_SEARCH_TOOL)

    initial_messages = build_messages(prompt, system_prompt, history)

    MAX_TOOL_ROUNDS = 5
    messages = list(initial_messages)
    tools_used = []
    answered = False
    MAX_CONTINUATIONS = 6

    try:
        for _round in range(MAX_TOOL_ROUNDS):
            payload_dict = {
                "model": model_id,
                "messages": messages,
                **sampling,
                "max_tokens": effective_max_tokens,
                # `tools` en TODAS las rondas: si desaparece, el modelo emite el
                # tool_call como texto (XML) y se filtra al usuario.
                "tools": request_tools,
                "tool_choice": "auto",
                "stream": True,
            }
            req = Request(url, data=json.dumps(payload_dict).encode("utf-8"), headers=headers, method="POST")

            tool_calls_acc = []
            round_content = []
            finish_reason = None
            with urlopen(req, timeout=timeout) as resp:
                for raw_line in resp:
                    line = raw_line.decode("utf-8").strip()
                    if not line or line == "data: [DONE]":
                        continue
                    if not line.startswith("data: "):
                        continue
                    try:
                        chunk_json = json.loads(line[6:])
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
                        for raw_line in resp2:
                            line = raw_line.decode("utf-8").strip()
                            if not line or line == "data: [DONE]":
                                continue
                            if not line.startswith("data: "):
                                continue
                            try:
                                cj = json.loads(line[6:])
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
                else:
                    yield {"type": "thought", "chunk": f"\n[Accediendo a memoria MCP: '{query}']\n"}

                result, meta = _run_tool_call(
                    fn_name, args,
                    prompt=prompt, all_sessions=all_sessions, current_session_id=current_session_id,
                )
                tools_used.append(meta)

                if fn_name == "web_search":
                    yield {"type": "tool", "name": "web_search", "query": query, "source": src, "found": result.get("count", 0), "results": result.get("results", []), "provider": result.get("provider"), "widened": bool(result.get("widened"))}
                    if result.get("widened"):
                        yield {"type": "thought", "chunk": f"\n[\u26a0\ufe0f Sin resultados con filtro '{src}'; busqueda ampliada a web general via {result.get('provider') or 'web'}]\n"}
                else:
                    yield {"type": "tool", "query": query, "found": result.get("found_records", 0)}

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
                for raw_line in resp:
                    line = raw_line.decode("utf-8").strip()
                    if not line or line == "data: [DONE]":
                        continue
                    if not line.startswith("data: "):
                        continue
                    try:
                        chunk_json = json.loads(line[6:])
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
