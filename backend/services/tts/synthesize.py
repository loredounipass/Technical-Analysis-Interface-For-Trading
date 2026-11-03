"""Motor de sintesis de voz NVIDIA Riva (gRPC).

Convierte el texto ya preparado en audio WAV. Detecta idioma y elige la voz
Magpie (con fallback a EN-US.Aria si la solicitada no existe en el despliegue),
normaliza numeros a palabras en espanol y arma el WAV (PCM 16-bit mono).
Dependencias de texto/config vienen de speech_text / numbers_es / config.

El import de `riva.client` es perezoso (dentro de la funcion) para que el
modulo se pueda importar sin el paquete instalado (la ruta devuelve 503).
"""

import os
import io
import wave
import logging

from services.tts.config import (
    TTS_SERVER,
    TTS_SAMPLE_RATE,
    TTS_FUNCTION_ID,
    TTS_VOICE_BY_LANG,
    FALLBACK_VOICE,
    MAX_TEXT_LENGTH,
)
from services.tts.speech_text import _detect_lang
from services.tts.numbers_es import _normalizar_numeros_es

logger = logging.getLogger(__name__)


def synthesize_speech(text, voice=None, lang=None):
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY not set")
    if not TTS_FUNCTION_ID:
        raise RuntimeError("NVIDIA_TTS_FUNCTION_ID not set")

    if not text or not text.strip():
        raise ValueError("TTS text cannot be empty")

    safe_text = text.strip()[:MAX_TEXT_LENGTH]

    detected = _detect_lang(safe_text, lang)
    if not voice:
        voice, lang = TTS_VOICE_BY_LANG.get(detected, FALLBACK_VOICE)

    # Normalizar números a palabras en español para que el TTS los lea bien
    if detected == "es":
        safe_text = _normalizar_numeros_es(safe_text)

    try:
        import riva.client
        from riva.client.proto.riva_audio_pb2 import AudioEncoding
    except ImportError as e:
        raise RuntimeError("nvidia-riva-client not installed") from e

    def _try_synth(target_voice, target_lang):
        auth = riva.client.Auth(
            uri=TTS_SERVER,
            use_ssl=True,
            metadata_args=[
                ("function-id", TTS_FUNCTION_ID),
                ("authorization", f"Bearer {api_key}"),
            ],
        )
        service = riva.client.SpeechSynthesisService(auth)
        return service.synthesize(
            safe_text,
            target_voice,
            target_lang,
            sample_rate_hz=TTS_SAMPLE_RATE,
            encoding=AudioEncoding.LINEAR_PCM,
        )

    try:
        logger.info(f"[TTS] gRPC synthesize {len(safe_text)} chars voice={voice} lang={lang}")
        try:
            resp = _try_synth(voice, lang)
        except Exception as e:
            if "subvoice requested not found" in str(e):
                logger.warning(f"[TTS] voice {voice} no disponible, fallback a EN-US.Aria")
                fb_voice, fb_lang = FALLBACK_VOICE
                # Usamos el idioma detectado con la voz fallback (el modelo puede
                # pronunciar el texto en ese idioma con acento de la voz)
                resp = _try_synth(fb_voice, lang)
            else:
                raise

        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(TTS_SAMPLE_RATE)
            wf.writeframesraw(resp.audio)
        return buf.getvalue()
    except Exception as e:
        logger.error(f"[TTS] gRPC synthesis failed: {e}")
        raise RuntimeError(f"TTS gRPC failed: {e}")
