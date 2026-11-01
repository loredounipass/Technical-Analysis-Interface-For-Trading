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
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TIMEOUT = 12
_MAX_RESULTS_CAP = 10

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


def web_search(query, max_results=6, time_range=None):
    """Busca en DuckDuckGo Lite y devuelve {'query','count','results',...}.

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

    form = {"q": query}
    df = _DF_MAP.get(str(time_range or "").lower())
    if df:
        form["df"] = df

    req = Request(
        _LITE_URL,
        data=urlencode(form).encode("utf-8"),
        headers={
            "User-Agent": _UA,
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "text/html",
        },
    )

    try:
        with urlopen(req, timeout=_TIMEOUT) as resp:
            page = resp.read().decode("utf-8", "replace")
    except Exception as e:  # URLError / HTTPError / timeout
        logger.warning(f"[WebSearch] fallo DuckDuckGo Lite: {e}")
        return {"query": query, "count": 0, "results": [], "error": f"búsqueda falló: {e}"}

    # Enlaces de resultado: <a ... class="result-link" ...>Título</a>
    links = []
    for m in re.finditer(r"<a\b([^>]*)>(.*?)</a>", page, re.S | re.I):
        attrs, inner = m.group(1), m.group(2)
        if "result-link" in attrs:
            hm = re.search(r'href="([^"]+)"', attrs)
            links.append((hm.group(1) if hm else "", _clean(inner)))

    # Snippets: <td class="result-snippet">...</td> (alineados por índice)
    snippets = [
        _clean(s)
        for s in re.findall(r'class="result-snippet"[^>]*>(.*?)</td>', page, re.S | re.I)
    ]

    results = []
    for i, (href, title) in enumerate(links):
        url = _resolve(href)
        if not title or not url:
            continue
        results.append({
            "title": title,
            "url": url,
            "snippet": snippets[i] if i < len(snippets) else "",
        })
        if len(results) >= n:
            break

    logger.info(f"[WebSearch] '{query}' -> {len(results)} resultado(s)")
    return {"query": query, "count": len(results), "results": results}
