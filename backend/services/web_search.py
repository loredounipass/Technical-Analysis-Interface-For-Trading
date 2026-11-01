"""Búsqueda web para el agente de chat.

Provider principal: Google Custom Search JSON API (requiere GOOGLE_CSE_API_KEY
+ GOOGLE_CSE_CX en backend/.env). Fallback automático: DuckDuckGo sin API key
(vqd handshake + i.js + lite HTML + POST), sólo si Google no está configurado
o devuelve error de cuota/red.

Interfaz estable: web_search(query, max_results, time_range, source) ->
  { query, count, results: [{title, url, snippet}], provider, [error], [widened] }

`source`: 'all' | 'news' | 'reddit' | 'x'. `time_range`: 'day'|'week'|'month'|'year'.
Nunca lanza excepción al caller: devuelve count=0 con 'error' en su lugar.
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

_TIMEOUT = 8
_MAX_RESULTS_CAP = 10

_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# ─── Config: Google CSE ──────────────────────────────────────────────────────
_GOOGLE_API_KEY = (os.environ.get("GOOGLE_CSE_API_KEY") or "").strip()
_GOOGLE_CX = (os.environ.get("GOOGLE_CSE_CX") or "").strip()
_GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1"
_GOOGLE_TIMEOUT = 10
_HAS_GOOGLE = bool(_GOOGLE_API_KEY and _GOOGLE_CX)

if _HAS_GOOGLE:
    logger.info(
        f"[WebSearch] provider=google (cx={_GOOGLE_CX[:8]}…, "
        f"key={_GOOGLE_API_KEY[:6]}…{_GOOGLE_API_KEY[-4:]})"
    )
else:
    logger.info("[WebSearch] provider=duckduckgo (GOOGLE_CSE_* no configurados)")

# ─── Params / filtros ────────────────────────────────────────────────────────
# Google `dateRestrict` usa una letra seguida de optional count; 'd'/'w'/'m'/'y'
# sin prefijo significan "en las ultimas 24h / semana / mes / anio".
_GOOGLE_DF = {
    "day": "d", "d": "d",
    "week": "w", "w": "w",
    "month": "m", "mo": "m",
    "year": "y", "y": "y",
}

# DuckDuckGo `df` (mismo vocabulario).
_DD_DF = dict(_GOOGLE_DF)

_SOURCE_MAP = {
    "reddit": "site:reddit.com",
    "x": "site:x.com OR site:twitter.com",
    "twitter": "site:x.com OR site:twitter.com",
    "news": "",
    "all": "",
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
)


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


# ═══════════════════════════════════════════════════════════════════════════
# GOOGLE CUSTOM SEARCH JSON API (primary)
# ═══════════════════════════════════════════════════════════════════════════
def _google_search(query_text, n, df=None):
    """Una sola request REST. Devuelve (results_list, err_str_or_None).

    results_list=None -> fallo de red/auth/quota (caller puede hacer fallback).
    results_list=[]   -> Google respondio OK pero sin items (no fallback).
    """
    params = {"key": _GOOGLE_API_KEY, "cx": _GOOGLE_CX, "q": query_text, "num": str(n)}
    if df:
        params["dateRestrict"] = df
    url = _GOOGLE_ENDPOINT + "?" + urlencode(params)
    req = Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    try:
        with urlopen(req, timeout=_GOOGLE_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except HTTPError as e:
        try:
            body = e.read().decode("utf-8", "replace")
            err_data = json.loads(body).get("error", {})
            msg = err_data.get("message") or f"HTTP {e.code}"
        except Exception:
            msg = f"HTTP {e.code}"
        logger.warning(f"[WebSearch/Google] {query_text[:40]!r} -> {msg}")
        return None, msg
    except Exception as e:
        logger.warning(f"[WebSearch/Google] network error: {e}")
        return None, str(e)

    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return None, "invalid json"

    if "error" in data:
        err = data.get("error") or {}
        msg = err.get("message", "google api error")
        status = err.get("status", "")
        logger.warning(f"[WebSearch/Google] api error {status}: {msg}")
        return None, msg

    items = data.get("items") or []
    out = []
    for it in items[:n]:
        title = _clean(it.get("title", ""))
        url_r = it.get("link", "") or ""
        snippet = _clean(it.get("snippet", ""))
        if not title or not url_r or _is_junk(url_r):
            continue
        out.append({"title": title, "url": url_r, "snippet": snippet})
    return out, None


def _web_search_google(query, n, df, src_key, site):
    """Ruta Google con auto-widening si el filtro `site:` no dio nada."""
    filtered = f"{query} {site}".strip() if site else query
    results, err = _google_search(filtered, n, df)

    if results is None:
        # Error (cuota, auth, red) -> se cae a DDG desde el caller.
        return None, err, False

    if not results and site:
        # Reintentar sin el site: operator (el mismo problema de indexado que
        # teniamos con DDG en X, pero Google lo hace mejor, asi que raramente
        # pasa; igual cubrimos el caso).
        widened_results, werr = _google_search(query, n, df)
        if widened_results:
            logger.info(
                f"[WebSearch/Google] '{query[:40]}' widened (site filter '{src_key}' dio 0)"
            )
            return widened_results, None, True
        if widened_results is None:
            return None, werr, False

    return results, None, False


# ═══════════════════════════════════════════════════════════════════════════
# DUCKDUCKGO (fallback / sin API key)
# ═══════════════════════════════════════════════════════════════════════════
# Session persistente + cache global de vqd para reducir handshakes.
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
_VQD_TTL = 300.0

# Throttle global: espaciar requests para no provocar bot-check de DDG.
_THROTTLE_LOCK = threading.Lock()
_last_call = [0.0]
_MIN_INTERVAL = 1.2


def _wait_slot():
    with _THROTTLE_LOCK:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_call[0])
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.monotonic()


def _get(opener, url, referer="https://duckduckgo.com/"):
    req = Request(url, headers={
        "User-Agent": _UA,
        "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": referer,
    })
    with opener.open(req, timeout=_TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


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
        _invalidate_vqd()

    return [], None


def _web_search_ddg(query, n, df, src_key, site):
    filtered = f"{query} {site}".strip() if site else query
    _wait_slot()
    results, method = _ddg_pipeline(filtered, n, df)

    widened = False
    if not results and site:
        _wait_slot()
        results, method = _ddg_pipeline(query, n, df)
        if results:
            widened = True
            logger.info(f"[WebSearch/DDG] '{query[:40]}' widened (site filter dio 0)")

    return results, method, widened


# ═══════════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════════
def web_search(query, max_results=6, time_range=None, source=None):
    """Busca en la web. Google CSE si esta configurado, DDG como fallback.

    source: 'reddit'|'x'|'news'|'all'. time_range: 'day'|'week'|'month'|'year'.
    Nunca lanza: devuelve count=0 con 'error' en caso de bloqueo/fallo.

    Si `source` rinde 0 resultados utiles, reintenta sin el filtro `site:` y
    marca `widened=True` en la respuesta.
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
    df = _GOOGLE_DF.get(str(time_range or "").lower()) if _HAS_GOOGLE else _DD_DF.get(str(time_range or "").lower())

    # 1) Google como provider principal si esta configurado.
    if _HAS_GOOGLE:
        results, err, widened = _web_search_google(query, n, df, src_key, site)
        if results is not None:
            if results:
                logger.info(
                    f"[WebSearch] '{query[:40]}' -> {len(results)} via google"
                    + (" (widened)" if widened else "")
                )
                out = {"query": query, "count": len(results),
                       "results": results, "provider": "google"}
                if widened:
                    out["widened"] = True
                    out["widened_reason"] = f"sin resultados con filtro '{src_key}'"
                return out
            # Google respondio OK pero 0 items (y no hay site filter, o widening
            # ya se intento): devolver vacio sin caer a DDG.
            logger.info(f"[WebSearch] '{query[:40]}' -> 0 via google (no error)")
            return {"query": query, "count": 0, "results": [], "provider": "google",
                    "error": "sin resultados"}
        # Google fallo (quota/auth/red) -> fallback DDG.
        logger.info(f"[WebSearch] google unavailable ({err}), usando DDG fallback")

    # 2) DuckDuckGo (fallback automatico, o provider unico si no hay Google).
    results, method, widened = _web_search_ddg(query, n, df, src_key, site)
    if results:
        logger.info(
            f"[WebSearch] '{query[:40]}' -> {len(results)} via ddg:{method}"
            + (" (widened)" if widened else "")
        )
        out = {"query": query, "count": len(results),
               "results": results, "provider": "duckduckgo"}
        if widened:
            out["widened"] = True
            out["widened_reason"] = f"sin resultados con filtro '{src_key}'"
        return out

    logger.info(f"[WebSearch] '{query[:40]}' -> 0 results (todos los metodos)")
    return {"query": query, "count": 0, "results": [],
            "provider": "duckduckgo", "error": "DDG bot-check o búsqueda vacía"}
