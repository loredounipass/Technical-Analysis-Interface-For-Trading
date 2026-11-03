"""Persistence for anonymous market-data preferences."""

from database.chat_store import get_connection, normalize_owner_id


def get_crypto_provider(owner_id):
    owner_id = normalize_owner_id(owner_id)
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO market_data_preferences (owner_id)
            VALUES (%s)
            ON CONFLICT (owner_id) DO NOTHING
            """,
            (owner_id,),
        )
        cursor.execute(
            """
            SELECT crypto_provider
            FROM market_data_preferences
            WHERE owner_id = %s
            """,
            (owner_id,),
        )
        row = cursor.fetchone()
        return row["crypto_provider"]


def update_crypto_provider(owner_id, provider):
    owner_id = normalize_owner_id(owner_id)
    if provider not in ("binance", "coinbase"):
        raise ValueError("crypto_provider must be binance or coinbase.")
    with get_connection() as connection, connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO market_data_preferences (owner_id, crypto_provider)
            VALUES (%s, %s)
            ON CONFLICT (owner_id) DO UPDATE
            SET crypto_provider = EXCLUDED.crypto_provider,
                updated_at = NOW()
            """,
            (owner_id, provider),
        )
        return provider
