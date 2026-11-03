"""Punto de entrada del agente de chat NVIDIA (orquestador).

Este modulo solia concentrar la logica completa (~493 lineas). Se dividio en
submodulos hermanos enfocados para mantener cada uno legible:

  - context.py     build_messages + resolve_request_context (armado comun del
                   request: credenciales, modelo, sampling, system prompt,
                   headers, herramientas).
  - completion.py  nvidia_chat       (loop no-streaming de tool-calling).
  - stream.py      nvidia_chat_stream (loop de streaming SSE).

Aqui solo se re-exportan los nombres publicos para que
`from services.chat import ...` y `from services.chat.agent import ...`
(usados por controllers/routes_chat.py y la fachada __init__) sigan
funcionando sin cambios.
"""

from services.chat.completion import nvidia_chat
from services.chat.context import build_messages
from services.chat.stream import nvidia_chat_stream

# Reexport de nombres públicos usados por otros módulos.
__all__ = [
    "nvidia_chat",
    "nvidia_chat_stream",
    "build_messages",
]
