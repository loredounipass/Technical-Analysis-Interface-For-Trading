import os
import logging
import requests

logger = logging.getLogger(__name__)

TTS_URL = "https://integrate.api.nvidia.com/v1/audio/speech"
TTS_MODEL = "nvidia/magpie-tts-zeroshot"
TTS_VOICE = "female_consent_sample_1.wav"

MAX_TEXT_LENGTH = 1000


def synthesize_speech(text, voice=TTS_VOICE):
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY not set")

    if not text or not text.strip():
        raise ValueError("TTS text cannot be empty")

    safe_text = text.strip()[:MAX_TEXT_LENGTH]

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "audio/wav",
    }

    payload = {
        "model": TTS_MODEL,
        "input": safe_text,
        "voice": voice,
    }

    try:
        import requests
        logger.info(f"[TTS] Synthesizing {len(safe_text)} chars with voice={voice}")
        resp = requests.post(TTS_URL, json=payload, headers=headers, timeout=60)
        if not resp.ok:
            logger.error(f"[TTS] NVIDIA API error {resp.status_code}: {resp.text[:300]}")
            raise RuntimeError(f"TTS API returned {resp.status_code}")

        return resp.content
    except requests.exceptions.Timeout:
        logger.error("[TTS] Request timed out after 60s")
        raise RuntimeError("TTS synthesis timed out")
    except requests.exceptions.RequestException as e:
        logger.error(f"[TTS] Request failed: {e}")
        raise RuntimeError(f"TTS request failed: {e}")