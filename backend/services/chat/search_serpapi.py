"""Cliente SerpApi (Google Search API) — fallback de la busqueda web.

Un solo GET a `search.json?engine=google` que devuelve `organic_results`. Se
usa cuando DuckDuckGo da 0 o esta bloqueado (IP de datacenter/Render), o como
proveedor principal si WEB_SEARCH_PROVIDER=serpapi. Requiere SERPAPI_API_KEY
(free tier 250/mes; se gasta lo minimo).

SerpApi ignora `site:`, asi que para source reddit/x se filtra por host en
cliente y, si no queda ninguno, `_serp_search` reintenta sin filtro (widened).
"""

import json
import logging
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from services.chat.search_config import (
    _UA,
    _SERPAPI_API_KEY,
    _SERPAPI_ENDPOINT,
    _SERPAPI_TIMEOUT,
    _SERPAPI_SOURCE_HOSTS,
)
from services.chat.search_html import _clean, _is_junk, _matches_hosts

logger = logging.getLogger(__name__)

# Simbolo que consume la fachada services.chat.web_search; evita el falso
# "not accessed" del linter al analizar este modulo aislado.
__all__ = ["_serp_search"]


def _serpapi_search(query_text, n, df=None, src_key="all"):
    """Un solo GET al Search API de SerpApi (engine=google). Devuelve (results, err).

    results=None -> fallo de red/auth/cuota (caller cae a DDG).
    results=[]   -> SerpApi respondio OK pero sin items utiles.

    Para src_key reddit/x: SerpApi ignora `site:`, asi que filtramos los
    organic_results por host en cliente. Si ninguno coincide, devuelve [] y el
    caller decide ampliar.
    """
    params = {"engine": "google", "q": query_text, "num": str(n),
              "api_key": _SERPAPI_API_KEY, "hl": "en"}
    if df:
        params["tbs"] = "qdr:" + df
    url = _SERPAPI_ENDPOINT + "?" + urlencode(params)
    req = Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=_SERPAPI_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except HTTPError as e:
        try:
            err_body = json.loads(e.read().decode("utf-8", "replace"))
            detail = err_body.get("error") or err_body.get("message") or f"HTTP {e.code}"
        except Exception:
            detail = f"HTTP {e.code}"
        logger.warning(f"[WebSearch/SerpApi] {query_text[:40]!r} -> {detail}")
        return None, str(detail)
    except Exception as e:
        logger.warning(f"[WebSearch/SerpApi] network error: {e}")
        return None, str(e)

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None, "invalid json"

    hosts = _SERPAPI_SOURCE_HOSTS.get(src_key)
    out = []
    for it in (data.get("organic_results") or []):
        title = _clean(it.get("title", ""))
        url_r = it.get("link", "") or ""
        snippet = _clean(it.get("snippet", ""))
        if not title or not url_r or _is_junk(url_r):
            continue
        if hosts and not _matches_hosts(url_r, hosts):
            continue
        out.append({"title": title, "url": url_r, "snippet": snippet})
        if len(out) >= n:
            break
    return out, None


def _serp_search(query, n, df, src_key, has_domain):
    """SerpApi con widening por host. Devuelve (results, widened, err).
    err no-None => SerpApi no respondio (red/auth/cuota)."""
    sres, serr = _serpapi_search(query, n, df, src_key)
    if sres is None:
        return [], False, serr
    widened = False
    if not sres and has_domain:
        plain, _ = _serpapi_search(query, n, df, "all")
        if plain:
            sres, widened = plain, True
    return sres, widened, None
