import os
import re
import json
import logging
import datetime
from typing import Optional
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

logger = logging.getLogger(__name__)

NVIDIA_API_KEY_ENV = "NVIDIA_API_KEY"
NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1"
REQUEST_TIMEOUT = 60


# ---------------------------------------------------------------------------
# Intent classifier: decide if user message requires full technical analysis
# or is a casual / conversational message.
# ---------------------------------------------------------------------------
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
    r'pivot|fibonacci|fibo|wyckoff|elliott|'
    r'qué (ves|opinas|piensas|recomiendas|sugieres)|'
    r'how.?is|what.?about|what.?do you (think|see|recommend)|'
    r'como (va|ves|esta|está)|que tal va|dame|give me|hazme|do a|'
    r'predic|forecast|pronóstico|pronostico|outlook|'
    r'resumen|summary|reporte|report'
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

AVAILABLE_MODELS = {
    "nvidia-nemotron": {
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "name": "Nemotron 3 Nano Omni",
        "provider": "NVIDIA",
        "free": True,
    },
    "meta-muse": {
        "id": "meta/muse-glimmer-30b",
        "name": "Muse Glimmer 30B",
        "provider": "Meta",
        "free": True,
    },
    "google-diffusiongemma": {
        "id": "google/diffusiongemma-26b-a4b-it",
        "name": "DiffusionGemma 26B",
        "provider": "Google",
        "free": True,
    },
}


