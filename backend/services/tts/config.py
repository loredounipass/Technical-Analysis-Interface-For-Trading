"""Configuracion del TTS NVIDIA Riva: endpoint, funcion, voces y limites.

Constantes leidas una sola vez al importar. Separadas del motor (synthesize) y
de la preparacion de texto (speech_text / numbers_es) para que cada modulo se
enfoque en una sola responsabilidad.
"""

import os

TTS_SERVER = "grpc.nvcf.nvidia.com:443"
TTS_SAMPLE_RATE = 22050

# function-id del cloud endpoint de NVIDIA para los modelos magpie TTS
TTS_FUNCTION_ID = os.getenv("NVIDIA_TTS_FUNCTION_ID", "").strip()

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
