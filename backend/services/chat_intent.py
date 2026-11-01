"""Clasificador de intención del mensaje del usuario.

Determina si una pregunta requiere análisis técnico completo ('analysis'),
es conversación casual ('casual') o es ambigua ('ambiguous'), para que el
orquestador decida si inyecta datos de mercado en el prompt.
"""

import re

# Palabras/frases que ACTIVAN análisis técnico completo
_ANALYSIS_TRIGGERS = re.compile(
    r'\b('
    r'anali[zs]|análisis|technical|analisis|trade|trading|opera|operar|operacion|'
    r'compra[rs]?|vend[eo]r?|venta|sell|buy|long|short|'
    r'soporte|resistencia|support|resistance|'
    r'rsi|macd|ema|bollinger|adx|cci|mfi|stoch|indicador|indicator|'
    r'señal|signal|tendencia|trend|momentum|'
    r'entrada|salida|entry|exit|stop.?loss|take.?profit|tp|sl|'
    r'precio|price|target|objetivo|'
    r'alcista|bajista|bullish|bearish|'
    r'mercado|market|cripto|crypto|'
    r'bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge|xrp|ripple|bnb|binance|pepe|shib|shiba|'
    r'grafico|gráfico|chart|candle|vela|'
    r'liquidez|liquidity|volumen|volume|'
    r'order.?blocks?|fair.?value.?gaps?|fvg|imbalances?|ineficiencias?|'
    r'pivot|fibonacci|fibo|wyckoff|elliott|'
    r'qué (ves|opinas|piensas|recomiendas|sugieres)|'
    r'how.?is|what.?about|what.?do you (think|see|recommend)|'
    r'como (va|ves|esta|está)|que tal va|dame|give me|hazme|do a|'
    r'predic|forecast|pronóstico|pronostico|outlook|'
    r'resumen|summary|reporte|report|'
    r'record|recuerda|acord|acuerd|anterior|pasad|conversaci|sesion|sesión|charla|hablam|dijist|mencionast|memoria|remember|previous'
    r')\b',
    re.IGNORECASE | re.UNICODE
)

# Patrones que indican conversación casual (saludos, preguntas personales, etc.)
_CASUAL_PATTERNS = re.compile(
    r'^('
    r'(hola|hey|hi|hello|buenas?|saludos?|qué tal|que tal|buenos dias|buenas tardes|buenas noches|sup|yo|ey)[\s!?.,]*$|'
    r'(cómo estás|como estas|how are you|que onda|qué onda|que pedo|cómo vas|como vas|cómo te va|como te va)[\s!?.,]*$|'
    r'(quién eres|quien eres|who are you|qué eres|que eres|what are you|qué haces|que haces|what do you do)[\s!?.,]*$|'
    r'(gracias|thanks|thank you|thx|ty|de nada|ok|okay|vale|bien|cool|genial|perfecto|listo|nice)[\s!?.,]*$|'
    r'(adiós|adios|bye|chao|chau|nos vemos|hasta luego|see you|later)[\s!?.,]*$|'
    r'(jaja|haha|lol|xd|😂|😄|🤣|👍|🔥)[\s!?.,]*$|'
    r'(cuéntame de ti|cuentame de ti|tell me about yourself|presentate|preséntate|introduce yourself)[\s!?.,]*$'
    r')',
    re.IGNORECASE | re.UNICODE
)


def classify_intent(prompt: str) -> str:
    """Classify user intent as 'analysis', 'casual', or 'ambiguous'.

    - 'casual': greetings, personal questions, thanks, etc. → NO data injection
    - 'analysis': explicit request for trading analysis → FULL data injection
    - 'ambiguous': mixed or unclear → inject data but tell model to decide
    """
    cleaned = prompt.strip()

    # Very short message without analysis keywords → likely casual
    if len(cleaned) < 4:
        return 'casual'

    # Check for explicit casual patterns first
    if _CASUAL_PATTERNS.match(cleaned):
        return 'casual'

    # Check for analysis triggers
    if _ANALYSIS_TRIGGERS.search(cleaned):
        return 'analysis'

    # Short messages without triggers are likely casual
    if len(cleaned.split()) <= 5:
        return 'casual'

    # Longer messages without explicit triggers → ambiguous (let model decide)
    return 'ambiguous'