class NvidiaChatError(Exception):
    """Custom exception to carry specific error info from NVIDIA API."""
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def get_trading_system_prompt(indicator_data=None, global_context=None, model_name="AI", intent="analysis"):
    """Build a specialized trading agent system prompt.

    Args:
        indicator_data: Live market data dict (only injected for 'analysis'/'ambiguous' intents).
        global_context: Cross-session memory string.
        model_name: Display name of the AI model.
        intent: 'analysis' | 'casual' | 'ambiguous' — controls data injection and behavior.
    """

    # ── IDENTITY (always present) ──
    identity = (
        f"You are a SENIOR QUANTITATIVE CRYPTO STRATEGIST and PROFESSIONAL TRADER with 15+ years of experience in global markets. "
        f"You are operating as the AI model {model_name} inside the SYNAPSE TERMINAL, a next-gen technical analysis interface. "
        "Your expertise covers Market Microstructure, Price Action (PA), Wyckoff Theory, Elliott Wave Principle, and advanced Technical Indicators. "
        "You specialize in identifying high-probability setups and managing risk in the volatile crypto market.\n\n"
    )

    # ── PERSONALITY & RULES (always present) ──
    personality = (
        "=== PERSONALITY & RULES ===\n"
        "- Respond in the SAME LANGUAGE as the user.\n"
        "- You are professional, charismatic, confident, and approachable. Think of yourself as a senior trader at an institutional desk who is also easy to talk to.\n"
        "- Use professional trading terminology naturally when discussing markets ('liquidity sweep', 'order block', 'fair value gap', 'confluence').\n"
        "- NEVER include generic legal disclaimers like 'hypothetical trade ideas', 'not investment advice', 'consult a financial advisor', or 'do your own research' - they break the user experience and are forbidden.\n"
    )

    # ── INTENT-SPECIFIC BEHAVIOR ──
    if intent == 'casual':
        # Conversational mode — NO data, NO analysis framework
        base = identity + personality
        base += (
            "\n=== CURRENT MODE: CONVERSATIONAL ===\n"
            "The user is having a casual conversation — greeting, asking about you, or chatting. "
            "DO NOT perform any technical analysis. DO NOT reference indicators, charts, or market data. "
            "Respond naturally and warmly, like a senior trader colleague during a coffee break. "
            "Keep responses SHORT (2-4 sentences max). Be personable but always maintain your professional trader identity.\n"
            "If the user asks who you are or what you do, briefly introduce yourself as a quantitative trading strategist "
            "embedded in the SYNAPSE TERMINAL, ready to analyze any asset when they need it.\n"
            "If the user seems to want analysis, tell them you're ready — just ask about a specific asset or say 'analiza' and you'll deliver a full institutional report.\n"
        )
        if global_context:
            base += f"\n=== CROSS-SESSION CONTEXT (MEMORY) ===\n"
            base += f"The user has other active sessions: {global_context}. Use this for continuity if referenced.\n"
        return base

    # ── ANALYSIS or AMBIGUOUS mode ──
    base = identity

    if intent == 'ambiguous':
        base += (
            "=== INTENT DETECTION ===\n"
            "The user's message is ambiguous — it may or may not be requesting analysis. "
            "READ THE USER'S MESSAGE CAREFULLY. If it's clearly conversational (greeting, personal question, thanks), "
            "respond naturally and briefly without analysis. If it mentions or implies a market, asset, price, or technical concept, "
            "perform a full professional analysis using the data below.\n\n"
        )

    base += (
        "Your task is to provide a PROFESSIONAL TRADING ANALYSIS based EXCLUSIVELY on the live market data provided below. "
        "Do not hallucinate data. If a specific value is 'N/A', ignore it in your analysis.\n\n"
    )

    if global_context:
        base += f"=== CROSS-SESSION CONTEXT (MEMORY) ===\n"
        base += f"The user has other active analysis sessions: {global_context}. "
        base += f"If the user refers to past discussions or other symbols, use this overview to maintain continuity.\n\n"

    base += personality
    base += (
        "- **BE HIGHLY STRUCTURED AND ELABORATE**: Your answers must look like a premium quantitative report from an institutional trading desk. Use beautiful, organized formatting.\n"
        "- Be objective, precise, and highly analytical. Back up claims with the data provided.\n"
        "- NEVER use emojis in technical analyses, headers, tables, or strategies. Keep an austere, institutional terminal style.\n"
        "- **STEP-BY-STEP ADHERENCE**: If the user's prompt specifies a step-by-step structure (e.g. '### PASO 1:', '### PASO 2:', etc.), ALWAYS FOLLOW THE EXACT STEP-BY-STEP STRUCTURE REQUESTED BY THE USER, rendering each step clearly with its header, bullet points, and quantitative data.\n"
        "- At the end of each technical analysis, add a single confident line: 'Análisis basado en datos de mercado en tiempo real y análisis técnico externo.'\n\n"
        "=== PROFESSIONAL ANALYSIS FRAMEWORK ===\n"
        "When performing an analysis without a custom requested structure, you MUST structure your response using this default framework (NO emojis):\n"
        "### Resumen Ejecutivo & Señal de Mercado\n"
        "Un panorama conciso de 1-2 oraciones del estado del mercado, contrastando el **MARKET SIGNAL** actual (COMPRA / VENTA / NEUTRAL) y el ratio de flujo de presión compradora/vendedora.\n\n"
        "### Mapa de Liquidez & Order Book (Bubble Map)\n"
        "Analiza la distribución del libro de órdenes: dominancia compradora vs vendedora, volumen acumulado y los principales muros de liquidez (clusters de soporte en bids y de resistencia en asks) identificados en el Bubble Map.\n\n"
        "### Desglose Técnico Completo\n"
        "Analiza detalladamente todos los indicadores suministrados:\n"
        "- **Estructura & Tendencia:** EMAs (50, 100, 200) y Price Action.\n"
        "- **Momentum & Timing:** RSI (14), Stochastic RSI, Oscilador Estocástico (%K / %D), MACD (línea, señal e histograma), CCI (20) y MFI (14 - Money Flow Index institucional).\n"
        "- **Volatilidad & Fuerza:** Bandas de Bollinger (20, 2σ) y ADX (14) con sus fuerzas direccionales (+DI / -DI).\n\n"
        "### Niveles Clave (Soporte & Resistencia)\n"
        "Declara claramente las zonas inmediatas de Soporte (S1, S2, S3) y Resistencia (R1, R2, R3) basadas en Pivots y reforzadas por la liquidez del Order Book.\n\n"
        "### Recomendación Estratégica\n"
        "Provee asesoramiento altamente accionable (COMPRA / VENTA / MANTENER / ESPERAR) con zonas lógicas de Entrada, Stop Loss (SL) y objetivos de Take Profit (TP) basados en riesgo/beneficio.\n\n"
    )

    if indicator_data:
        market = indicator_data.get('market', 'crypto')
        hist = indicator_data.get('history') or {}
        times = hist.get('times') or []
        last_ts = times[-1] if times else None
        opens = hist.get('opens') or []
        highs = hist.get('highs') or []
        lows = hist.get('lows') or []
        closes = hist.get('closes') or []

        # MARKET SIGNAL computation (identico a RecommendationCard)
        buy_sig = int(indicator_data.get('buySignals') or 0)
        sell_sig = int(indicator_data.get('sellSignals') or 0)
        neutral_sig = int(indicator_data.get('neutralSignals') or 0)
        total_sig = buy_sig + sell_sig + neutral_sig
        if buy_sig > sell_sig:
            market_signal = "COMPRA"
            market_signal_summary = "Predominancia alcista de corto plazo"
        elif sell_sig > buy_sig:
            market_signal = "VENTA"
            market_signal_summary = "Predominancia bajista de corto plazo"
        else:
            market_signal = "NEUTRAL"
            market_signal_summary = "Consolidación neutral de mercado"

        active_total = buy_sig + sell_sig
        if active_total > 0:
            bullish_flow = (buy_sig / active_total) * 100
            bearish_pressure = (sell_sig / active_total) * 100
        elif total_sig > 0:
            bullish_flow = (buy_sig / total_sig) * 100
            bearish_pressure = (sell_sig / total_sig) * 100
        else:
            bullish_flow = 50.0
            bearish_pressure = 50.0

        # LIQUIDITY BUBBLE MAP & ORDER BOOK
        buyer_pct = indicator_data.get('buyerPercent')
        buyer_pct_str = f"{float(buyer_pct):.1f}%" if buyer_pct is not None else f"{bullish_flow:.1f}%"
        bid_vol = indicator_data.get('bidVolume')
        ask_vol = indicator_data.get('askVolume')
        best_bid = indicator_data.get('bestBid')
        best_ask = indicator_data.get('bestAsk')
        ob_source = indicator_data.get('orderBookSource', 'order_book' if market == 'crypto' else 'volume_proxy')
        depth_raw = indicator_data.get('depthRaw')
        liquidity_walls = _format_liquidity_clusters(depth_raw, decimals=2)

        data_block = "\n[EXACT MARKET DATA FEED & LIVE INDICATORS - SOURCE OF TRUTH]\n"
        data_block += f"| CORE METRIC | VALUE | CONTEXT |\n"
        data_block += f"| :--- | :--- | :--- |\n"
        data_block += f"| Symbol & Market | {indicator_data.get('symbol', 'N/A')} ({market.upper()}) | Trading pair / asset |\n"
        data_block += f"| Timeframe | {indicator_data.get('timeframe', 'N/A')} | Candle interval (all indicator values correspond to this timeframe) |\n"
        data_block += f"| Current Spot Price | ${_fmt(indicator_data.get('precio'))} | Live Spot Price |\n"
        data_block += f"| 24h Volume | {_format_compact(indicator_data.get('volumen'))} | {'USDT turnover' if market == 'crypto' else 'Shares volume'} |\n"
        data_block += f"| MARKET SIGNAL | **{market_signal}** | {market_signal_summary} |\n"
        data_block += f"| Signal Counts | {buy_sig} BUY | {neutral_sig} HOLD | {sell_sig} SELL | Total Signals: {total_sig} |\n"
        data_block += f"| Flow Ratio | {bullish_flow:.1f}% Bullish Flow | {bearish_pressure:.1f}% Bearish Pressure | Order flow pressure |\n"
        data_block += f"| LIQUIDITY BUBBLE MAP | Buyer Dominance: {buyer_pct_str} | Depth Source: {ob_source} |\n"
        if bid_vol is not None and ask_vol is not None:
            data_block += f"| Order Book Bid/Ask Vol | Bids: {_format_compact(bid_vol)} USDT | Asks: {_format_compact(ask_vol)} USDT | Aggregate 40-level depth |\n"
        if best_bid is not None and best_ask is not None:
            data_block += f"| Best Bid / Best Ask | ${_fmt(best_bid)} / ${_fmt(best_ask)} | Spread: {abs(float(best_ask) - float(best_bid)):.4f} USDT |\n"
        if liquidity_walls:
            data_block += f"| Top Bid Liquidity Walls | {liquidity_walls['top_bids']} | Major support/demand zones in Bubble Map |\n"
            data_block += f"| Top Ask Liquidity Walls | {liquidity_walls['top_asks']} | Major resistance/supply zones in Bubble Map |\n"
        data_block += f"| Last Candle OHLC | O: {_fmt(opens[-1] if opens else None)} H: {_fmt(highs[-1] if highs else None)} L: {_fmt(lows[-1] if lows else None)} C: {_fmt(closes[-1] if closes else None)} | Forming candle |\n"
        data_block += f"| RSI (14) | {_fmt(indicator_data.get('rsi'))} | Momentum Oscillator (OS <30, OB >70) |\n"
        data_block += f"| Stoch RSI (14, 3, 3) | {_fmt(indicator_data.get('rsiStoch'))} | Stochastic RSI (OS <20, OB >80) |\n"
        data_block += f"| Stochastic (14, 3, 3) | %K: {_fmt(indicator_data.get('stochK'))} / %D: {_fmt(indicator_data.get('stochD'))} | Fast/Slow Stochastic Oscillator |\n"
        data_block += f"| CCI (20) | {_fmt(indicator_data.get('cci'))} | Commodity Channel Index (OS <-100, OB >100) |\n"
        data_block += f"| MFI (14) Money Flow | {_fmt(indicator_data.get('mfi'))} | Money Flow Index (Accumulation/Inflow >80, Distribution/Outflow <20) |\n"
        data_block += f"| MACD (12, 26, 9) | Line: {_fmt(indicator_data.get('macdValue'))} | Signal: {_fmt(indicator_data.get('macdSignal'))} | MACD trend line & trigger line |\n"
        data_block += f"| MACD Histogram (12, 26, 9)| {_fmt(indicator_data.get('macdHistogram'))} | Momentum acceleration (>0 Bullish, <0 Bearish) |\n"
        data_block += f"| ADX (14) Trend Strength | {_fmt(indicator_data.get('adx'))} | Trend Strength (>25 Trend, <25 Consolidation) |\n"
        data_block += f"| ADX Directional Force | +DI: {_fmt(indicator_data.get('plusDi'))} / -DI: {_fmt(indicator_data.get('minusDi'))} | Directional Movement Index |\n"
        data_block += f"| Bollinger Bands (20, 2σ) | Upper: ${_fmt(indicator_data.get('bbUpper'))} | Mid: ${_fmt(indicator_data.get('bbMiddle'))} | Lower: ${_fmt(indicator_data.get('bbLower'))} | Volatility envelope |\n"
        data_block += f"| Moving Averages | EMA50: ${_fmt(indicator_data.get('ema50'))} | EMA100: ${_fmt(indicator_data.get('ema100'))} | EMA200: ${_fmt(indicator_data.get('ema200'))} | Trend bias & dynamic S/R |\n"
        data_block += f"| Support Levels (Pivots) | S1: ${_fmt(indicator_data.get('s1'))} | S2: ${_fmt(indicator_data.get('s2'))} | S3: ${_fmt(indicator_data.get('s3'))} | Key dynamic support floors |\n"
        data_block += f"| Resistance Levels (Pivots)| R1: ${_fmt(indicator_data.get('r1'))} | R2: ${_fmt(indicator_data.get('r2'))} | R3: ${_fmt(indicator_data.get('r3'))} | Key dynamic resistance ceilings |\n"
        
        data_block += "\nUse THESE EXACT VALUES for your analysis. You MUST synthesize the MARKET SIGNAL and the LIQUIDITY BUBBLE MAP along with ALL technical indicators above.\n"
        base += data_block

        # Contexto multi-temporalidad: el MISMO activo en todas las temporalidades
        # con los mismos periodos. Permite evaluar alineacion/divergencia de
        # tendencia entre marcos (confluencia MTF).
        mtf = indicator_data.get('multi_timeframe') or []
        if mtf:
            base += "\n=== MULTI-TIMEFRAME CONTEXT (same asset, all OTHER timeframes) ===\n"
            base += "All rows use the same periods: RSI(14) | Stoch K/D(14,3,3) | MACD Hist(12,26,9) | ADX(14) | CCI(20) | BB(20,2σ) | EMA50. Signals = BUY/SELL/NEUTRAL counts.\n"
            base += "TF  | Price      | RSI    | StochK/D   | MACD Hist | ADX    | CCI      | BB pos | vs EMA50 | B/S/N  | Last candle (UTC)\n"
            for s in mtf:
                base += (
                    f"{s.get('timeframe', '?'):>3} | {_fmt(s.get('precio')):>10} | "
                    f"{_fmt(s.get('rsi')):>6} | {_fmt(s.get('stochK'))}/{_fmt(s.get('stochD'))} | "
                    f"{_fmt(s.get('macdHistogram')):>7} | {_fmt(s.get('adx')):>6} | "
                    f"{_fmt(s.get('cci')):>8} | {_bb_pos(s.get('precio'), s.get('bbUpper'), s.get('bbLower')):>6} | "
                    f"{_pct(s.get('precio'), s.get('ema50')):>8} | "
                    f"{s.get('buySignals', '?')}/{s.get('sellSignals', '?')}/{s.get('neutralSignals', '?')} | "
                    f"{_fmt_ts(s.get('ts'))}\n"
                )
            base += "\nUse this to judge trend alignment: if the same signal repeats across most timeframes, the setup is stronger (multi-timeframe confluence). If timeframes conflict, say so.\n"

        # Series historicas recientes: el agente ve la EVOLUCION de cada
        # indicador (ultimos 30 candles, del mas antiguo al mas nuevo) para
        # detectar divergencias, cruces y direccion real del movimiento.
        if closes:
            base += "\n=== RECENT INDICATOR SERIES (last 10 candles, oldest → newest) ===\n"
            base += f"PRICE: {_format_recent(hist, 'closes')}\n"
            base += f"VOLUME (USDT per candle): {_format_recent_volume(hist)}\n"
            base += f"RSI(14): {_format_recent(hist, 'rsi')}\n"
            base += f"MACD (12,26,9): {_format_recent(hist, 'macd')} | SIGNAL (12,26,9): {_format_recent(hist, 'macd_signal')}\n"
            base += f"MACD HISTOGRAM (12,26,9): {_format_recent(hist, 'macd_hist')}\n"
            base += f"STOCH K/D (14,3,3): {_format_recent(hist, 'stochK')} | {_format_recent(hist, 'stochD')}\n"
            base += f"STOCH RSI K (14,3,3): {_format_recent(hist, 'rsiStoch')}\n"
            base += f"CCI (20): {_format_recent(hist, 'cci')} | MFI (14): {_format_recent(hist, 'mfi')}\n"
            base += f"ADX (14): {_format_recent(hist, 'adx')}\n"
            base += f"BB (20,2σ) UPPER: {_format_recent(hist, 'bb_upper')} | MIDDLE: {_format_recent(hist, 'bb_middle')} | LOWER: {_format_recent(hist, 'bb_lower')}\n"
            base += f"EMA 50: {_format_recent(hist, 'ema50')} | EMA 100: {_format_recent(hist, 'ema100')} | EMA 200: {_format_recent(hist, 'ema200')}\n"
            base += "\nUse these series to confirm trends, spot crossovers, divergences, and momentum shifts. They are the source of truth for the exact numbers above.\n"

    return base


