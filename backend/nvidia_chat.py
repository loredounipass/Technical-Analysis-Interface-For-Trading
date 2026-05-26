import os
import json
import logging
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
    "nvidia-kimi": {
        "id": "moonshotai/kimi-k2.6",
        "name": "Kimi K2.6",
        "provider": "Moonshot AI",
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
    "nvidia-glm": {
        "id": "z-ai/glm-5.1",
        "name": "GLM-5.1",
        "provider": "Z-ai",
        "free": True,
    },
    "nvidia-mistral": {
        "id": "mistralai/mistral-small-4-119b-2603",
        "name": "Mistral Small 4 119B",
        "provider": "Mistral AI",
        "free": True,
    },
}


def get_trading_system_prompt(indicator_data=None, global_context=None):
    """Build a specialized trading agent system prompt with live indicator data and global context."""
    base = (
        "You are a SENIOR QUANTITATIVE CRYPTO STRATEGIST and PROFESSIONAL TRADER with 15+ years of experience in global markets. "
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
        "When analyzing, follow this structure:\n"
        "1. **Market Context & Trend**: Identify the prevailing trend (Bullish/Bearish/Side) using EMAs (50/100/200) and Price Action.\n"
        "2. **Momentum & Oscillators**: Interpret RSI, Stochastic RSI, and MACD. Identify overbought/oversold conditions or divergences.\n"
        "3. **Volatility & Strength**: Use Bollinger Bands for volatility expansion/contraction and ADX for trend strength.\n"
        "4. **Key Levels & Structure**: Reference Pivot Points (S1-S3, R1-R3) as support/resistance zones.\n"
        "5. **Market Sentiment & Emotion**: Analyze the current 'Market Mood' based on the combination of data (e.g., high volume with low RSI = panic/exhaustion).\n"
        "6. **Actionable Execution**: Provide a specific recommendation (BUY / SELL / HOLD / WAIT) with entry zones, stop-loss (SL), and take-profit (TP) levels.\n\n"
        "=== OPERATIONAL RULES & PERSONALITY ===\n"
        "- **BE DYNAMIC**: If the user is just greeting you (e.g., 'Hello', 'How are you?'), respond naturally and professionally without performing a technical analysis unless they ask for it or mention a symbol.\n"
        "- **BE CONVERSATIONAL**: You are a professional assistant, not a rigid script. Maintain a senior trader persona but be approachable.\n"
        "- Respond in the SAME LANGUAGE as the user.\n"
        "- Use professional trading terminology (e.g., 'liquidity sweep', 'order block', 'fair value gap', 'confluence').\n"
        "- Be objective, precise, and data-driven when doing analysis.\n"
        "- Always include a risk disclaimer at the end of technical analyses.\n"
        "- Use Markdown for clarity.\n"
    )

    if indicator_data:
        data_block = "\n📊 [EXACT MARKET DATA FEED - REAL-TIME SOURCE OF TRUTH]\n"
        data_block += f"| CORE METRIC | VALUE | CONTEXT |\n"
        data_block += f"| :--- | :--- | :--- |\n"
        data_block += f"| Symbol | {indicator_data.get('symbol', 'N/A')} | Pair |\n"
        data_block += f"| Current Price | {indicator_data.get('precio', 'N/A')} | Spot |\n"
        data_block += f"| RSI (14) | {indicator_data.get('rsi', 'N/A')} | Momentum |\n"
        data_block += f"| Stoch RSI K | {indicator_data.get('rsiStoch', 'N/A')} | Timing |\n"
        data_block += f"| Stoch K / D | {indicator_data.get('stochK', '0')} / {indicator_data.get('stochD', '0')} | Overbought/Oversold |\n"
        data_block += f"| CCI (20) | {indicator_data.get('cci', 'N/A')} | Trend Deviation |\n"
        data_block += f"| Volume | {indicator_data.get('volumen', 'N/A')} | Market Participation |\n"
        data_block += f"| MACD Line | {indicator_data.get('macdValue', 'N/A')} | Trend Direction |\n"
        data_block += f"| MACD Signal | {indicator_data.get('macdSignal', 'N/A')} | Trigger Line |\n"
        data_block += f"| ADX | {indicator_data.get('adx', 'N/A')} | Trend Strength |\n"
        data_block += f"| Bollinger Upper | {indicator_data.get('bbUpper', 'N/A')} | Resistance Ceiling |\n"
        data_block += f"| Bollinger Middle | {indicator_data.get('bbMiddle', 'N/A')} | Mean Reversion |\n"
        data_block += f"| Bollinger Lower | {indicator_data.get('bbLower', 'N/A')} | Support Floor |\n"
        data_block += f"| EMA 50 / 100 / 200 | {indicator_data.get('ema50', 'N/A')} / {indicator_data.get('ema100', 'N/A')} / {indicator_data.get('ema200', 'N/A')} | Moving Averages |\n"
        data_block += f"| Pivot Points (R) | R1: {indicator_data.get('r1')} | R2: {indicator_data.get('r2')} | R3: {indicator_data.get('r3')} |\n"
        data_block += f"| Pivot Points (S) | S1: {indicator_data.get('s1')} | S2: {indicator_data.get('s2')} | S3: {indicator_data.get('s3')} |\n"
        data_block += f"| Summary Signals | BUY: {indicator_data.get('buySignals')} | SELL: {indicator_data.get('sellSignals')} | NEUTRAL: {indicator_data.get('neutralSignals')} |\n"
        
        data_block += "\nUse THESE EXACT VALUES for your analysis. If the user asks for a specific indicator (like CCI or Stochastics), reference these values from the table.\n"
        base += data_block

    return base



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
    timeout = float(model_config.get("timeout", REQUEST_TIMEOUT))
    system_prompt = get_trading_system_prompt(indicator_data, global_context)
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
