"""Búsqueda web sin API key usando DuckDuckGo Lite (scraping de HTML).

Devuelve resultados compactos (titulo / url / snippet) para que el agente los
use como grounding externo y los cite. Implementado solo con la stdlib
(urllib + re) para no sumar dependencias ni requiring red del proveedor de pago.
"""

import html as _html
import logging
import re
from urllib.parse import unquote, urlencode, urlsplit, parse_qs
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)

_LITE_URL = "https://lite.duckduckgo.com/lite/"
_HTML_URL = "https://html.duckduckgo.com/html/"
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TIMEOUT = 12
_MAX_RESULTS_CAP = 10

# Restriccion de fuente para buscar tambien en redes sociales.
# 'reddit' y 'x' usan el operador site: de DuckDuckGo; 'news'/'all' = web general.
_SOURCE_MAP = {
    "reddit": "site:reddit.com",
    "x": "site:x.com OR site:twitter.com",
    "twitter": "site:x.com OR site:twitter.com",
    "news": "",
    "all": "",
}

# Ventana de frescura solicitada al buscador (param 'df' de DuckDuckGo).
_DF_MAP = {
    "day": "d", "d": "d",
    "week": "w", "w": "w",
    "month": "m", "mo": "m",
    "year": "y", "y": "y",
}


def _clean(text):
    """Elimina etiquetas HTML, desescapa entidades y colapsa espacios."""
    text = re.sub(r"<[^>]+>", "", text or "")
    text = _html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _resolve(href):
    """Convierte el enlace de redirección del lite (/l/?uddg=...) en la URL real."""
    if not href:
        return ""
    if href.startswith("http"):
        return href
    uddg = parse_qs(urlsplit(href).query).get("uddg", [""])[0]
    return unquote(uddg) if uddg else href


def _fetch(form, url):
    req = Request(
        url,
        data=urlencode(form).encode("utf-8"),
        headers={
            "User-Agent": _UA,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html",
        },
    )
    with urlopen(req, timeout=_TIMEOUT) as resp:
        return resp.read().decode("utf-8", "replace")


def _parse_lite(page):
    """lite.duckduckgo.com: enlaces class='result-link' y snippets en <td>."""
    links = []
    for m in re.finditer(r"<a\b([^>]*)>(.*?)</a>", page, re.S | re.I):
        attrs, inner = m.group(1), m.group(2)
        if "result-link" in attrs:
            hm = re.search(r'href="([^"]+)"', attrs)
            links.append((hm.group(1) if hm else "", _clean(inner)))
    snippets = [
        _clean(s)
        for s in re.findall(r'class="result-snippet"[^>]*>(.*?)</td>', page, re.S | re.I)
    ]
    return links, snippets


def _parse_html(page):
    """html.duckduckgo.com: enlaces class='result__a' y snippets class='result__snippet'."""
    links = []
    for m in re.finditer(r'<a\b([^>]*class="[^"]*result__a[^"]*"[^>]*)>(.*?)</a>', page, re.S | re.I):
        attrs, inner = m.group(1), m.group(2)
        hm = re.search(r'href="([^"]+)"', attrs)
        links.append((hm.group(1) if hm else "", _clean(inner)))
    snippets = [
        _clean(s)
        for s in re.findall(r'class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', page, re.S | re.I)
    ]
    if not snippets:
        snippets = [
            _clean(s)
            for s in re.findall(r'class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</span>', page, re.S | re.I)
        ]
    return links, snippets


def _build_results(links, snippets, n):
    out = []
    for i, (href, title) in enumerate(links):
        url = _resolve(href)
        if not title or not url:
            continue
        out.append({
            "title": title,
            "url": url,
            "snippet": snippets[i] if i < len(snippets) else "",
        })
        if len(out) >= n:
            break
    return out


def web_search(query, max_results=6, time_range=None, source=None):
    """Busca en DuckDuckGo (lite y, si no hay resultados, html) y devuelve
    {'query','count','results',...}.

    'source' ('reddit'|'x'|'news'|'all') restringe la busqueda a redes sociales
    o la deja como web general.

    Nunca lanza: ante cualquier fallo devuelve count=0 con 'error' para que el
    agente declare que no encontró información en lugar de romperse.
    """
    query = (query or "").strip()
    if not query:
        return {"query": query, "count": 0, "results": [], "error": "consulta vacía"}

    try:
        n = int(max_results)
    except (TypeError, ValueError):
        n = 6
    n = max(1, min(n, _MAX_RESULTS_CAP))

    site = _SOURCE_MAP.get(str(source or "all").lower(), "")
    search_query = f"{query} {site}".strip() if site else query

    form = {"q": search_query, "kl": "wt-wt"}
    df = _DF_MAP.get(str(time_range or "").lower())
    if df:
        form["df"] = df

    last_err = None
    for url, parser in ((_LITE_URL, _parse_lite), (_HTML_URL, _parse_html)):
        try:
            page = _fetch(form, url)
        except Exception as e:  # URLError / HTTPError / timeout
            last_err = e
            logger.warning(f"[WebSearch] fallo en {url}: {e}")
            continue
        links, snippets = parser(page)
        results = _build_results(links, snippets, n)
        if results:
            logger.info(f"[WebSearch] '{query}' -> {len(results)} resultado(s) via {url}")
            return {"query": query, "count": len(results), "results": results}

    if last_err is not None:
        return {"query": query, "count": 0, "results": [], "error": f"búsqueda falló: {last_err}"}
    logger.info(f"[WebSearch] '{query}' -> 0 resultado(s)")
    return {"query": query, "count": 0, "results": []}