def _format_liquidity_clusters(depth_raw, decimals=2):
    """Extrae los principales muros de liquidez del Bubble Map para el prompt del agente."""
    if not depth_raw or not isinstance(depth_raw, dict):
        return None
    bids = depth_raw.get('bids') or []
    asks = depth_raw.get('asks') or []
    if not bids and not asks:
        return None
    try:
        bid_clusters = sorted(
            [(float(p), float(q) * float(p)) for p, q in bids if float(q) > 0],
            key=lambda x: x[1],
            reverse=True
        )[:3]
        ask_clusters = sorted(
            [(float(p), float(q) * float(p)) for p, q in asks if float(q) > 0],
            key=lambda x: x[1],
            reverse=True
        )[:3]
        bid_str = ", ".join(f"${p:.{decimals}f} ({_format_compact(v)} USDT)" for p, v in bid_clusters) if bid_clusters else "N/A"
        ask_str = ", ".join(f"${p:.{decimals}f} ({_format_compact(v)} USDT)" for p, v in ask_clusters) if ask_clusters else "N/A"
        return {"top_bids": bid_str, "top_asks": ask_str}
    except Exception as e:
        logger.warning(f"[NvidiaChat] Error calculando clusters de liquidez: {e}")
        return None


def _format_recent(history, key, decimals=2):
    vals = history.get(key)
    if not vals:
        return 'N/A'
    # Escala de decimales segun la magnitud: PEPE (~0.00001) necesita 8
    # decimales para no redondearse a 0.00 y perder sentido para el agente.
    sample = [v for v in vals if v is not None]
    if sample:
        max_abs = max(abs(float(v)) for v in sample)
        if max_abs < 0.0001:
            decimals = 8
        elif max_abs < 0.01:
            decimals = 6
        elif max_abs < 1:
            decimals = 4
        elif max_abs < 100:
            decimals = 3
    out = []
    for v in vals[-10:]:
        if v is None:
            out.append('N/A')
        else:
            try:
                out.append(f"{float(v):.{decimals}f}")
            except (TypeError, ValueError):
                out.append(str(v))
    return ', '.join(out)


