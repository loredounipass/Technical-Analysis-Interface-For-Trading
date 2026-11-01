"""Búsqueda web para el agente de chat.

Proveedor principal: DuckDuckGo (scraping, sin API key, sin cuota). Estrategia
por busqueda (ordenado por costo de requests):
  1) POST lite/html  -> 1 request, sin handshake.
  2) i.js JSON       -> usa token vqd cacheado (mejor calidad).
  3) lite+vqd HTML   -> alternativa HTML con la misma sesion.

Fallback: SerpApi (Google Search API) SOLO cuando DuckDuckGo no devuelve nada
(bot-check/timeout) o falla. Se activa si `SERPAPI_API_KEY` esta en backend/.env
(free tier 250 busquedas/mes; se usa lo minimo posible para no gastar cuota). Un
GET a https://serpapi.com/search.json?engine=google devuelve `organic_results`.
SerpApi no respeta `site:`/`as_sitesearch`, asi que para `source` reddit/x se
filtra por host en cliente + auto-ampliacion.

Robustez DDG: sesion persistente (cookie jar), cache global de vqd (5 min),
throttle anti-bot-check, filtro de URLs basura, y auto-ampliacion: si un filtro
`source` (reddit/x) rinde 0, reintenta sin filtro y marca `widened`.

Interfaz estable: web_search(query, max_results, time_range, source) ->
  { query, count, results: [{title, url, snippet}], provider, [error], [widened], [note] }

`source`: 'all' | 'news' | 'reddit' | 'x'. `time_range`: 'day'|'week'|'month'|'year'.
Nunca lanza excepcion al caller: devuelve count=0 con 'error' en su lugar.
"""

import html as _html
import json
import logging
import os
import re
import threading
import time
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.parse import unquote, urlencode, urlsplit, parse_qs
from urllib.request import Request, build_opener, HTTPCookieProcessor, HTTPHandler, urlopen

logger = logging.getLogger(__name__)

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TIMEOUT = 8
_MAX_RESULTS_CAP = 10

# --- Config: SerpApi (fallback) ---------------------------------------------
_SERPAPI_API_KEY = (os.environ.get("SERPAPI_API_KEY") or "").strip()
_SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
_SERPAPI_TIMEOUT = 15
_HAS_SERPAPI = bool(_SERPAPI_API_KEY)

if _HAS_SERPAPI:
    logger.info(
        f"[WebSearch] provider=duckduckgo (fallback=serpapi, "
        f"key={_SERPAPI_API_KEY[:6]}…{_SERPAPI_API_KEY[-4:]})"
    )
else:
    logger.info("[WebSearch] provider=duckduckgo (SERPAPI_API_KEY no configurado)")

# --- Session persistente + cache global de vqd -------------------------------
# Un unico opener con cookie jar compartido entre todas las busquedas. Reduce
# la probabilidad de que DDG sirva el desafio anti-bot (HTTP 202/403).
_OPENER_LOCK = threading.Lock()
_OPENER = None


def _get_opener():
    global _OPENER
    with _OPENER_LOCK:
        if _OPENER is None:
            _OPENER = build_opener(HTTPCookieProcessor(CookieJar()), HTTPHandler())
        return _OPENER


_VQD_LOCK = threading.Lock()
_VQD_STATE = {"token": None, "home_url": None, "ts": 0.0}
_VQD_TTL = 300.0  # 5 minutos

# --- Throttle global: espaciar requests para no provocar bot-check -----------
_THROTTLE_LOCK = threading.Lock()
_last_call = [0.0]
_MIN_INTERVAL = 1.2


def _wait_slot():
    with _THROTTLE_LOCK:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call[0])
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.monotonic()


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


def _host_of(url):
    return (urlsplit(url or "").netloc or "").lower()


def _matches_hosts(url, hosts):
    h = _host_of(url)
    return any(h == d or h.endswith("." + d) for d in hosts)


def _is_junk(url):
    u = (url or "").lower()
    return any(p in u for p in _JUNK_PATTERNS)


