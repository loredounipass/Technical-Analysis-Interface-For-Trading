import os
import io
import wave
import logging

logger = logging.getLogger(__name__)

TTS_SERVER = "grpc.nvcf.nvidia.com:443"
TTS_VOICE = "Magpie-ZeroShot.Female-1"
TTS_LANGUAGE = "en-US"
TTS_SAMPLE_RATE = 22050

# function-id del cloud endpoint de NVIDIA para los modelos magpie TTS
# (mismo UUID para multilingual y zeroshot: el dispatch lo hace el voice param).
TTS_FUNCTION_ID = os.getenv(
    "NVIDIA_TTS_FUNCTION_ID",
    "877104f7-e885-42b9-8de8-f6e4c6303969",
)

# Path opcional a un WAV de referencia (audio prompt) para zero-shot voice
# cloning. Si NO se setea, se usa la voice built-in (Magpie-ZeroShot.Female-1).
TTS_AUDIO_PROMPT = os.getenv("NVIDIA_TTS_AUDIO_PROMPT", "")

MAX_TEXT_LENGTH = 1000


def synthesize_speech(text, voice=TTS_VOICE):
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY not set")

    if not text or not text.strip():
        raise ValueError("TTS text cannot be empty")

    safe_text = text.strip()[:MAX_TEXT_LENGTH]

    try:
        import riva.client
        from riva.client.proto.riva_audio_pb2 import AudioEncoding
    except ImportError as e:
        raise RuntimeError("nvidia-riva-client not installed") from e

    try:
        logger.info(
            f"[TTS] gRPC synthesize {len(safe_text)} chars voice={voice} "
            f"audio_prompt={'yes' if TTS_AUDIO_PROMPT else 'no'}"
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

        kwargs = {
            "sample_rate_hz": TTS_SAMPLE_RATE,
            "encoding": AudioEncoding.LINEAR_PCM,
        }
        if TTS_AUDIO_PROMPT and os.path.exists(TTS_AUDIO_PROMPT):
            with open(TTS_AUDIO_PROMPT, "rb") as f:
                kwargs["audio_prompt_data"] = f.read()
            logger.info(f"[TTS] usando audio prompt de {TTS_AUDIO_PROMPT}")

        resp = service.synthesize(
            safe_text,
            voice,
            TTS_LANGUAGE,
            **kwargs,
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