def _format_compact(value):
    try:
        f = float(value)
    except (TypeError, ValueError):
        return 'N/A'
    if f >= 1e9:
        return f"{f / 1e9:.2f}B"
    if f >= 1e6:
        return f"{f / 1e6:.2f}M"
    if f >= 1e3:
        return f"{f / 1e3:.2f}K"
    return f"{f:.0f}"


def _format_recent_volume(history):
    vals = history.get('volumes')
    if not vals:
        return 'N/A'
    return ', '.join(_format_compact(v) for v in vals[-10:])


# Valor None-safe para la tabla: 'N/A' en vez de 'None'
def _val(data, key):
    v = data.get(key)
    return 'N/A' if v is None else v


# Formatea un valor con decimales dinamicos segun la magnitud (PEPE ~0.00001
# necesita 8 decimales para no redondearse a 0.00).
def _fmt(value, decimals=2):
    if value is None:
        return 'N/A'
    try:
        f = float(value)
    except (TypeError, ValueError):
        return str(value)
    a = abs(f)
    if a < 0.0001:
        decimals = 8
    elif a < 0.01:
        decimals = 6
    elif a < 1:
        decimals = 4
    elif a < 100:
        decimals = 3
    return f"{f:.{decimals}f}"


# Cambio porcentual: (value / base - 1) * 100
def _pct(value, base):
    if value is None or base is None:
        return 'N/A'
    try:
        return f"{(float(value) / float(base) - 1) * 100:.2f}%"
    except (TypeError, ValueError, ZeroDivisionError):
        return 'N/A'


