"""Configuración estática del agente de chat NVIDIA.

Contiene constantes de la API, catálogo de modelos, esquemas de las
herramientas expuestas al modelo (MCP de memoria + búsqueda web), la excepción
de error y el lector de la API key. Separado de nvidia_chat.py (orquestador)
para mantener el módulo principal enfocado en el loop de llamadas.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

NVIDIA_API_KEY_ENV = "NVIDIA_API_KEY"
NVIDIA_API_BASE = "https://integrate.api.nvidia.com/v1"
REQUEST_TIMEOUT = 180


AVAILABLE_MODELS = {
    "nvidia-nemotron": {
        "id": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
        "name": "Nemotron 3 Nano Omni",
        "provider": "NVIDIA",
        "free": True,
        "reasoning": True,
        "timeout": 180,
    },
    "nvidia-nemotron-bolt": {
        "id": "nvidia/nemotron-3.5-bolt-e4b",
        "name": "Nemotron 3.5 Bolt E4B",
        "provider": "NVIDIA",
        "free": True,
        "reasoning": False,
        "timeout": 180,
    },
    "nvidia-nemotron-ultra": {
        "id": "nvidia/nemotron-3-ultra-550b-a55b",
        "name": "Nemotron 3 Ultra 550B",
        "provider": "NVIDIA",
        "free": True,
        "reasoning": True,
        "timeout": 180,
    },
    "meta-muse": {
        "id": "meta/muse-glimmer-30b",
        "name": "Muse Glimmer 30B",
        "provider": "Meta",
        "free": True,
        "reasoning": True,
        "timeout": 180,
    },
    "google-diffusiongemma": {
        "id": "google/diffusiongemma-26b-a4b-it",
        "name": "DiffusionGemma 26B",
        "provider": "Google",
        "free": True,
        "reasoning": False,
        "timeout": 180,
    },
}


# ---------------------------------------------------------------------------
# MCP-style Tool Definitions
# ---------------------------------------------------------------------------
CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_chat_history",
            "description": "Busca en el historial de sesiones y conversaciones PASADAS del usuario. Úsala solo cuando el usuario pregunte por conversaciones anteriores, niveles o recomendaciones previas, o para recordar detalles de sesiones pasadas. NO la uses para noticias, eventos actuales ni información externa de internet: para eso existe web_search.",
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


# Herramienta de busqueda web (solo se expone al modelo cuando el usuario la
# activa desde la barra de Acciones Rapidas). Backed by services.web_search.
WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Busca informacion actualizada en internet: noticias, eventos macro, anuncios, listados, regulacion, y TAMBIEN redes sociales (X/Twitter y Reddit) para announcements oficiales, metricas de comunidad, sentimiento, hype y memes del mercado. Usala cuando la respuesta dependa de datos externos que NO estan en los indicadores del terminal ni en el historial. NO la uses para el precio en vivo ni para senales tecnicas: eso viene exclusivamente del terminal.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Consulta concreta con el tema EXACTO que pidio el usuario: cualquier coin, token, ticker, proyecto, protocolo, exchange o topico que nombre (SOL, XRP, DOGE, ARB, LINK, un alt especifico, una empresa, una regulacion, etc.). NO la limites a Bitcoin/Ethereum ni sustituyas un major cuando el usuario pidio otra cosa; reutiliza sus propias palabras. Ej: 'Pepe token listing Binance', 'Solana ETF approval news', 'ultimo anuncio Fed tasas', 'Cardano scaling upgrade'"
                },
                "source": {
                    "type": "string",
                    "enum": ["all", "news", "reddit", "x"],
                    "description": "Donde buscar: 'news' = prensa/medios; 'reddit' = los subreddits relevantes al tema activo (el de la coin/proyecto preguntado, r/CryptoCurrency, mercados, etc.) para sentimiento/metricas/memes; 'x' = posts de X/Twitter (anuncios, hype); 'all' (o omitir) = web general sin restringir. Para announcements o reaccion de la comunidad usa 'reddit' o 'x'."
                },
                "time_range": {
                    "type": "string",
                    "enum": ["day", "week", "month", "year"],
                    "description": "Ventana de frescura. Usa 'day' o 'week' para noticias de mercado recientes."
                },
                "max_results": {
                    "type": "integer",
                    "description": "Numero maximo de resultados (por defecto 6, maximo 10)."
                }
            },
            "required": ["query"]
        }
    }
}


class NvidiaChatError(Exception):
    """Custom exception to carry specific error info from NVIDIA API."""
    def __init__(self, message, code=None):
        super().__init__(message)
        self.code = code


def get_api_key() -> Optional[str]:
    key = os.environ.get(NVIDIA_API_KEY_ENV)
    if not key:
        logger.warning("NVIDIA_API_KEY not set in environment")
    return key
