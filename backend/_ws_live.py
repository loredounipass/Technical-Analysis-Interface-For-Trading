import sys, os, time
sys.path.insert(0, os.path.dirname(__file__))
from services.web_search import web_search

cases = [
    ("Ethereum", "all", None),
    ("Ethereum ETH discussion", "reddit", "week"),
    ("bitcoin ETF inflows", "news", None),
]
for q, src, tr in cases:
    r = web_search(q, max_results=5, time_range=tr, source=src)
    print(f"\n=== source={src} '{q}' time={tr} -> count={r['count']} err={r.get('error')}")
    for item in r["results"][:3]:
        print("  -", item["title"][:60], "|", item["url"][:70])
    time.sleep(3)

print("\nRESULT done")
