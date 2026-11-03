"""Búsqueda web para el agente de chat (punto de entrada / fachada).

Define la funcion publica `web_search(query, max_results, time_range, source)`
y el armado del dict de respuesta (`_finalize`). La logica esta dividida en
submodulos hermanos enfocados:

  - search_config.py   constantes (UA, timeouts, filtros, config SerpApi, orden
                       de proveedores + log de arranque).
  - search_html.py     helpers puros de parseo/limpieza.
  - search_ddg.py      scraper DuckDuckGo + estado de sesion (opener/vqd/UA).
  - search_serpapi.py  cliente SerpApi (fallback) + widening por host.

Interfaz estable: web_search(...) ->
  { query, count, results: [{title, url, snippet}], provider, [error], [widened], [note], [debug] }

`source`: 'all' | 'news' | 'reddit' | 'x'. `time_range`: 'day'|'week'|'month'|'year'.
Nunca lanza excepcion al caller: devuelve count=0 con 'error' en su lugar.

Se re-exportan _SERPAPI_API_KEY / _PROVIDER_ORDER / _HAS_SERPAPI para que el
endpoint de diagnostico (controllers/routes_chat.py, via `import
services.chat.web_search as ws`) siga leyendo la config activa sin cambios.
"""

import logging

from services.chat.search_config import (
    _MAX_RESULTS_CAP,
    _SOURCE_MAP,
    _DF_MAP,
    _SERPAPI_SOURCE_HOSTS,
    _PROVIDER_ORDER,
    _HAS_SERPAPI,
    _SERPAPI_API_KEY,
)
from services.chat.search_ddg import _rotate_ua, _ddg_search
from services.chat.search_serpapi import _serp_search

logger = logging.getLogger(__name__)

__all__ = ["web_search"]


# --- Public API --------------------------------------------------------------
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
    """Busqueda web con orden de proveedores configurable (WEB_SEARCH_PROVIDER).

    - 'duckduckgo' (default, ideal local): DDG primero (gratis, sin cuota) y SerpApi
      de respaldo cuando DDG da 0. Ahorra la cuota de SerpApi (250/mes).
    - 'serpapi' (ideal Render/nube): SerpApi primero y DDG de respaldo.

    source: 'reddit'|'x'|'news'|'all'. time_range: 'day'|'week'|'month'|'year'.
    Nunca lanza: devuelve count=0 con 'error' en caso de bloqueo/fallo.
    Auto-ampliacion: si un `source` (reddit/x) rinde 0, reintenta sin filtro y
    marca `widened=True` + `note` para informar honestamente.
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

    # Identidad fresca por busqueda (UA rotado + session nueva) para el scrapeo DDG.
    _rotate_ua()

    # Diagnosticos por proveedor: permiten ver en logs/health QUE paso realmente
    # (key cargada? DDG da 0? SerpApi errored/timout o 0?).
    dbg = {"order": _PROVIDER_ORDER, "serpapi_key": bool(_HAS_SERPAPI)}

    def _try_ddg():
        res, wid, method = _ddg_search(query, n, site, src_key, df)
        dbg["ddg"] = {"count": len(res), "widened": bool(wid), "method": method}
        if res:
            return _finalize(query, res, "duckduckgo", src_key, wid, method=method)
        return None

    def _try_serp():
        if not _HAS_SERPAPI:
            dbg["serpapi"] = {"skipped": "no SERPAPI_API_KEY"}
            return None
        res, wid, err = _serp_search(query, n, df, src_key, has_domain)
        if err is not None:
            dbg["serpapi"] = {"error": str(err)}
            logger.info(f"[WebSearch] serpapi fallo ({err})")
            return None
        dbg["serpapi"] = {"count": len(res), "widened": bool(wid)}
        if res:
            return _finalize(query, res, "serpapi", src_key, wid)
        # SerpApi respondio pero 0 resultados reales -> vacio autoritativo.
        return {"query": query, "count": 0, "results": [],
                "provider": "serpapi", "error": "SerpApi sin resultados", "debug": dbg}

    if _PROVIDER_ORDER == "serpapi" and _HAS_SERPAPI:
        out = _try_serp() or _try_ddg()
    else:
        out = _try_ddg() or _try_serp()

    if out:
        if isinstance(out, dict):
            out.setdefault("debug", dbg)
        return out

    logger.info(f"[WebSearch] '{query[:40]}' -> 0 results | debug={dbg}")
    return {"query": query, "count": 0, "results": [],
            "provider": _PROVIDER_ORDER or "duckduckgo",
            "error": "sin resultados (DDG bot-check / SerpApi)", "debug": dbg}
