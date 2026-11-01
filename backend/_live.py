import sys, os, re
sys.path.insert(0, os.path.dirname(__file__))
import logging
logging.basicConfig(level=logging.INFO, format='%(name)s %(levelname)s: %(message)s')

# Manual .env reader (dotenv not installed in system python).
env_path = os.path.join(os.path.dirname(__file__), ".env")
with open(env_path, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", line)
        if m:
            os.environ.setdefault(m.group(1), m.group(2))

import services.web_search as ws

print("provider loaded:", "GOOGLE" if ws._HAS_GOOGLE else "DDG")
print("cx:", ws._GOOGLE_CX)
masked = "key: " + ws._GOOGLE_API_KEY[:6] + "..." + ws._GOOGLE_API_KEY[-4:]
print(masked)

tests = [
    ("Ethereum ETH metrics", "x"),
    ("Ethereum news today", "news"),
    ("Bitcoin ETF inflows", "all"),
    ("Ethereum ETH reddit", "reddit"),
]

for q, src in tests:
    r = ws.web_search(q, max_results=5, source=src)
    print("\n[{}] '{}' -> count={} provider={} err={}".format(
        src, q, r["count"], r.get("provider"), r.get("error")))
    for x in r["results"][:3]:
        print("   ", x["title"][:60])
        print("      ", x["url"][:80])
