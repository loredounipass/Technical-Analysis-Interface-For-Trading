"""Paquete de TTS (sintesis de voz NVIDIA Riva).

Dividido por responsabilidad:
  - config.py       constantes (endpoint, function-id, voces por idioma, limites).
  - numbers_es.py   normalizador de numeros a palabras en espanol.
  - speech_text.py  deteccion de idioma + limpieza de markdown + conclusion.
  - synthesize.py   motor gRPC/Riva que produce el WAV.

Se re-exporta la API publica para que `from services.tts import ...` (usado por
controllers/routes_tts.py) funcione sin conocer la ubicacion interna.
"""

from services.tts.synthesize import synthesize_speech
from services.tts.speech_text import (
    build_speech_text,
    clean_for_speech,
    extract_conclusion,
)
from services.tts.config import (
    TTS_SERVER,
    TTS_SAMPLE_RATE,
    TTS_FUNCTION_ID,
    TTS_VOICE_BY_LANG,
    FALLBACK_VOICE,
    MAX_TEXT_LENGTH,
)


__all__ = [
    "synthesize_speech",
    "build_speech_text",
    "clean_for_speech",
    "extract_conclusion",
    "TTS_SERVER",
    "TTS_SAMPLE_RATE",
    "TTS_FUNCTION_ID",
    "TTS_VOICE_BY_LANG",
    "FALLBACK_VOICE",
    "MAX_TEXT_LENGTH",
]