# Posicion del precio dentro de las bandas de Bollinger (0% = banda inferior,
# 100% = banda superior).
def _bb_pos(price, upper, lower):
    if price is None or upper is None or lower is None:
        return 'N/A'
    try:
        diff = float(upper) - float(lower)
        if diff <= 0:
            return 'N/A'
        return f"{(float(price) - float(lower)) / diff * 100:.0f}%"
    except (TypeError, ValueError):
        return 'N/A'


# Formatea un timestamp en ms a hora America/Chicago (Central Time)
def _fmt_ts(ms):
    if not ms:
        return 'N/A'
    try:
        utc_dt = datetime.datetime.utcfromtimestamp(int(ms) / 1000).replace(tzinfo=datetime.timezone.utc)
        ct_offset = datetime.timezone(datetime.timedelta(hours=-5))
        local_dt = utc_dt.astimezone(ct_offset)
        return local_dt.strftime('%Y-%m-%d %H:%M CT')
    except Exception:
        return str(ms)



def get_api_key() -> Optional[str]:
    key = os.environ.get(NVIDIA_API_KEY_ENV)
    if not key:
        logger.warning("NVIDIA_API_KEY not set in environment")
    return key


def build_messages(prompt: str, system_prompt: str, history: list | None = None) -> list[dict]:
    messages = [{"role": "system", "content": system_prompt}]
    if history:
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": prompt})
    return messages