def _clean(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    text = _html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _resolve(href):
    if not href:
        return ""
    if href.startswith("http"):
        return href
    uddg = parse_qs(urlsplit(href).query).get("uddg", [""])[0]
    return unquote(uddg) if uddg else href


def _get(opener, url, referer="https://duckduckgo.com/"):
    req = Request(url, headers={
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": referer,
    })
    with opener.open(req, timeout=_TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


# --- vqd handshake (con cache global) ----------------------------------------
def _fetch_vqd(opener, sample_query="Ethereum"):
    params = {"q": sample_query, "kl": "wt-wt"}
    url = "https://duckduckgo.com/?" + urlencode(params)
    try:
        page = _get(opener, url)
    except Exception as e:
        logger.warning(f"[WebSearch/DDG] homepage failed: {e}")
        return None, url
    m = (re.search(r'"vqd"\s*:\s*"([^"]+)"', page)
         or re.search(r'vqd=([\d-]+)', page)
         or re.search(r"vqd='?([\d-]+)", page))
    return (m.group(1) if m else None), url


def _ensure_vqd():
    """Devuelve el vqd cacheado; refresca si expiró."""
    with _VQD_LOCK:
        if _VQD_STATE["token"] and (time.time() - _VQD_STATE["ts"]) < _VQD_TTL:
            return _VQD_STATE["token"], _VQD_STATE["home_url"]
    opener = _get_opener()
    vqd, home_url = _fetch_vqd(opener)
    if vqd:
        with _VQD_LOCK:
            _VQD_STATE["token"] = vqd
            _VQD_STATE["home_url"] = home_url
            _VQD_STATE["ts"] = time.time()
    return vqd, home_url


def _invalidate_vqd():
    with _VQD_LOCK:
        _VQD_STATE["token"] = None
        _VQD_STATE["home_url"] = None
        _VQD_STATE["ts"] = 0.0


# --- Methods ------------------------------------------------------------------
def _try_ijs(opener, search_query, vqd, home_url, n, df=None):
    params = {"q": search_query, "l": "wt-wt", "o": "json",
              "vqd": vqd, "f": ",,,", "no_html": "1"}
    if df:
        params["df"] = df
    url = "https://duckduckgo.com/i.js?" + urlencode(params)
    try:
        raw = _get(opener, url, referer=home_url or "https://duckduckgo.com/")
    except Exception as e:
        logger.debug(f"[WebSearch/DDG] i.js failed: {e}")
        return []
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return []
    out = []
    for item in (data.get("results") or [])[:n]:
        title = _clean(item.get("title", ""))
        url_r = _resolve(item.get("url") or "")
        snippet = _clean(item.get("abstract") or item.get("excerpt") or "")
        if title and url_r and not _is_junk(url_r):
            out.append({"title": title, "url": url_r, "snippet": snippet})
    return out


def _try_lite_vqd(opener, search_query, vqd, home_url, n, df=None):
    params = {"q": search_query, "kl": "wt-wt", "vqd": vqd}
    if df:
        params["df"] = df
    url = "https://duckduckgo.com/lite/?" + urlencode(params)
    try:
        page = _get(opener, url, referer=home_url or "https://duckduckgo.com/")
    except Exception as e:
        logger.debug(f"[WebSearch/DDG] lite+vqd failed: {e}")
        return []
    return _parse_ddg_html(page, n)


def _try_post_fallback(opener, search_query, n, df=None):
    form = {"q": search_query, "kl": "wt-wt"}
    if df:
        form["df"] = df
    encoded = urlencode(form).encode("utf-8")
    for url in (_LITE_URL, _HTML_URL):
        try:
            req = Request(url, data=encoded, headers={
                "User-Agent": _UA,
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "text/html",
                "Referer": "https://duckduckgo.com/",
                "Accept-Language": "en-US,en;q=0.9",
            })
            with opener.open(req, timeout=_TIMEOUT) as resp:
                page = resp.read().decode("utf-8", "replace")
        except Exception:
            continue
        results = _parse_ddg_html(page, n)
        if results:
            return results
    return []


def _parse_ddg_html(page, n):
    links = []
    for m in re.finditer(r"<a\b([^>]*)>(.*?)</a>", page, re.S | re.I):
        attrs, inner = m.group(1), m.group(2)
        if "result-link" in attrs:
            hm = re.search(r'href="([^"]+)"', attrs)
            links.append((hm.group(1) if hm else "", _clean(inner)))
    snippets = [
        _clean(s) for s in re.findall(r'class="result-snippet"[^>]*>(.*?)</td>', page, re.S | re.I)
    ]
    if not links:
        for m in re.finditer(r'<a\b([^>]*class="[^"]*result__a[^"]*"[^>]*)>(.*?)</a>', page, re.S | re.I):
            attrs, inner = m.group(1), m.group(2)
            hm = re.search(r'href="([^"]+)"', attrs)
            links.append((hm.group(1) if hm else "", _clean(inner)))
        snippets = [
            _clean(s) for s in re.findall(r'class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', page, re.S | re.I)
        ]
    results = []
    for i, (href, title) in enumerate(links):
        url_r = _resolve(href)
        if not title or not url_r or _is_junk(url_r):
            continue
        results.append({"title": title, "url": url_r,
                        "snippet": snippets[i] if i < len(snippets) else ""})
        if len(results) >= n:
            break
    return results


# --- Pipeline ----------------------------------------------------------------
def _ddg_pipeline(query_text, n, df):
    """POST barato primero, luego vqd + i.js + lite+vqd si hace falta."""
    opener = _get_opener()

    results = _try_post_fallback(opener, query_text, n, df)
    if results:
        return results, "post"

    vqd, home_url = _ensure_vqd()
    if vqd:
        results = _try_ijs(opener, query_text, vqd, home_url, n, df)
        if results:
            return results, "i.js"
        results = _try_lite_vqd(opener, query_text, vqd, home_url, n, df)
        if results:
            return results, "lite+vqd"
        # vqd pudo quedar invalido (nos bot-chequearon), refrescar proxima vez.
        _invalidate_vqd()

    return [], None


# ═══════════════════════════════════════════════════════════════════════════
# SERPAPI (primary) - Google Search API
# ═══════════════════════════════════════════════════════════════════════════
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


# ═══════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════
def _finalize(query, results, provider, src_key, widened, method=None):
    """Arma el dict de respuesta con el shape estable (+ widened/note)."""
    out = {"query": query, "count": len(results),
           "results": results, "provider": provider}
    prov_label = {"serpapi": "SerpApi"}.get(provider, "DuckDuckGo")
    if widened:
        out["widened"] = True
        out["widened_reason"] = f"sin resultados con filtro '{src_key}'"
        out["note"] = (
            f"AVISO: el filtro source='{src_key}' no devolvio resultados y la busqueda "
            f"se AMPLIO a web general via {prov_label}. Los resultados NO son de '{src_key}'. "
            f"Informalo al usuario."
        )
    logger.info(
        f"[WebSearch] '{query[:40]}' -> {len(results)} via "
        + (f"{provider}:{method}" if method else provider)
        + (" (widened)" if widened else "")
    )
    return out


def web_search(query, max_results=6, time_range=None, source=None):
    """Busca primero en DuckDuckGo; si no da resultados, fallback a SerpApi.

    SerpApi se usa LO MINIMO POSIBLE (cuota de 250/mes): solo se llama cuando
    DDG devuelve 0 (bot-check/timeout/vacio).

    source: 'reddit'|'x'|'news'|'all'. time_range: 'day'|'week'|'month'|'year'.
    Nunca lanza: devuelve count=0 con 'error' en caso de bloqueo/fallo.

    Auto-ampliacion: si un `source` (reddit/x) rinde 0, reintenta sin filtro y
    marca `widened=True` + `note` para que el modelo y la UI informen honestamente.
    """
    query = (query or "").strip()
    if not query:
        return {"query": query, "count": 0, "results": [], "error": "consulta vacía"}

    try:
        n = int(max_results)
    except (TypeError, ValueError):
        n = 6
    n = max(1, min(n, _MAX_RESULTS_CAP))

    src_key = str(source or "all").lower()
    site = _SOURCE_MAP.get(src_key, "")
    df = _DF_MAP.get(str(time_range or "").lower())
    has_domain = src_key in _SERPAPI_SOURCE_HOSTS

    # --- Ruta primaria: DuckDuckGo (gratis, sin cuota) ----------------------
    filtered = f"{query} {site}".strip() if site else query
    _wait_slot()
    results, method = _ddg_pipeline(filtered, n, df)

    widened = False
    if not results and site:
        _wait_slot()
        results, method = _ddg_pipeline(query, n, df)
        if results:
            widened = True

    if results:
        return _finalize(query, results, "duckduckgo", src_key, widened, method=method)

    # --- Fallback: SerpApi (solo si DDG no dio nada) ------------------------
    if _HAS_SERPAPI:
        logger.info(f"[WebSearch] '{query[:40]}' ddg vacio; probando serpapi (fallback)")
        sres, serr = _serpapi_search(query, n, df, src_key)
        if sres is not None:  # SerpApi respondio (no error de red/auth/cuota)
            s_widened = False
            if not sres and has_domain:
                plain, _ = _serpapi_search(query, n, df, "all")
                if plain:
                    sres, s_widened = plain, True
            if sres:
                return _finalize(query, sres, "serpapi", src_key, s_widened)
            logger.info(f"[WebSearch] '{query[:40]}' -> 0 results (serpapi)")
            return {"query": query, "count": 0, "results": [],
                    "provider": "serpapi", "error": "SerpApi sin resultados"}
        logger.info(f"[WebSearch] serpapi fallo ({serr})")

    logger.info(f"[WebSearch] '{query[:40]}' -> 0 results")
    return {"query": query, "count": 0, "results": [],
            "provider": "duckduckgo", "error": "DDG bot-check o búsqueda vacía"}
