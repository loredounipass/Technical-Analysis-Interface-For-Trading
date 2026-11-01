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
REQUEST_TIMEOUT = 180


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

AVAILABLE_MODELS = {
    "nvidia-nemotron": {
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "name": "Nemotron 3 Nano Omni",
        "provider": "NVIDIA",
        "free": True,
        "timeout": 180,
    },
    "nvidia-nemotron-bolt": {
        "id": "nvidia/nemotron-3.5-bolt-e4b",
        "name": "Nemotron 3.5 Bolt E4B",
        "provider": "NVIDIA",
        "free": True,
        "timeout": 180,
    },
    "nvidia-nemotron-ultra": {
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "name": "Nemotron 3 Ultra 550B",
        "provider": "NVIDIA",
        "free": True,
        "timeout": 180,
    },
    "meta-muse": {
        "id": "meta/muse-glimmer-30b",
        "name": "Muse Glimmer 30B",
        "provider": "Meta",
        "free": True,
        "timeout": 180,
    },
    "google-diffusiongemma": {
        "id": "google/diffusiongemma-26b-a4b-it",
        "name": "DiffusionGemma 26B",
        "provider": "Google",
        "free": True,
        "timeout": 180,
    },
}


# ---------------------------------------------------------------------------
# MCP-style Tool Definitions & History Search Function
# ---------------------------------------------------------------------------
CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_chat_history",
            "description": "Busca en el historial de sesiones y conversaciones pasadas del usuario. Úsala siempre que el usuario pregunte por conversaciones anteriores, niveles o recomendaciones pasadas, o cuando necesites recordar detalles de sesiones previas.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Término, activo o concepto clave a buscar en el historial (ej: 'soporte ETH', 'estrategia', 'invalidation', 'BTC')"
                    },
                    "symbol": {
                        "type": "string",
                        "description": "Símbolo del activo si la búsqueda es específica de una moneda o acción (ej: 'ETHUSDT', 'SOLUSDT', 'AAPL')"
                    }
                },
                "required": ["query"]
            }
        }
    }
]