def nvidia_chat(
    prompt: str,
    model_key: str = "nvidia-nemotron",
    temperature: float = 0.3,
    max_tokens: int = 4096,
    history: list | None = None,
    global_context: str | None = None,
    indicator_data: dict | None = None,
    intent: str = "analysis",
) -> str:
    """Call the NVIDIA API. Returns the response text on success.
    Raises NvidiaChatError with a descriptive message on failure."""
    api_key = get_api_key()
    if not api_key:
        raise NvidiaChatError("NVIDIA_API_KEY no está configurado en el servidor.", code="NO_API_KEY")

    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        raise NvidiaChatError(f"Modelo desconocido: {model_key}", code="UNKNOWN_MODEL")
    model_id = model_config["id"]
    model_name = model_config["name"]
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))

    # For casual intent, don't inject indicator data into the prompt
    effective_data = indicator_data if intent in ('analysis', 'ambiguous') else None
    system_prompt = get_trading_system_prompt(effective_data, global_context, model_name, intent=intent)

    # Casual conversations get lower max_tokens (shorter responses)
    effective_max_tokens = 512 if intent == 'casual' else max_tokens
    url = f"{NVIDIA_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = json.dumps({
        "model": model_id,
        "messages": build_messages(prompt, system_prompt, history),
        "temperature": temperature,
        "max_tokens": effective_max_tokens,
    }).encode("utf-8")

    req = Request(url, data=payload, headers=headers, method="POST")

    try:
        with urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if not choices:
                logger.error(f"NVIDIA API returned no choices: {data}")
                raise NvidiaChatError("El modelo no devolvió respuesta. Intenta de nuevo.", code="NO_CHOICES")
            content = choices[0].get("message", {}).get("content", "")
            if not content or not content.strip():
                raise NvidiaChatError("El modelo devolvió una respuesta vacía.", code="EMPTY_RESPONSE")
            return content.strip()
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.error(f"NVIDIA API HTTP {e.code} for model {model_id}: {body}")
        # Parse NVIDIA error body for a user-friendly message
        detail = ""
        try:
            err_json = json.loads(body)
            detail = err_json.get("detail", "") or err_json.get("message", "") or err_json.get("error", "")
            if isinstance(detail, dict):
                detail = detail.get("message", str(detail))
        except Exception:
            detail = body[:200] if body else ""
        raise NvidiaChatError(
            f"Error del modelo {model_name} (HTTP {e.code}): {detail or 'Error desconocido del API'}",
            code=f"HTTP_{e.code}"
        )
    except URLError as e:
        logger.error(f"NVIDIA API request failed for {model_id}: {e.reason}")
        raise NvidiaChatError(f"No se pudo conectar al API de NVIDIA: {e.reason}", code="URL_ERROR")
    except json.JSONDecodeError as e:
        logger.error(f"NVIDIA API invalid JSON for {model_id}: {e}")
        raise NvidiaChatError("Respuesta inválida del API de NVIDIA.", code="JSON_ERROR")
    except NvidiaChatError:
        raise
    except Exception as e:
        logger.exception(f"Unexpected NVIDIA API error for {model_id}: {e}")
        raise NvidiaChatError(f"Error inesperado: {str(e)}", code="UNEXPECTED")
