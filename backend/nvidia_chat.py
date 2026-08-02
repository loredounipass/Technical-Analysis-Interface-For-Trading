import os
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

AVAILABLE_MODELS = {
    "nvidia-llama": {
        "id": "meta/llama-3.1-8b-instruct",
        "name": "Llama 3.1 8B",
        "provider": "Meta",
        "free": True,
    },
    "nvidia-nemotron": {
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "name": "Nemotron 3 Nano Omni",
        "provider": "NVIDIA",
        "free": True,
    },
    "nvidia-llama-70b": {
        "id": "meta/llama-3.3-70b-instruct",
        "name": "Llama 3.3 70B",
        "provider": "Meta",
        "free": True,
    },
    "nvidia-nemotron-super": {
        "id": "nvidia/nemotron-3-super-120b-a12b",
        "name": "Nemotron 3 Super 120B",
        "provider": "NVIDIA",
        "free": True,
    },
    "nvidia-nemotron-ultra": {
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "name": "Nemotron 3 Ultra 550B",
        "provider": "NVIDIA",
        "free": True,
    },
    "nvidia-gpt-oss": {
        "id": "openai/gpt-oss-20b",
        "name": "GPT-OSS 20B",
        "provider": "OpenAI",
        "free": True,
    },
    "nvidia-gpt-oss-120b": {
        "id": "openai/gpt-oss-120b",
        "name": "GPT-OSS 120B",
        "provider": "OpenAI",
        "free": True,
    },
}