def search_chat_history(
    query: str,
    symbol: Optional[str] = None,
    all_sessions: Optional[list] = None,
    current_session_id: Optional[str] = None
) -> dict:
    """Busca en el historial de sesiones pasadas fragmentos relevantes de usuario y asistente."""
    if not all_sessions:
        return {
            "found_records": 0,
            "message": "No se encontraron sesiones previas guardadas en el historial."
        }

    query_tokens = [t.lower() for t in re.split(r'[\s,;.?!]+', query) if len(t) >= 2]
    symbol_clean = symbol.upper().replace("/", "").replace("-", "") if symbol else None

    matches = []

    for session in all_sessions:
        s_id = str(session.get("id", ""))
        s_symbol = str(session.get("symbol", "")).upper().replace("/", "")
        s_messages = session.get("messages", [])

        symbol_matches = bool(symbol_clean and (symbol_clean in s_symbol or s_symbol in symbol_clean))

        for idx, msg in enumerate(s_messages):
            if s_id == str(current_session_id) and idx >= len(s_messages) - 1:
                continue

            content = msg.get("content", "")
            role = msg.get("role", "")
            if not content or role not in ("user", "assistant"):
                continue

            # Omitir saludo generico inicial
            if idx == 0 and role == "assistant" and "¡Hola!" in content:
                continue

            ts = msg.get("timestamp")
            date_str = ""
            if ts:
                try:
                    date_str = datetime.datetime.fromtimestamp(ts / 1000.0).strftime("%Y-%m-%d %H:%M")
                except Exception:
                    date_str = ""

            content_lower = content.lower()
            score = 0
            for token in query_tokens:
                if token in content_lower:
                    score += 1
                if token in s_symbol.lower():
                    score += 1.5

            if symbol_matches:
                score += 2

            if score > 0:
                speaker = "Usuario" if role == "user" else "Woody AI"
                clean_content = content.strip().replace("\n", " ")
                snippet = f"[{date_str or 'Sesión previa'}] [{s_symbol or 'General'}] {speaker}: \"{clean_content}\""
                matches.append({
                    "session_id": s_id,
                    "symbol": s_symbol,
                    "score": score,
                    "snippet": snippet
                })

    matches.sort(key=lambda x: x["score"], reverse=True)
    top = matches

    if not top:
        return {
            "found_records": 0,
            "query": query,
            "message": f"Búsqueda finalizada. No se encontraron mensajes relacionados con '{query}' en el historial."
        }

    return {
        "found_records": len(top),
        "query": query,
        "results": [m["snippet"] for m in top]
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
        f"You are a SENIOR INSTITUTIONAL CRYPTO TRADER and QUANTITATIVE STRATEGIST operating as {model_name} inside the SYNAPSE TERMINAL. "
        "Apply Wall Street-style institutional discipline: evidence before narrative, independent judgment, scenario analysis, execution awareness, and risk first. "
        "Your expertise includes market microstructure, order book and liquidity analysis, Price Action, Wyckoff, multi-timeframe confluence, "
        "technical indicators, volatility, derivatives positioning, position sizing, and portfolio risk. "
        "Use a specialist concept only when it is relevant and supported by the available data; never imply access to missing institutional, derivatives, on-chain, news, or external feeds.\n\n"
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
            "answer that specific question using the adaptive response-depth rules below; do not default to a full report.\n\n"
        )

    base += (
        "Your task is to answer the user's ACTUAL QUESTION. Base every market-specific claim exclusively on the conversation and the market data below. "
        "For general educational questions, you may explain established trading concepts without pretending they are live market facts. "
        "NEVER fabricate prices, calculations, patterns, news, external analysis, timestamps, market events, or unavailable data. "
        "If a value is 'N/A' or absent, treat it as unavailable (not zero); when it is essential, explicitly say what is missing and limit the conclusion. "
        "Clearly distinguish observed data, your interpretation, and unknowns. Do not claim real-time verification or external research unless it is actually present in the context.\n\n"
    )

    if global_context:
        base += f"=== CROSS-SESSION CONTEXT (MEMORY) ===\n"
        base += f"The user has other active analysis sessions: {global_context}. "
        base += f"If the user refers to past discussions or other symbols, use this overview to maintain continuity.\n\n"

    base += (
        "=== MCP MEMORY TOOL CAPABILITY ===\n"
        "You are equipped with the tool `search_chat_history`. "
        "Whenever the user asks about what was discussed, analyzed, agreed, or recommended in previous sessions or earlier in the chat "
        "(e.g., 'qué dijiste ayer', 'recuerdas el soporte de ETH', 'en la sesión previa', 'como acordamos antes'), "
        "YOU MUST CALL `search_chat_history` to query past messages and retrieve the real context before answering. "
        "Do NOT guess or say you don't remember without searching first.\n\n"
    )
    base += personality
    base += (
        "=== ADAPTIVE RESPONSE DEPTH ===\n"
        "Choose the response depth from the user's intent, NOT from the mere presence of trading keywords. Answer first; do not make the user extract an answer from a report.\n"
        "1. CASUAL OR GENERAL/EDUCATIONAL QUESTION: Respond naturally and concisely (normally 1-4 sentences or a few short bullets). "
        "Do NOT produce a market report, list indicators, inject live data, or propose a trade unless the user asks for one.\n"
        "2. FOCUSED MARKET QUESTION (for example, your opinion, a possible entry, a level, or one indicator): Give a direct answer first, then only the relevant evidence "
        "(usually 2-5 concise bullets) and the main risk or invalidation. Do NOT use the full report framework.\n"
        "3. FULL REPORT: Use the complete framework only when the user explicitly requests a complete/detailed report, asks a genuinely broad multi-part analysis, "
        "or supplies a custom step-by-step format. Follow the user's requested format exactly and complete it without adding unrelated sections.\n"
        "For follow-up questions, use the conversation context and answer only what changed or was asked; never repeat an entire previous report by default.\n\n"
        "=== INDEPENDENT PROFESSIONAL JUDGMENT ===\n"
        "- Give a genuine evidence-based opinion, not just a summary. State your directional bias or action (LONG, SHORT, ESPERAR, etc.) and LOW/MEDIUM/HIGH conviction when useful. "
        "For an entry question, say explicitly whether entering now is attractive or waiting offers a better setup, and why.\n"
        "- MARKET SIGNAL is only an aggregate of indicator votes, not your conclusion, executed order flow, or a probability of success. You may disagree with it when the evidence conflicts.\n"
        "- Weigh trend, momentum, trend strength, volatility, multi-timeframe alignment, and liquidity. Explicitly mention important contradictions instead of hiding them. "
        "For example, ADX below 25 generally argues against treating a move as a strong established trend.\n"
        "- Use recent series to establish whether a metric is rising, falling, crossing, or diverging. Never infer evolution from one isolated value.\n"
        "- Order-book walls are potential liquidity areas, not guaranteed support/resistance; resting orders can be canceled. Do not present them as certain barriers.\n"
        "- ORDER BLOCKS are OHLC-detected candidate price-action zones, not evidence of bank orders or institutional positioning. Respect their status: never treat an invalidated block as active.\n"
        "- FVGs are measured three-candle imbalances. Use their actual open/partial/filled status and fill percentage; never claim that a gap must fill or assign it an unsupported probability.\n"
        "- LIQUIDITY SWINGS are confirmed 2-candle swing highs (buy-side liquidity pools) and swing lows (sell-side liquidity pools). Respect their status: active, swept (wick pierced the level but closed back), or broken (closed through). They represent potential stop clusters, not guaranteed reversals.\n"
        "- ORDER FLOW represents executed market trades and aggressor volume delta (taker buys vs taker sells). Do NOT confuse executed order flow with indicator signals or resting limit order book depth.\n"
        "- Never assign a win rate, certainty, or numerical probability unless it is actually supplied or validly calculable from the provided data.\n\n"
        "=== TRADE SETUP & MANDATORY RISK VALIDATION ===\n"
        "- When a trade is requested, provide a conditional setup only if the data supports one: entry or entry zone, confirmation/trigger, invalidation, stop, and logical target(s). "
        "If there is no coherent edge, say ESPERAR rather than forcing a trade or an attractive ratio.\n"
        "- Before presenting a LONG, verify STOP < ENTRY < TARGET. Risk = ENTRY - STOP; reward = TARGET - ENTRY.\n"
        "- Before presenting a SHORT, verify TARGET < ENTRY < STOP. Risk = STOP - ENTRY; reward = ENTRY - TARGET.\n"
        "- Reward/risk = reward / risk. Check the direction and arithmetic before responding. If any inequality fails or risk is zero/negative, discard or rebuild the setup; NEVER publish it.\n"
        "- If using an entry zone, state the exact entry price used for the calculations or present a valid range of outcomes. Keep price units and direction consistent.\n"
        "- Place stops at a logical invalidation supported by available levels/volatility, not at an arbitrary distance merely to manufacture a high reward/risk ratio. "
        "Do not claim fees, slippage, funding, or execution costs are included unless they were provided and calculated.\n\n"
        "=== STYLE & FULL REPORT FRAMEWORK ===\n"
        "- Be precise, candid, and analytical. Use clean formatting proportional to the request; never pad a response to look institutional.\n"
        "- NEVER use emojis in technical analyses, headers, tables, or strategies.\n"
        "- Do not append generic source claims or a mandatory footer.\n\n"
        "For a FULL REPORT without a custom requested structure, use these sections (NO emojis):\n"
        "### Resumen Ejecutivo & Señal de Mercado\n"
        "Present your own bias and conviction, contrast them with MARKET SIGNAL, and describe the bullish/bearish figures accurately as an indicator-signal split, not order flow.\n\n"
        "### Mapa de Liquidez & Order Book (Bubble Map)\n"
        "Assess available depth, spread, and major bid/ask clusters as potential liquidity, including limitations and implications for execution.\n\n"
        "### Desglose Técnico Completo\n"
        "Synthesize the available indicators rather than mechanically repeating them:\n"
        "- **Estructura & Tendencia:** EMAs (50, 100, 200), recent Price Action, active Order Block candidates, FVG mitigation, Liquidity Swings, and multi-timeframe alignment.\n"
        "- **Flujo de Órdenes & Liquidez:** Executed Order Flow delta (taker volume), Order Book depth (Bubble Map), and liquidity pools / swing levels.\n"
        "- **Momentum & Timing:** RSI, Stochastic RSI, Stochastic %K/%D, MACD, CCI, and MFI, emphasizing changes and conflicts.\n"
        "- **Volatilidad & Fuerza:** Bollinger Bands and ADX with +DI/-DI.\n\n"
        "### Niveles Clave (Soporte & Resistencia)\n"
        "Identify the most relevant pivot, EMA, Bollinger, and liquidity levels; distinguish confirmed structural levels from potential order-book liquidity.\n\n"
        "### Recomendación Estratégica\n"
        "Give your evidence-based action, scenarios, trigger, invalidation, and—only when valid—a directionally consistent entry/stop/target setup with checked risk and reward/risk calculations.\n\n"
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
            signal_split = f"{bullish_flow:.1f}% Bullish Signals | {bearish_pressure:.1f}% Bearish Signals"
        else:
            signal_split = "N/A | N/A (no active BUY/SELL votes)"

        # LIQUIDITY BUBBLE MAP & ORDER BOOK
        buyer_pct = indicator_data.get('buyerPercent')
        buyer_pct_str = f"{float(buyer_pct):.1f}%" if buyer_pct is not None else "N/A"
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
        data_block += f"| Indicator Signal Split | {signal_split} | Distribution of active indicator votes; NOT executed order flow or win probability |\n"
        data_block += f"| LIQUIDITY BUBBLE MAP | Buyer Dominance: {buyer_pct_str} | Depth Source: {ob_source} |\n"
        if bid_vol is not None and ask_vol is not None:
            data_block += f"| Order Book Bid/Ask Vol | Bids: {_format_compact(bid_vol)} USDT | Asks: {_format_compact(ask_vol)} USDT | Aggregate 40-level depth |\n"
        if best_bid is not None and best_ask is not None:
            data_block += f"| Best Bid / Best Ask | ${_fmt(best_bid)} / ${_fmt(best_ask)} | Spread: {abs(float(best_ask) - float(best_bid)):.4f} USDT |\n"
        if liquidity_walls:
            data_block += f"| Top Bid Liquidity Walls | {liquidity_walls['top_bids']} | Potential bid liquidity; orders may be canceled |\n"
            data_block += f"| Top Ask Liquidity Walls | {liquidity_walls['top_asks']} | Potential ask liquidity; orders may be canceled |\n"
        of = indicator_data.get('orderFlow')
        if isinstance(of, dict):
            data_block += f"| Executed Order Flow | Net Delta: ${_fmt(of.get('delta'))} ({of.get('deltaPercent', 0):+.1f}%) | Aggressor Buy Vol: {of.get('buyPercent', 0)}% ({of.get('tradeCount', 0)} executed trades) |\n"
        lswings = indicator_data.get('liquiditySwings')
        if isinstance(lswings, list):
            act_cnt = sum(1 for s in lswings if s.get('status') == 'active')
            swp_cnt = sum(1 for s in lswings if s.get('status') == 'swept')
            data_block += f"| Liquidity Swings | Active: {act_cnt} | Swept: {swp_cnt} | 2L/2R confirmed structural swing high/lows |\n"
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
        data_block += _format_price_action_context(indicator_data)
        
        data_block += "\nUse THESE EXACT VALUES when citing data. For focused questions, synthesize only the relevant metrics; reserve the complete cross-indicator synthesis for a full report. Never mislabel the indicator signal split as order flow or probability.\n"
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



def _format_price_action_context(indicator_data):
    """Serializa las zonas reales de price action, liquidity swings y order flow para el contexto del modelo."""
    order_blocks = indicator_data.get('orderBlocks')
    fair_value_gaps = indicator_data.get('fairValueGaps')
    liquidity_swings = indicator_data.get('liquiditySwings')
    order_flow = indicator_data.get('orderFlow')
    current_price = indicator_data.get('precio')

    lines = [
        "\n=== PRICE ACTION, LIQUIDITY SWINGS & ORDER FLOW (REAL OHLC & EXECUTED TRADES) ===",
        "Order Blocks are candidates, not confirmed institutional orders. FVG fill is measured, never guaranteed.",
        "Liquidity Swings are confirmed 2L/2R structural swing high/lows (potential stop clusters).",
        "Order Flow measures executed taker trades (volume delta), distinct from resting order book depth.",
    ]

    # 1. ORDER BLOCKS
    if not isinstance(order_blocks, list):
        lines.append("ORDER BLOCKS: N/A (field not supplied)")
    elif not order_blocks:
        lines.append("ORDER BLOCKS: No candidates detected")
    else:
        lines.append("ORDER BLOCK CANDIDATES:")
        for zone in order_blocks:
            lines.append(
                f"- {str(zone.get('side', 'N/A')).upper()} | Status: {zone.get('status', 'N/A')} | "
                f"Zone: ${_fmt(zone.get('bottom'))} - ${_fmt(zone.get('top'))} | "
                f"Displacement: {_fmt(zone.get('impulseAtr'))}x ATR | "
                f"Body: {_fmt(zone.get('impulseBodyPercent'))}% | "
                f"Confirmed: {_fmt_ts(zone.get('confirmationTime'))}"
            )

    # 2. FAIR VALUE GAPS
    if not isinstance(fair_value_gaps, list):
        lines.append("FAIR VALUE GAPS: N/A (field not supplied)")
    elif not fair_value_gaps:
        lines.append("FAIR VALUE GAPS: No imbalances detected")
    else:
        lines.append("FAIR VALUE GAPS:")
        for gap in fair_value_gaps:
            lines.append(
                f"- {str(gap.get('side', 'N/A')).upper()} | Status: {gap.get('status', 'N/A')} | "
                f"Gap: ${_fmt(gap.get('bottom'))} - ${_fmt(gap.get('top'))} | "
                f"50% Midpoint: ${_fmt(gap.get('midpoint'))} | "
                f"Filled: {_fmt(gap.get('fillPercent'))}% | "
                f"Size: {_fmt(gap.get('sizePercent'))}% | Formed: {_fmt_ts(gap.get('formedAt'))}"
            )

    # 3. LIQUIDITY SWINGS (Stop Clusters)
    if not isinstance(liquidity_swings, list):
        lines.append("LIQUIDITY SWINGS: N/A (field not supplied)")
    elif not liquidity_swings:
        lines.append("LIQUIDITY SWINGS: No swing levels detected in latest 200 candles")
    else:
        lines.append("LIQUIDITY SWINGS (2L/2R Swing Confirmation — Potential Stop Clusters):")
        for swing in liquidity_swings:
            side_str = "BUY-SIDE (Swing High)" if swing.get('side') == 'buy_side' else "SELL-SIDE (Swing Low)"
            status = str(swing.get('status', 'N/A')).upper()
            price_val = swing.get('price')

            dist_str = ""
            if current_price and price_val:
                try:
                    pct = ((float(price_val) - float(current_price)) / float(current_price)) * 100
                    dist_str = f" | Dist to Spot: {pct:+.2f}%"
                except Exception:
                    pass

            extra_info = ""
            if status == "SWEPT" and swing.get('sweepSizePercent') is not None:
                extra_info = f" | Sweep Penetration: {swing.get('sweepSizePercent'):.3f}% (pierced & closed inside)"
            elif status == "BROKEN" and swing.get('brokenAt'):
                extra_info = f" | Broken: {_fmt_ts(swing.get('brokenAt'))}"

            lines.append(
                f"- {side_str} | Status: {status} | Level: ${_fmt(price_val)}"
                f"{dist_str}{extra_info} | Formed: {_fmt_ts(swing.get('formedAt'))}"
            )

    # 4. EXECUTED ORDER FLOW (Aggressor Trades)
    if not isinstance(order_flow, dict):
        lines.append("ORDER FLOW: N/A (only available for crypto / executed trades feed)")
    else:
        scope = order_flow.get('scope', 'executed trades')
        delta = order_flow.get('delta', 0)
        delta_pct = order_flow.get('deltaPercent', 0)
        buy_pct = order_flow.get('buyPercent', 0)
        buy_vol = order_flow.get('buyVolume', 0)
        sell_vol = order_flow.get('sellVolume', 0)
        trade_count = order_flow.get('tradeCount', 0)
        buy_trades = order_flow.get('buyTradeCount', 0)
        sell_trades = order_flow.get('sellTradeCount', 0)
        source = order_flow.get('source', 'exchange')
        side_class = order_flow.get('sideClassification', 'aggressor')

        bias = "NET BUY DELTA (Aggressive Buying Predominance)" if delta > 0 else (
            "NET SELL DELTA (Aggressive Selling Predominance)" if delta < 0 else "FLAT DELTA"
        )

        lines.append("EXECUTED ORDER FLOW (REAL TRADES TAPE):")
        lines.append(
            f"- Flow State: {bias} | Delta: ${_fmt(delta)} ({delta_pct:+.1f}%)"
        )
        lines.append(
            f"- Volume Split: Buy Vol ${_fmt(buy_vol)} ({buy_pct}%) vs Sell Vol ${_fmt(sell_vol)} ({100 - buy_pct:.1f}%)"
        )
        lines.append(
            f"- Trade Activity: {trade_count} trades ({buy_trades} aggressive buys, {sell_trades} aggressive sells) | Scope: {scope}"
        )
        lines.append(
            f"- Source: {source} (aggressor inferred by inverting Coinbase maker side)"
        )
        recent = order_flow.get('recentTrades')
        if recent and isinstance(recent, list):
            recent_summary = ", ".join(
                f"{t.get('side', '?').upper()} {t.get('size', '?')} @ ${_fmt(t.get('price'))}"
                for t in recent[:6]
            )
            lines.append(f"- Recent Prints: {recent_summary}")

    return "\n".join(lines) + "\n"


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
    all_sessions: list | None = None,
    current_session_id: str | None = None,
) -> tuple[str, list]:
    """Call the NVIDIA API with MCP-style tool calling support for memory recall.
    Returns (response_text, tools_used). Raises NvidiaChatError on failure."""
    api_key = get_api_key()
    if not api_key:
        raise NvidiaChatError("NVIDIA_API_KEY no está configurado en el servidor.", code="NO_API_KEY")

    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        raise NvidiaChatError(f"Modelo desconocido: {model_key}", code="UNKNOWN_MODEL")
    model_id = model_config["id"]
    model_name = model_config["name"]
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))

    effective_data = indicator_data if intent in ('analysis', 'ambiguous') else None
    system_prompt = get_trading_system_prompt(effective_data, global_context, model_name, intent=intent)

    effective_max_tokens = 512 if intent == 'casual' else max_tokens
    url = f"{NVIDIA_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    initial_messages = build_messages(prompt, system_prompt, history)

    # Payload con soporte de herramientas estilo MCP
    payload_dict = {
        "model": model_id,
        "messages": initial_messages,
        "temperature": temperature,
        "max_tokens": effective_max_tokens,
        "tools": CHAT_TOOLS,
        "tool_choice": "auto",
    }
    payload = json.dumps(payload_dict).encode("utf-8")
    req = Request(url, data=payload, headers=headers, method="POST")

    try:
        with urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if not choices:
                logger.error(f"NVIDIA API returned no choices: {data}")
                raise NvidiaChatError("El modelo no devolvió respuesta. Intenta de nuevo.", code="NO_CHOICES")

            choice0 = choices[0]
            choice_msg = choice0.get("message", {})
            tool_calls = choice_msg.get("tool_calls", [])

            # Si el modelo invocó herramientas de memoria (MCP Tool Call):
            if tool_calls:
                logger.info(f"[NvidiaChat] {model_name} requested {len(tool_calls)} tool call(s)")
                second_messages = list(initial_messages)
                second_messages.append(choice_msg)
                tools_used = []

                for tc in tool_calls:
                    tc_id = tc.get("id")
                    fn = tc.get("function", {})
                    fn_name = fn.get("name")
                    raw_args = fn.get("arguments", "{}")
                    try:
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                    except Exception:
                        args = {"query": str(raw_args)}

                    if fn_name == "search_chat_history":
                        query = args.get("query", prompt)
                        sym = args.get("symbol")
                        result = search_chat_history(
                            query=query,
                            symbol=sym,
                            all_sessions=all_sessions,
                            current_session_id=current_session_id,
                        )
                        tools_used.append({
                            "tool": "search_chat_history",
                            "query": query,
                            "symbol": sym,
                            "found": result.get("found_records", 0)
                        })
                        second_messages.append({
                            "role": "tool",
                            "tool_call_id": tc_id,
                            "name": fn_name,
                            "content": json.dumps(result, ensure_ascii=False)
                        })

                # Segunda llamada a NVIDIA para sintetizar la respuesta con los recuerdos
                payload2 = json.dumps({
                    "model": model_id,
                    "messages": second_messages,
                    "temperature": temperature,
                    "max_tokens": effective_max_tokens,
                }).encode("utf-8")
                req2 = Request(url, data=payload2, headers=headers, method="POST")
                with urlopen(req2, timeout=timeout) as resp2:
                    data2 = json.loads(resp2.read().decode("utf-8"))
                    final_choice = data2.get("choices", [{}])[0]
                    final_content = final_choice.get("message", {}).get("content", "")
                    if final_content and final_content.strip():
                        return final_content.strip(), tools_used

            content = choice_msg.get("content", "")
            if not content or not content.strip():
                raise NvidiaChatError("El modelo devolvió una respuesta vacía.", code="EMPTY_RESPONSE")
            return content.strip(), []

    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.error(f"NVIDIA API HTTP {e.code} for model {model_id}: {body}")

        # Si el modelo no soporta el parámetro tools (HTTP 400), reintentar sin tools
        if e.code == 400 and ("tool" in body.lower() or "schema" in body.lower() or "not supported" in body.lower()):
            logger.warning(f"[NvidiaChat] Retrying without tools for {model_name}...")
            payload_no_tools = json.dumps({
                "model": model_id,
                "messages": initial_messages,
                "temperature": temperature,
                "max_tokens": effective_max_tokens,
            }).encode("utf-8")
            req_retry = Request(url, data=payload_no_tools, headers=headers, method="POST")
            try:
                with urlopen(req_retry, timeout=timeout) as resp_retry:
                    data_retry = json.loads(resp_retry.read().decode("utf-8"))
                    content_retry = data_retry.get("choices", [{}])[0].get("message", {}).get("content", "")
                    return content_retry.strip(), []
            except Exception as retry_err:
                logger.error(f"[NvidiaChat] Retry without tools also failed: {retry_err}")

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


