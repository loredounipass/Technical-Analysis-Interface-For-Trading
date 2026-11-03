"""Preparacion del texto para lectura en voz alta.

Dos tareas de texto puro, previas a la sintesis:
  1) deteccion de idioma (es/en) para elegir la voz Magpie adecuada.
  2) aislamiento de la CONCLUSION del informe y limpieza de markdown, para que
     la voz lea solo el veredicto final y sin símbolos (#, **, tablas, listas).

`build_speech_text` es el pipeline que expone la ruta /api/tts. Depende de
config.MAX_TEXT_LENGTH para acotar el largo enviado al motor.
"""

import re
import unicodedata

from services.tts.config import MAX_TEXT_LENGTH


def _detect_lang(text, override=None):
    if override:
        return override
    t = text.lower()
    if any(w in t for w in [" el ", " la ", " los ", " las ", " y ", " que ", " de "]):
        return "es"
    return "en"


# ─────────────────────────────────────────────────────────────────────
# Extracción de la conclusión y limpieza de markdown para lectura en voz alta.
# El frontend manda el informe completo; la voz debe leer SOLO la conclusión
# (el bloque final del marco reasoning-first) y sin símbolos de markdown.
# ─────────────────────────────────────────────────────────────────────
_MD_HEADING = re.compile(r"^#{1,6}\s*")

# Pistas (sin acentos, en minúscula) que identifican el encabezado de la
# sección conclusiva del informe o de una respuesta corta.
_CONCLUSION_HINTS = ("conclusi", "recomendaci", "veredicto", "dictamen", "resumen final")


def _strip_accents(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def _is_conclusion_heading(line: str) -> bool:
    stripped = _MD_HEADING.sub("", line.strip())
    low = _strip_accents(stripped.lower())
    is_header = line.strip().startswith("#") or (
        stripped.startswith("**") and stripped.endswith("**")
    )
    return is_header and any(h in low for h in _CONCLUSION_HINTS)


def clean_for_speech(text: str) -> str:
    """Elimina marcas de markdown (encabezados, negrita, cursiva, código,
    listas, citas, tablas) para que el TTS lea texto natural sin símbolos."""
    if not text:
        return ""
    out = []
    for line in text.splitlines():
        l = line.strip()
        if not l:
            out.append("")
            continue
        l = _MD_HEADING.sub("", l)
        l = re.sub(r"\*\*(.+?)\*\*", r"\1", l)                      # bold
        l = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"\1", l)  # italic
        l = re.sub(r"`([^`]*)`", r"\1", l)                           # inline code
        l = re.sub(r"^>\s?", "", l)                                  # quote
        l = re.sub(r"^[-*\u2022]\s+", "", l)                          # bullet
        l = re.sub(r"^\d+\.\s+", "", l)                              # numbered
        l = l.replace("|", " ").strip()
        out.append(l)
    return "\n".join(out).strip()


def extract_conclusion(text: str) -> str:
    """Devuelve el cuerpo de la sección conclusiva. Si no hay un encabezado de
    conclusión reconocible, cae al último párrafo (los fallos/veredictos de las
    respuestas cortas suelen ir al final)."""
    lines = text.splitlines()
    idx = None
    for i, l in enumerate(lines):
        if _is_conclusion_heading(l):
            idx = i  # el último encabezado de conclusión gana
    if idx is not None:
        body = []
        for l in lines[idx + 1:]:
            if _MD_HEADING.match(l.strip()) and _is_conclusion_heading(l):
                break
            body.append(l)
        chunk = "\n".join(body).strip()
        if chunk:
            return chunk
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    if blocks:
        return blocks[-1]
    return text.strip()


def build_speech_text(text: str) -> str:
    """Pipeline completo: aisla la conclusión y limpia el markdown, acotado a
    MAX_TEXT_LENGTH. Se llama en la ruta /api/tts antes de sintetizar."""
    concl = extract_conclusion(text)
    cleaned = clean_for_speech(concl)
    return cleaned[:MAX_TEXT_LENGTH]