def get_trading_system_prompt(indicator_data=None, global_context=None, model_name="AI"):
    """Build a specialized trading agent system prompt with live indicator data and global context."""
    base = (
        f"You are a SENIOR QUANTITATIVE CRYPTO STRATEGIST and PROFESSIONAL TRADER with 15+ years of experience in global markets. "
        f"You are operating as the AI model {model_name}. "
        "Your expertise covers Market Microstructure, Price Action (PA), Wyckoff Theory, Elliott Wave Principle, and advanced Technical Indicators. "
        "You specialize in identifying high-probability setups and managing risk in the volatile crypto market.\n\n"
        "Your task is to provide a PROFESSIONAL TRADING ANALYSIS based EXCLUSIVELY on the live market data provided below. "
        "Do not hallucinate data. If a specific value is 'N/A', ignore it in your analysis.\n\n"
    )

    if global_context:
        base += f"=== CROSS-SESSION CONTEXT (MEMORY) ===\n"
        base += f"The user has other active analysis sessions: {global_context}. "
        base += f"If the user refers to past discussions or other symbols, use this overview to maintain continuity.\n\n"

    base += (
        "=== PROFESSIONAL ANALYSIS FRAMEWORK ===\n"
        "When performing an analysis, you MUST structure your response professionally using Markdown headers, bullet points, and bold text for readability. Use the following structure for full analyses:\n"
        "### 📊 Executive Summary\n"
        "A concise 1-2 sentence overview of the current market state and the primary recommendation.\n\n"
        "### 🔍 Technical Breakdown\n"
        "Analyze the data provided in detail. Use bullet points for:\n"
        "- **Trend & Structure:** (EMAs, Price Action)\n"
        "- **Momentum:** (RSI, Stochastic, MACD)\n"
        "- **Volatility:** (Bollinger Bands, ADX)\n\n"
        "### 🎯 Key Levels\n"
        "Clearly state the immediate Support and Resistance zones based on Pivot Points.\n\n"
        "### 💡 Strategic Recommendation\n"
        "Provide highly actionable advice (BUY / SELL / HOLD / WAIT) with logical Entry zones, Stop Loss (SL), and Take Profit (TP) targets based on risk/reward.\n\n"
        "=== OPERATIONAL RULES & PERSONALITY ===\n"
        "- Respond in the SAME LANGUAGE as the user.\n"
        "- **BE HIGHLY STRUCTURED AND ELABORATE**: Your answers must look like a premium quantitative report from an institutional trading desk. Use beautiful, organized formatting.\n"
        "- Use professional trading terminology ('liquidity sweep', 'order block', 'fair value gap', 'confluence').\n"
        "- Be objective, precise, and highly analytical. Back up claims with the data provided.\n"
        "- If the user asks a simple question or greets you, respond naturally but maintain a sophisticated, institutional tone. You don't need the full structure for a simple greeting.\n"
        "- NEVER include generic legal disclaimers like 'hypothetical trade ideas', 'not investment advice', 'consult a financial advisor', or 'do your own research' - they break the user experience and are forbidden.\n"
        "- Instead, at the end of each technical analysis, add a single confident line stating that the recommendation is based on the real-time market data provided and on external technical analysis (e.g., 'Análisis basado en datos de mercado en tiempo real y análisis técnico externo.').\n"
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

        data_block = "\n📊 [EXACT MARKET DATA FEED - REAL-TIME SOURCE OF TRUTH]\n"
        data_block += f"| CORE METRIC | VALUE | CONTEXT |\n"
        data_block += f"| :--- | :--- | :--- |\n"
        data_block += f"| Symbol | {indicator_data.get('symbol', 'N/A')} | Pair |\n"
        data_block += f"| Asset Type | {market} | crypto (spot USDT) or stock (NYSE/NASDAQ) |\n"
        data_block += f"| Timeframe | {indicator_data.get('timeframe', 'N/A')} | Candle interval (CRITICAL: all indicator values below correspond to this timeframe) |\n"
        data_block += f"| Data Timestamp | {_fmt_ts(last_ts)} | Last candle open time (UTC) |\n"
        data_block += f"| Current Price | {indicator_data.get('precio', 'N/A')} | Spot |\n"
        data_block += f"| 24h Volume | {_format_compact(indicator_data.get('volumen'))} | {'USDT quote volume' if market == 'crypto' else 'shares volume'} |\n"
        data_block += f"| Last Candle OHLC | O {_fmt(opens[-1] if opens else None)} H {_fmt(highs[-1] if highs else None)} L {_fmt(lows[-1] if lows else None)} C {_fmt(closes[-1] if closes else None)} | Forming candle |\n"
        data_block += f"| RSI (14) | {indicator_data.get('rsi', 'N/A')} | Momentum |\n"
        data_block += f"| Stoch RSI K (14, 3, 3) | {indicator_data.get('rsiStoch', 'N/A')} | Timing |\n"
        data_block += f"| Stoch K / D (14, 3, 3) | {indicator_data.get('stochK', '0')} / {indicator_data.get('stochD', '0')} | Overbought/Oversold |\n"
        data_block += f"| CCI (20) | {indicator_data.get('cci', 'N/A')} | Trend Deviation |\n"
        data_block += f"| MACD Line (12, 26, 9) | {indicator_data.get('macdValue', 'N/A')} | Trend Direction |\n"
        data_block += f"| MACD Signal (12, 26, 9) | {indicator_data.get('macdSignal', 'N/A')} | Trigger Line |\n"
        data_block += f"| MACD Histogram (12, 26, 9) | {indicator_data.get('macdHistogram', 'N/A')} | Momentum Acceleration |\n"
        data_block += f"| ADX (14) | {indicator_data.get('adx', 'N/A')} | Trend Strength |\n"
        data_block += f"| ADX +DI / -DI (14) | {indicator_data.get('plusDi', 'N/A')} / {indicator_data.get('minusDi', 'N/A')} | Bullish / Bearish Directional Force |\n"
        data_block += f"| Bollinger Upper (20, 2σ) | {indicator_data.get('bbUpper', 'N/A')} | Resistance Ceiling |\n"
        data_block += f"| Bollinger Middle (20, 2σ) | {indicator_data.get('bbMiddle', 'N/A')} | Mean Reversion |\n"
        data_block += f"| Bollinger Lower (20, 2σ) | {indicator_data.get('bbLower', 'N/A')} | Support Floor |\n"
        data_block += f"| EMA 50 / 100 / 200 | {indicator_data.get('ema50', 'N/A')} / {indicator_data.get('ema100', 'N/A')} / {indicator_data.get('ema200', 'N/A')} | Moving Averages |\n"
        data_block += f"| Pivot Points (R) | R1: {_val(indicator_data, 'r1')} | R2: {_val(indicator_data, 'r2')} | R3: {_val(indicator_data, 'r3')} |\n"
        data_block += f"| Pivot Points (S) | S1: {_val(indicator_data, 's1')} | S2: {_val(indicator_data, 's2')} | S3: {_val(indicator_data, 's3')} |\n"
        data_block += f"| Summary Signals | BUY: {indicator_data.get('buySignals')} | SELL: {indicator_data.get('sellSignals')} | NEUTRAL: {indicator_data.get('neutralSignals')} |\n"
        
        data_block += "\nUse THESE EXACT VALUES for your analysis. If the user asks for a specific indicator (like CCI or Stochastics), reference these values from the table.\n"
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
            base += "\n=== RECENT INDICATOR SERIES (last 30 candles, oldest → newest) ===\n"
            base += f"PRICE: {_format_recent(hist, 'closes')}\n"
            base += f"VOLUME (USDT per candle): {_format_recent_volume(hist)}\n"
            base += f"RSI(14): {_format_recent(hist, 'rsi')}\n"
            base += f"MACD (12,26,9): {_format_recent(hist, 'macd')} | SIGNAL (12,26,9): {_format_recent(hist, 'macd_signal')}\n"
            base += f"MACD HISTOGRAM (12,26,9): {_format_recent(hist, 'macd_hist')}\n"
            base += f"STOCH K/D (14,3,3): {_format_recent(hist, 'stochK')} | {_format_recent(hist, 'stochD')}\n"
            base += f"STOCH RSI K (14,3,3): {_format_recent(hist, 'rsiStoch')}\n"
            base += f"CCI (20): {_format_recent(hist, 'cci')}\n"
            base += f"ADX (14): {_format_recent(hist, 'adx')}\n"
            base += f"BB (20,2σ) UPPER: {_format_recent(hist, 'bb_upper')} | MIDDLE: {_format_recent(hist, 'bb_middle')} | LOWER: {_format_recent(hist, 'bb_lower')}\n"
            base += f"EMA 50: {_format_recent(hist, 'ema50')} | EMA 100: {_format_recent(hist, 'ema100')} | EMA 200: {_format_recent(hist, 'ema200')}\n"
            base += "\nUse these series to confirm trends, spot crossovers, divergences, and momentum shifts. They are the source of truth for the exact numbers above.\n"

    return base


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
    for v in vals[-30:]:
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
    return ', '.join(_format_compact(v) for v in vals[-30:])


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


# Formatea un timestamp en ms a UTC legible
def _fmt_ts(ms):
    if not ms:
        return 'N/A'
    try:
        return datetime.datetime.utcfromtimestamp(int(ms) / 1000).strftime('%Y-%m-%d %H:%M')
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
    model_key: str = "nvidia-llama",
    temperature: float = 0.3,
    max_tokens: int = 4096,
    history: list | None = None,
    global_context: str | None = None,
    indicator_data: dict | None = None,
) -> Optional[str]:
    api_key = get_api_key()
    if not api_key:
        return None

    model_config = AVAILABLE_MODELS.get(model_key)
    if not model_config:
        logger.error(f"Unknown model key: {model_key}")
        return None
    model_id = model_config["id"]
    model_name = model_config["name"]
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))
    system_prompt = get_trading_system_prompt(indicator_data, global_context, model_name)
    url = f"{NVIDIA_API_BASE}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = json.dumps({
        "model": model_id,
        "messages": build_messages(prompt, system_prompt, history),
        "temperature": temperature,
        "max_tokens": max_tokens,
    }).encode("utf-8")

    req = Request(url, data=payload, headers=headers, method="POST")

    try:
        with urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            choices = data.get("choices", [])
            if not choices:
                logger.error(f"NVIDIA API returned no choices: {data}")
                return None
            content = choices[0].get("message", {}).get("content", "")
            return content.strip() if content else None
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.error(f"NVIDIA API HTTP {e.code} for model {model_id}: {body}")
        return None
    except URLError as e:
        logger.error(f"NVIDIA API request failed for {model_id}: {e.reason}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"NVIDIA API invalid JSON for {model_id}: {e}")
        return None
    except Exception as e:
        logger.exception(f"Unexpected NVIDIA API error for {model_id}: {e}")
        return None