def nvidia_chat_stream(
    prompt: str,
    model_key: str = "nvidia-nemotron",
    temperature: float = 0.3,
    max_tokens: int = 4096,
    history: list | None = None,
    global_context: str | None = None,
    indicator_data: dict | None = None,
    intent: str = "analysis",
    all_sessions: list | None = None,
    current_session_id: str | None = None,
):
    """Generates real-time SSE events for model reasoning (thoughts) and response content."""
    api_key = get_api_key()
    if not api_key:
        yield {"type": "error", "error": "NVIDIA_API_KEY no está configurado en el servidor.", "error_code": "NO_API_KEY"}
        return

    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        yield {"type": "error", "error": f"Modelo desconocido: {model_key}", "error_code": "UNKNOWN_MODEL"}
        return
    model_id = model_config["id"]
    model_name = model_config["name"]
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))

    effective_data = indicator_data if intent in ('analysis', 'ambiguous') else None
    system_prompt = get_trading_system_prompt(effective_data, global_context, model_name, intent=intent)
    effective_max_tokens = 512 if intent == 'casual' else max_tokens
    url = f"{NVIDIA_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }

    initial_messages = build_messages(prompt, system_prompt, history)

    payload_dict = {
        "model": model_id,
        "messages": initial_messages,
        "temperature": temperature,
        "max_tokens": effective_max_tokens,
        "tools": CHAT_TOOLS,
        "tool_choice": "auto",
        "stream": True,
    }

    req = Request(url, data=json.dumps(payload_dict).encode("utf-8"), headers=headers, method="POST")

    tool_calls_acc = []
    tools_used = []

    try:
        with urlopen(req, timeout=timeout) as resp:
            for raw_line in resp:
                line = raw_line.decode("utf-8").strip()
                if not line or line == "data: [DONE]":
                    continue
                if line.startswith("data: "):
                    try:
                        chunk_json = json.loads(line[6:])
                        choices = chunk_json.get("choices", [])
                        if not choices:
                            continue
                        delta = choices[0].get("delta", {})

                        # Stream real-time reasoning / thoughts
                        if "reasoning_content" in delta and delta["reasoning_content"]:
                            yield {"type": "thought", "chunk": delta["reasoning_content"]}

                        # Stream real-time response content
                        if "content" in delta and delta["content"]:
                            yield {"type": "content", "chunk": delta["content"]}

                        # Accumulate tool calls if model invokes memory
                        if "tool_calls" in delta and delta["tool_calls"]:
                            for tc in delta["tool_calls"]:
                                idx = tc.get("index", 0)
                                while len(tool_calls_acc) <= idx:
                                    tool_calls_acc.append({"id": "", "function": {"name": "", "arguments": ""}})
                                if tc.get("id"):
                                    tool_calls_acc[idx]["id"] = tc["id"]
                                fn = tc.get("function", {})
                                if fn.get("name"):
                                    tool_calls_acc[idx]["function"]["name"] = fn["name"]
                                if fn.get("arguments"):
                                    tool_calls_acc[idx]["function"]["arguments"] += fn["arguments"]
                    except Exception:
                        pass

        # Si el modelo invocó herramientas de memoria (MCP search_chat_history):
        if tool_calls_acc:
            second_messages = list(initial_messages)
            assistant_tool_msg = {"role": "assistant", "tool_calls": []}
            for tc in tool_calls_acc:
                assistant_tool_msg["tool_calls"].append({
                    "id": tc.get("id") or "call_0",
                    "type": "function",
                    "function": tc.get("function", {})
                })
            second_messages.append(assistant_tool_msg)

            for tc in tool_calls_acc:
                fn = tc.get("function", {})
                fn_name = fn.get("name")
                raw_args = fn.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except Exception:
                    args = {"query": str(raw_args)}

                if fn_name == "search_chat_history":
                    query = args.get("query", prompt)
                    sym = args.get("symbol")
                    yield {"type": "thought", "chunk": f"\n[Accediendo a memoria MCP: '{query}']\n"}
                    result = search_chat_history(
                        query=query,
                        symbol=sym,
                        all_sessions=all_sessions,
                        current_session_id=current_session_id,
                    )
                    tools_used.append({
                        "tool": "search_chat_history",
                        "query": query,
                        "symbol": sym,
                        "found": result.get("found_records", 0)
                    })
                    yield {"type": "tool", "query": query, "found": result.get("found_records", 0)}
                    second_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id") or "call_0",
                        "name": fn_name,
                        "content": json.dumps(result, ensure_ascii=False)
                    })

            # Segunda llamada en streaming con los recuerdos recuperados
            payload2 = json.dumps({
                "model": model_id,
                "messages": second_messages,
                "temperature": temperature,
                "max_tokens": effective_max_tokens,
                "stream": True,
            }).encode("utf-8")
            req2 = Request(url, data=payload2, headers=headers, method="POST")

            with urlopen(req2, timeout=timeout) as resp2:
                for raw_line in resp2:
                    line = raw_line.decode("utf-8").strip()
                    if not line or line == "data: [DONE]":
                        continue
                    if line.startswith("data: "):
                        try:
                            chunk_json = json.loads(line[6:])
                            choices = chunk_json.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {})
                            if "reasoning_content" in delta and delta["reasoning_content"]:
                                yield {"type": "thought", "chunk": delta["reasoning_content"]}
                            if "content" in delta and delta["content"]:
                                yield {"type": "content", "chunk": delta["content"]}
                        except Exception:
                            pass

        yield {"type": "done", "model": model_key, "memory_accessed": tools_used}

    except Exception as e:
        logger.error(f"[NvidiaChatStream] Error: {e}")
        yield {"type": "error", "error": str(e), "error_code": "STREAM_ERROR"}
