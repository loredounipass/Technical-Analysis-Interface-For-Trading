"""Cliente de completions NVIDIA no-streaming (`nvidia_chat`).

Ejecuta el loop iterativo de tool-calling (memoria MCP + web_search) y
devuelve (texto, tools_used). Todo el armado del request (credenciales,
modelo, sampling, system prompt, headers, herramientas, mensajes) se resuelve
en services.chat.context.resolve_request_context; aqui solo vive la ronda de
llamadas y el manejo de errores HTTP/URL/JSON, lanzando NvidiaChatError.
"""

import json
import logging
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

from services.chat.config import NvidiaChatError
from services.chat.context import resolve_request_context
from services.chat.tools import _run_tool_call

logger = logging.getLogger(__name__)

# Maximo de rondas de tool-calling antes de forzar una sintesis final sin tools.
MAX_TOOL_ROUNDS = 5


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
    ctx = resolve_request_context(
        prompt, model_key, temperature, max_tokens, history,
        global_context, indicator_data, intent, web_search_enabled, streaming=False,
    )
    model_id = ctx["model_id"]
    model_name = ctx["model_name"]
    timeout = ctx["timeout"]
    sampling = ctx["sampling"]
    effective_max_tokens = ctx["effective_max_tokens"]
    url = ctx["url"]
    headers = ctx["headers"]
    request_tools = ctx["request_tools"]
    initial_messages = ctx["initial_messages"]

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

        # Se agotaron las rondas de herramientas: sintesis final sin tools.
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

        # Si el modelo no soporta el parametro tools (HTTP 400), reintentar sin tools
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
        raise NvidiaChatError("Respuesta invalida del API de NVIDIA.", code="JSON_ERROR")
    except NvidiaChatError:
        raise
    except Exception as e:
        logger.exception(f"Unexpected NVIDIA API error for {model_id}: {e}")
        raise NvidiaChatError(f"Error inesperado: {str(e)}", code="UNEXPECTED")
