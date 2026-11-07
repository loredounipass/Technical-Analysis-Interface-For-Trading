"""Shared constants for the authentication module.

All magic numbers and prefix strings live here so they can be tuned from a
single location without touching business logic.
"""

# ── Token types ──────────────────────────────────────────────────────────────

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"

# ── Token lifetimes (seconds) ────────────────────────────────────────────────

DEFAULT_ACCESS_TOKEN_TTL = 900          # 15 minutes
DEFAULT_REFRESH_TOKEN_TTL = 604_800     # 7 days

# ── Password hashing ────────────────────────────────────────────────────────

BCRYPT_ROUNDS = 12

# ── Password constraints ────────────────────────────────────────────────────

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 72                # Bcrypt truncation boundary / DoS prevention

# ── Redis key prefixes ──────────────────────────────────────────────────────

REDIS_REFRESH_PREFIX = "auth:refresh"
REDIS_BLACKLIST_PREFIX = "auth:blacklist"
REDIS_LOGIN_ATTEMPTS_PREFIX = "auth:login_attempts"
REDIS_ROTATED_PREFIX = "auth:rotated"

# ── Rate-limiting / brute-force protection ───────────────────────────────────

MAX_LOGIN_ATTEMPTS = 5
LOGIN_ATTEMPTS_WINDOW = 900             # 15 minutes

# ── Session & token theft protection ─────────────────────────────────────────

ROTATED_TOKEN_TTL = 86_400              # 24 hours window to detect token theft
MAX_SESSIONS_PER_USER = 10              # Maximum concurrent active sessions
