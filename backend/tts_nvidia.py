import os
import io
import wave
import logging

logger = logging.getLogger(__name__)

TTS_SERVER = "grpc.nvcf.nvidia.com:443"
TTS_SAMPLE_RATE = 22050

# function-id del cloud endpoint de NVIDIA para los modelos magpie TTS
TTS_FUNCTION_ID = os.getenv(
    "NVIDIA_TTS_FUNCTION_ID",
    "877104f7-e885-42b9-8de8-f6e4c6303969",
)

# Voces multilingual conocidas (del `list_voices` documentado). No todas
# existen en cada despliegue cloud; usamos fallback a EN-US.Aria que SÍ está.
TTS_VOICE_BY_LANG = {
    "es": ("Magpie-Multilingual.ES-US.Aria", "es-US"),
    "en": ("Magpie-Multilingual.EN-US.Aria", "en-US"),
    "fr": ("Magpie-Multilingual.FR-FR.Aria", "fr-FR"),
    "de": ("Magpie-Multilingual.DE-DE.Aria", "de-DE"),
    "it": ("Magpie-Multilingual.IT-IT.Aria", "it-IT"),
    "zh": ("Magpie-Multilingual.ZH-CN.Aria", "zh-CN"),
    "ja": ("Magpie-Multilingual.JA-JP.Aria", "ja-JP"),
    "ko": ("Magpie-Multilingual.KO-KR.Aria", "ko-KR"),
    "pt": ("Magpie-Multilingual.PT-BR.Aria", "pt-BR"),
    "hi": ("Magpie-Multilingual.HI-IN.Aria", "hi-IN"),
    "vi": ("Magpie-Multilingual.VI-VN.Aria", "vi-VN"),
    "ar": ("Magpie-Multilingual.AR-AR.Aria", "ar-AR"),
}
FALLBACK_VOICE = ("Magpie-Multilingual.EN-US.Aria", "en-US")

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
        voice, lang = TTS_VOICE_BY_LANG.get(detected, FALLBACK_VOICE)

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