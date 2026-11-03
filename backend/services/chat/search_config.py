"""Configuracion estatica de la busqueda web (proveedores, filtros, constantes).

Todo lo que se calcula una sola vez al importar: pool de User-Agents, timeouts,
config de SerpApi (fallback), el orden de proveedores via env (con el log de
arranque) y los mapas de filtros (time_range -> df, source -> site/hosts) y de
URLs basura. Sin estado mutable: los locks y la sesion (opener/vqd/throttle/UA)
viven en search_ddg.py, que si los muta con `global`.
"""

import logging
import os

logger = logging.getLogger(__name__)

# Pool de User-Agents realistas (navegadores comunes actuales). Se rota uno por
# busqueda para no presentar siempre el mismo fingerprint de bot.
_UA_POOL = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
)
_UA = _UA_POOL[0]  # valor por defecto / estable (SerpApi lo usa)
_TIMEOUT = 6
_MAX_RESULTS_CAP = 10
# Presupuesto de tiempo total para el intento DDG (fail-fast). Si DDG esta
# bloqueado (tipico en IP de datacenter/Render) se abandona al superar este
# umbral y se cede al fallback SerpApi, en vez de agotar ~25-40s en handshake/
# desafios. Mantiene el orden DDG -> SerpApi pero sin colgar.
_DDG_BUDGET_S = 9.0

# --- Config: SerpApi (fallback) ---------------------------------------------
_SERPAPI_API_KEY = (os.environ.get("SERPAPI_API_KEY") or "").strip()
_SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
_SERPAPI_TIMEOUT = 20
_HAS_SERPAPI = bool(_SERPAPI_API_KEY)

# Orden de proveedores via env WEB_SEARCH_PROVIDER:
#   'duckduckgo' (default, ideal local): DDG primero y SerpApi de respaldo (ahorra cuota).
#   'serpapi'    (ideal Render/nube): SerpApi primero porque DDG esta siempre bloqueado
#                desde IP de datacenter; evita el hang de ~25s reintentando DDG.
_PROVIDER_ORDER = (os.environ.get("WEB_SEARCH_PROVIDER") or "duckduckgo").strip().lower()
if _PROVIDER_ORDER == "serpapi" and not _HAS_SERPAPI:
    _PROVIDER_ORDER = "duckduckgo"  # sin key no se puede usar serpapi

if _HAS_SERPAPI:
    _fb = "duckduckgo" if _PROVIDER_ORDER == "serpapi" else "serpapi"
    logger.info(
        f"[WebSearch] provider={_PROVIDER_ORDER} (fallback={_fb}, "
        f"key={_SERPAPI_API_KEY[:6]}…{_SERPAPI_API_KEY[-4:]})"
    )
else:
    logger.info("[WebSearch] provider=duckduckgo (SERPAPI_API_KEY no configurado)")

# --- Params / filtros --------------------------------------------------------
_DF_MAP = {
    "day": "d", "d": "d",
    "week": "w", "w": "w",
    "month": "m", "mo": "m",
    "year": "y", "y": "y",
}

_SOURCE_MAP = {
    "reddit": "site:reddit.com",
    "x": "site:x.com OR site:twitter.com",
    "twitter": "site:x.com OR site:twitter.com",
    "news": "",
    "all": "",
}

# --- Params propios de SerpApi -----------------------------------------------
# tbs=qdr:<letra> filtra por tiempo (d/w/m/y). Reusamos las letras de _DF_MAP.
# Para source reddit/x: SerpApi no respeta site:, entonces filtramos por host
# en cliente y, si no queda ninguno, se auto-amplia (widened).
_SERPAPI_SOURCE_HOSTS = {
    "reddit": ("reddit.com",),
    "x": ("x.com", "twitter.com"),
    "twitter": ("x.com", "twitter.com"),
}

_LITE_URL = "https://lite.duckduckgo.com/lite/"
_HTML_URL = "https://html.duckduckgo.com/html/"

# URLs que los buscadores indexan pero no son contenido util para el usuario.
_JUNK_PATTERNS = (
    "analytics.twitter.com",
    "/adsct?",
    "/mob_idsync",
    "/i/adsct",
    "duckduckgo.com/y.js",
    "duckduckgo.com/l/?uddg=",
    "/pagead/lvz?",
    "doubleclick.net",
    "googlesyndication.com",
    "google.com/search?",
    "google.com/goto?url=",
)
