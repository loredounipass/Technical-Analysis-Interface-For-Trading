"""Normalizador de numeros a palabras en espanol para el TTS.

El motor de voz pronuncia mal cifras sueltas ("1875.03"), asi que antes de
sintetizar un texto detectado como es-es se convierten los numeros a su lectura
en palabras. Utilidad pura de texto, sin dependencias del resto del TTS.
"""

import re


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
