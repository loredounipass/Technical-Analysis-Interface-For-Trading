"""Paquete del agente de chat NVIDIA.

Reune el orquestador (agent) y sus submodulos hermanos: config, intent,
prompt, memory, tools, web_search, context, completion y stream. Se re-exporta
la API publica para que `from services.chat import ...` (usado por
controllers/routes_chat.py) funcione sin importar la ubicacion interna.

Cada nombre se importa de su modulo real (agent es el punto de entrada
historico, hoy re-exporta solo las tres funciones de llamada).
"""

from services.chat.agent import (
    nvidia_chat,
    nvidia_chat_stream,
    build_messages,
)
from services.chat.intent import classify_intent
from services.chat.config import NvidiaChatError, AVAILABLE_MODELS
from services.chat.prompt import get_trading_system_prompt


__all__ = [
    "nvidia_chat",
    "nvidia_chat_stream",
    "build_messages",
    "classify_intent",
    "NvidiaChatError",
    "AVAILABLE_MODELS",
    "get_trading_system_prompt",
]
