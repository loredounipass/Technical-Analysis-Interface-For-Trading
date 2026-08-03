import os
import io
import wave
import logging

logger = logging.getLogger(__name__)

TTS_SERVER = "grpc.nvcf.nvidia.com:443"
# Magpie TTS Multilingual: 12 idiomas (en, es, fr, de, zh, vi, it, hi, ja, ko, ar, pt).
# Magpie TTS Zeroshot SOLO ingles (en-US) pero clona voz desde un audio prompt.
# Como el agente responde en espanol, usamos Multilingual con voz ES integrada.
TTS_VOICE = "Magpie-Multilingual.ES-US.Mateo"
TTS_LANGUAGE = "es-US"
TTS_VOICE_BY_LANG = {
    "es": ("Magpie-Multilingual.ES-US.Mateo", "es-US"),
    "en": ("Magpie-Multilingual.EN-US.Aria", "en-US"),
    "fr": ("Magpie-Multilingual.FR-FR.Pascal", "fr-FR"),
    "de": ("Magpie-Multilingual.DE-DE.Tobias", "de-DE"),
    "it": ("Magpie-Multilingual.IT-IT.Pietro", "it-IT"),
    "zh": ("Magpie-Multilingual.ZH-CN.Aria", "zh-CN"),
    "ja": ("Magpie-Multilingual.JA-JP.Aria", "ja-JP"),
    "ko": ("Magpie-Multilingual.KO-KR.Aria", "ko-KR"),
    "pt": ("Magpie-Multilingual.PT-BR.Aria", "pt-BR"),
    "hi": ("Magpie-Multilingual.HI-IN.Aria", "hi-IN"),
    "vi": ("Magpie-Multilingual.VI-VN.Aria", "vi-VN"),
    "ar": ("Magpie-Multilingual.AR-AR.Aria", "ar-AR"),
}
TTS_SAMPLE_RATE = 22050

# function-id del cloud endpoint de NVIDIA para los modelos magpie TTS
# (mismo UUID para multilingual y zeroshot: el dispatch lo hace el voice param).
TTS_FUNCTION_ID = os.getenv(
    "NVIDIA_TTS_FUNCTION_ID",
    "877104f7-e885-42b9-8de8-f6e4c6303969",
)

MAX_TEXT_LENGTH = 1000


def _detect_lang(text, override=None):
    if override:
        return override
    t = text.lower()
    if any(w in t for w in [" el ", " la ", " los ", " las ", " y ", " que ", " de "]):
        return "es"
    return "en"


def synthesize_speech(text, voice=None, lang=None):
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY not set")

    if not text or not text.strip():
        raise ValueError("TTS text cannot be empty")

    safe_text = text.strip()[:MAX_TEXT_LENGTH]

    detected = _detect_lang(safe_text, lang)
    if not voice:
        voice_lang = TTS_VOICE_BY_LANG.get(detected, TTS_VOICE_BY_LANG["en"])
        voice, lang = voice_lang

    try:
        import riva.client
        from riva.client.proto.riva_audio_pb2 import AudioEncoding
    except ImportError as e:
        raise RuntimeError("nvidia-riva-client not installed") from e

    try:
        logger.info(
            f"[TTS] gRPC synthesize {len(safe_text)} chars voice={voice} lang={lang}"
        )
        auth = riva.client.Auth(
            uri=TTS_SERVER,
            use_ssl=True,
            metadata_args=[
                ("function-id", TTS_FUNCTION_ID),
                ("authorization", f"Bearer {api_key}"),
            ],
        )
        service = riva.client.SpeechSynthesisService(auth)
        resp = service.synthesize(
            safe_text,
            voice,
            lang,
            sample_rate_hz=TTS_SAMPLE_RATE,
            encoding=AudioEncoding.LINEAR_PCM,
        )

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