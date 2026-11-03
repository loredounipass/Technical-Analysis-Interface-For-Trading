"""Helpers puros de parseo/limpieza de HTML para la busqueda web.

Sin estado ni red: resuelven URLs de redirect del buscador a su destino real,
limpian etiquetas HTML, detectan URLs basura y filtran por host (para el
widening de source reddit/x en SerpApi). `parse_ddg_html` extrae
title/url/snippet del HTML de lite/html.duckduckgo.com.
"""

import html as _html
import re
from urllib.parse import unquote, urlsplit, parse_qs

from services.chat.search_config import _JUNK_PATTERNS


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
