"""Contexto de request compartido por los flujos de chat (agente NVIDIA).

Centraliza lo que `nvidia_chat` (completion) y `nvidia_chat_stream` (streaming)
repetian identico: validacion de credenciales/modelo, resolucion de parametros
de inferencia POR MODELO, system prompt, sampling, headers, herramientas y el
armado de mensajes con historial. `build_messages` vive aqui por ser el arma
compartida de historial que ambos consumen.

`resolve_request_context` lanza NvidiaChatError (codes NO_API_KEY /
UNKNOWN_MODEL) en los dos fallos de preparacion; el caller no-streaming deja
propagar el error y el streaming lo captura para emitir su evento de error,
conservando exactamente los mismos mensajes y codigos que antes.
"""

import logging

from services.chat.config import (
    NVIDIA_API_BASE,
    REQUEST_TIMEOUT,
    AVAILABLE_MODELS,
    CHAT_TOOLS,
    WEB_SEARCH_TOOL,
    NvidiaChatError,
    get_api_key,
)
from services.chat.prompt import get_trading_system_prompt

logger = logging.getLogger(__name__)

# Valores por defecto de inferencia cuando el modelo no los especifica.
DEFAULT_TEMPERATURE = 0.6
DEFAULT_MAX_TOKENS = 8192
# Tope de salida para respuestas casuales (charla breve, sin analisis).
CASUAL_MAX_TOKENS = 512


def build_messages(prompt: str, system_prompt: str, history: list | None = None) -> list[dict]:
    """Arma la lista de mensajes: system + historial filtrado + prompt actual."""
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prompt})
    return messages


def resolve_request_context(
    prompt: str,
    model_key: str,
    temperature: float | None,
    max_tokens: int | None,
    history: list | None,
    global_context: str | None,
    indicator_data: dict | None,
    intent: str,
    web_search_enabled: bool,
    streaming: bool,
) -> dict:
    """Resuelve todo lo comun a una llamada al API y lo devuelve en un dict.

    `streaming=True` anade el header Accept: text/event-stream. No realiza la
    peticion: solo prepara credenciales, modelo, sampling, system prompt,
    herramientas y mensajes iniciales.
    """
    api_key = get_api_key()
    if not api_key:
        raise NvidiaChatError("NVIDIA_API_KEY no está configurado en el servidor.", code="NO_API_KEY")

    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        raise NvidiaChatError(f"Modelo desconocido: {model_key}", code="UNKNOWN_MODEL")
    model_id = model_config["id"]
    model_name = model_config["name"]
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))

    # Los indicadores solo alimentan el system prompt en intents de analisis;
    # en casual/chat se omiten para no inflar el contexto.
    effective_data = indicator_data if intent in ('analysis', 'ambiguous') else None
    system_prompt = get_trading_system_prompt(effective_data, global_context, model_name, intent=intent, web_search_enabled=web_search_enabled)

    # Resuelve los parametros de inferencia POR MODELO (ver AVAILABLE_MODELS),
    # salvo que el caller los pase explicitos. Nemotron/Muse/DiffusionGemma
    # esperan temperature=1.0 / top_p=0.95; usar 0.3 los degrada.
    if temperature is None:
        temperature = float(model_config.get("temperature", DEFAULT_TEMPERATURE))
    cfg_max = int(model_config.get("max_tokens", DEFAULT_MAX_TOKENS))
    effective_max_tokens = CASUAL_MAX_TOKENS if intent == "casual" else (int(max_tokens) if max_tokens else cfg_max)
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
    if streaming:
        headers["Accept"] = "text/event-stream"

    request_tools = list(CHAT_TOOLS)
    if web_search_enabled:
        request_tools.append(WEB_SEARCH_TOOL)

    initial_messages = build_messages(prompt, system_prompt, history)

    return {
        "api_key": api_key,
        "model_config": model_config,
        "model_id": model_id,
        "model_name": model_name,
        "timeout": timeout,
        "system_prompt": system_prompt,
        "sampling": sampling,
        "effective_max_tokens": effective_max_tokens,
        "url": url,
        "headers": headers,
        "request_tools": request_tools,
        "initial_messages": initial_messages,
    }
