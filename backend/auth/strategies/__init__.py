"""Authentication strategies — password hashing and JWT token management."""

from auth.strategies.password_strategy import (
    hash_password,
    verify_password,
    dummy_verify_password,
)
from auth.strategies.jwt_strategy import (
    encode_access_token,
    encode_refresh_token,
    generate_token_pair,
    decode_token,
    is_blacklisted,
    blacklist_token,
    store_refresh_token,
    validate_refresh_token,
    revoke_refresh_token,
    revoke_all_refresh_tokens,
    record_rotated_token,
    is_rotated_token,
)

__all__ = [
    "hash_password",
    "verify_password",
    "dummy_verify_password",
    "encode_access_token",
    "encode_refresh_token",
    "generate_token_pair",
    "decode_token",
    "is_blacklisted",
    "blacklist_token",
    "store_refresh_token",
    "validate_refresh_token",
    "revoke_refresh_token",
    "revoke_all_refresh_tokens",
    "record_rotated_token",
    "is_rotated_token",
]
