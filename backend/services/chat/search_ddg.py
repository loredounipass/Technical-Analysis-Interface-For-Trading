"""Pipeline de busqueda DuckDuckGo (scraper, proveedor principal).

Aqui vive el ESTADO MUTABLE de la sesion (opener con cookie jar, cache global de
vqd, throttle anti-bot-check y el User-Agent rotado) JUNTO con las funciones que
lo leen/escriben via `global`: _get_opener, _rotate_ua, _get. Mantenerlos en el
mismo modulo es obligatorio: si un lector importara _ACTIVE_UA/_OPENER por valor
desde otro modulo, tomaba una foto vieja y la rotacion de identidad no surtiria
efecto.

Estrategia por busqueda (ordenado por costo de requests):
  1) POST lite/html  -> 1 request, sin handshake.
  2) i.js JSON       -> usa token vqd cacheado (mejor calidad).
  3) lite+vqd HTML   -> alternativa HTML con la misma sesion.

Si un filtro `source` (site:) rinde 0 y aun queda presupuesto, reintenta sin
filtro y marca `widened`.
"""

import json
import logging
import random
import re
import threading
import time
from http.cookiejar import CookieJar
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPCookieProcessor, HTTPHandler

from services.chat.search_config import (
    _UA_POOL,
    _UA,
    _TIMEOUT,
    _DDG_BUDGET_S,
    _LITE_URL,
    _HTML_URL,
)
from services.chat.search_html import _clean, _resolve, _is_junk, _parse_ddg_html

logger = logging.getLogger(__name__)

# Simbolos que consume la fachada services.chat.web_search. Declararlos aqui
# documenta la union interna y evita falsos "not accessed" del linter (que
# analiza este modulo aislado y no ve el import desde web_search.py).
__all__ = ["_rotate_ua", "_ddg_search"]

# --- Session persistente + cache global de vqd -------------------------------
# Un unico opener con cookie jar compartido entre todas las busquedas. Reduce
# la probabilidad de que DDG sirva el desafio anti-bot (HTTP 202/403).
_UA_LOCK = threading.Lock()
_ACTIVE_UA = _UA  # UA de la busqueda en curso (rotado por _rotate_ua)
_OPENER_LOCK = threading.Lock()
_OPENER = None

_VQD_LOCK = threading.Lock()
_VQD_STATE = {"token": None, "home_url": None, "ts": 0.0}
_VQD_TTL = 300.0  # 5 minutos

# --- Throttle global: espaciar requests para no provocar bot-check -----------
# Con jitter aleatorio (uniform 1.2-2.5s): un intervalo fijo es patron de bot;
# uno variable parece comportamiento humano.
_THROTTLE_LOCK = threading.Lock()
_last_call = [0.0]
_MIN_INTERVAL = 1.2
_MAX_INTERVAL = 2.5


def _get_opener():
    global _OPENER
    with _OPENER_LOCK:
        if _OPENER is None:
            _OPENER = build_opener(HTTPCookieProcessor(CookieJar()), HTTPHandler())
        return _OPENER


def _wait_slot():
    with _THROTTLE_LOCK:
        interval = random.uniform(_MIN_INTERVAL, _MAX_INTERVAL)
        wait = interval - (time.monotonic() - _last_call[0])
        if wait > 0:
            time.sleep(wait)
        _last_call[0] = time.monotonic()


def _get(opener, url, referer="https://duckduckgo.com/"):
    req = Request(url, headers={
        "User-Agent": _ACTIVE_UA,
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


def _rotate_ua():
    """Elige un UA nuevo para la busqueda y resetea la sesion (cookie jar + vqd)
    para que el fingerprint UA/cookie sea coherente (una identidad nueva por
    busqueda, como un perfil de navegador fresco) y parezca natural."""
    global _OPENER, _ACTIVE_UA
    with _UA_LOCK:
        _ACTIVE_UA = random.choice(_UA_POOL)
    with _OPENER_LOCK:
        _OPENER = None  # proxima busqueda usa un cookie jar nuevo
    _invalidate_vqd()
    return _ACTIVE_UA


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


def _try_post_fallback(opener, search_query, n, df=None, deadline=None):
    form = {"q": search_query, "kl": "wt-wt"}
    if df:
        form["df"] = df
    encoded = urlencode(form).encode("utf-8")
    for url in (_LITE_URL, _HTML_URL):
        if deadline and time.monotonic() + _TIMEOUT > deadline:
            break  # no queda tiempo para otro request completo: ceder al fallback
        try:
            req = Request(url, data=encoded, headers={
                "User-Agent": _ACTIVE_UA,
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


# --- Pipeline ----------------------------------------------------------------
def _ddg_pipeline(query_text, n, df, deadline=None):
    """POST barato primero, luego vqd + i.js + lite+vqd si hace falta.
    `deadline` (time.monotonic()) acota el intento: si se supera, se corta y
    se regresa vacio para ceder rapido al fallback cuando DDG esta bloqueado."""
    opener = _get_opener()

    results = _try_post_fallback(opener, query_text, n, df, deadline)
    if results:
        return results, "post"

    if deadline and time.monotonic() + _TIMEOUT > deadline:
        return [], None  # fail-fast: no cabe otro request dentro del presupuesto

    vqd, home_url = _ensure_vqd()
    if vqd:
        results = _try_ijs(opener, query_text, vqd, home_url, n, df)
        if results:
            return results, "i.js"
        if deadline and time.monotonic() + _TIMEOUT > deadline:
            return [], None
        results = _try_lite_vqd(opener, query_text, vqd, home_url, n, df)
        if results:
            return results, "lite+vqd"
        # vqd pudo quedar invalido (nos bot-chequearon), refrescar proxima vez.
        _invalidate_vqd()

    return [], None


def _ddg_search(query, n, site, src_key, df):
    """Pipeline DDG con widening y presupuesto de tiempo (fail-fast).
    Devuelve (results, widened, method)."""
    deadline = time.monotonic() + _DDG_BUDGET_S
    filtered = f"{query} {site}".strip() if site else query
    _wait_slot()
    results, method = _ddg_pipeline(filtered, n, df, deadline)
    widened = False
    if not results and site and time.monotonic() + _TIMEOUT < deadline:
        _wait_slot()
        results, method = _ddg_pipeline(query, n, df, deadline)
        if results:
            widened = True
    return results, widened, method
