import os
import io
import re
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


_UNIDADES = [
    "cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve",
    "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete",
    "dieciocho", "diecinueve",
]
_DECENAS = [
    "", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa",
]
_CENTENAS = [
    "", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
    "seiscientos", "setecientos", "ochocientos", "novecientos",
]


def _subcientos(n: int) -> str:
    if n < 20:
        return _UNIDADES[n]
    if n < 30:
        return "veinti" + _UNIDADES[n - 20] if n > 20 else "veinte"
    d, u = divmod(n, 10)
    return _DECENAS[d] + (" y " + _UNIDADES[u] if u else "")


def _centenas(n: int) -> str:
    if n == 100:
        return "cien"
    c, r = divmod(n, 100)
    return _CENTENAS[c] + (" " + _subcientos(r) if r else "")


def _miles(n: int) -> str:
    if n < 1000:
        return _centenas(n)
    mil, r = divmod(n, 1000)
    prefijo = "mil" if mil == 1 else _centenas(mil) + " mil"
    return prefijo + (" " + _centenas(r) if r else "")


def _num_a_palabras_entero(n: int) -> str:
    if n == 0:
        return "cero"
    if n < 1000:
        return _centenas(n)
    if n < 1_000_000:
        return _miles(n)
    # millones (hasta 999M)
    mm, r = divmod(n, 1_000_000)
    prefijo = "un millón" if mm == 1 else _miles(mm) + " millones"
    return prefijo + (" " + _miles(r) if r else "")


def _normalizar_numeros_es(text: str) -> str:
    """
    Convierte números en español a palabras para TTS.
    - 1875.03 → "mil ochocientos setenta y cinco coma cero tres"
    - 1,234.56 → "mil doscientos treinta y cuatro coma cinco seis"
    - 42 → "cuarenta y dos"
    - $100 / 100€ → "cien euros" / "cien dólares" (aprox)
    """
    def repl(m):
        s = m.group(0)
        # quitar símbolos de moneda y separadores de miles
        clean = s.replace("$", "").replace("€", "").replace("USD", "").replace("EUR", "").replace(",", "").strip()
        # detectar decimal con punto
        if "." in clean:
            ent, dec = clean.split(".", 1)
            ent = int(ent) if ent else 0
            dec_palabras = " ".join(_UNIDADES[int(d)] for d in dec if d.isdigit())
            return f"{_num_a_palabras_entero(ent)} coma {dec_palabras}"
        # entero puro
        try:
            return _num_a_palabras_entero(int(clean))
        except ValueError:
            return s

    # regex: números con opcional signo moneda, separadores de miles, decimal opcional
    # captura: 1875.03 | 1,234.56 | 42 | $100 | 100€ | 1.000
    pattern = re.compile(r"(?:[$€]|(?:USD|EUR))?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?\s*(?:[$€]|(?:USD|EUR))?")
    return pattern.sub(repl, text)


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