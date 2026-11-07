"""Integration and unit tests verifying the protection of all private routes.

Tests ensure:
1. Rejection of unauthenticated requests across all private endpoints (401).
2. Rejection of invalid authorization formats (401).
3. Rejection of expired, tampered, or wrong-type (refresh) tokens (401).
4. Rejection of blacklisted / revoked tokens (401).
5. Rejection of deactivated accounts (401).
6. Multi-tenant row-level authorization (IDOR / BOLA):
   - User A cannot access, mutate, or delete User B's chat sessions.
   - Forged X-Chat-Owner-ID headers are completely ignored.
7. Public routes remain openly accessible without tokens.
"""

import os
import sys
import time
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

# Setup sys.path and mock background streamers before app import
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Patch background worker threads and DB initialization before app import
patch("database.chat_store.initialize_database").start()
patch("common.sockets.init_sockets").start()
patch("gateways.stream_manager.init_market_streams").start()

from app import app
from auth.constants import TOKEN_TYPE_ACCESS, TOKEN_TYPE_REFRESH
from auth.strategies import jwt_strategy


class TestPrivateRoutesProtection(unittest.TestCase):
    """Test global JWT guard and route protection across all endpoints."""

    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()

        # Create two mock users for multi-tenant isolation tests
        cls.user_a_id = uuid4()
        cls.user_b_id = uuid4()

        cls.user_a = {
            "id": cls.user_a_id,
            "email": "user_a@synapse.com",
            "username": "user_a",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        cls.user_b = {
            "id": cls.user_b_id,
            "email": "user_b@synapse.com",
            "username": "user_b",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }

        # Generate valid access tokens
        cls.token_a, _, _ = jwt_strategy.encode_access_token(str(cls.user_a_id))
        cls.token_b, _, _ = jwt_strategy.encode_access_token(str(cls.user_b_id))

        # Generate a refresh token (which must be rejected on access routes)
        with patch("auth.strategies.jwt_strategy.store_refresh_token"):
            cls.refresh_token, _ = jwt_strategy.encode_refresh_token(str(cls.user_a_id))

    # ─────────────────────────────────────────────────────────────────────────
    # 1. UN趋THENTICATED ACCESS REJECTION (MISSING TOKEN -> 401)
    # ─────────────────────────────────────────────────────────────────────────

    def test_all_private_endpoints_reject_missing_token(self):
        """Verify every single private endpoint returns 401 when no token is sent."""
        dummy_uuid = "123e4567-e89b-12d3-a456-426614174000"

        private_routes = [
            ("GET", "/api/trading/provider-preference"),
            ("PATCH", "/api/trading/provider-preference"),
            ("GET", "/api/trading/BTCUSDT"),
            ("GET", "/api/news/BTCUSDT"),
            ("POST", "/api/tts"),
            ("POST", "/api/chat"),
            ("GET", "/api/chat/state"),
            ("POST", "/api/chat/state/import"),
            ("PATCH", "/api/chat/preferences"),
            ("POST", "/api/chat/sessions"),
            ("POST", f"/api/chat/sessions/{dummy_uuid}/messages"),
            ("PATCH", f"/api/chat/sessions/{dummy_uuid}/welcome"),
            ("DELETE", f"/api/chat/sessions/{dummy_uuid}"),
            ("GET", "/api/search/health"),
            ("GET", "/api/auth/profile"),
            ("POST", "/api/auth/logout"),
        ]

        for method, path in private_routes:
            with self.subTest(method=method, path=path):
                if method == "GET":
                    res = self.client.get(path)
                elif method == "POST":
                    res = self.client.post(path, json={})
                elif method == "PATCH":
                    res = self.client.patch(path, json={})
                elif method == "DELETE":
                    res = self.client.delete(path)

                self.assertEqual(
                    res.status_code,
                    401,
                    f"Route {method} {path} should be private but returned {res.status_code}",
                )
                self.assertIn("error", res.get_json())

    # ─────────────────────────────────────────────────────────────────────────
    # 2. INVALID AUTHORIZATION HEADER FORMATS
    # ─────────────────────────────────────────────────────────────────────────

    def test_invalid_authorization_formats_rejected(self):
        invalid_headers = [
            {"Authorization": "Basic dXNlcjpwYXNz"},
            {"Authorization": "Token 123456789"},
            {"Authorization": "Bearer"},  # Missing token
            {"Authorization": "Bearer   "},  # Blank token
            {"Authorization": "something-random"},
        ]

        for headers in invalid_headers:
            with self.subTest(headers=headers):
                res = self.client.get("/api/chat/state", headers=headers)
                self.assertEqual(res.status_code, 401)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. FORGED, TAMPERED, EXPIRED, AND WRONG-TYPE TOKENS
    # ─────────────────────────────────────────────────────────────────────────

    def test_tampered_token_signature_rejected(self):
        tampered = self.token_a[:-4] + "fake"
        res = self.client.get(
            "/api/chat/state",
            headers={"Authorization": f"Bearer {tampered}"},
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("invalid", res.get_json()["error"].lower())

    def test_expired_token_rejected(self):
        import jwt as pyjwt
        now = int(time.time())
        expired_payload = {
            "sub": str(self.user_a_id),
            "jti": "mock_jti",
            "type": TOKEN_TYPE_ACCESS,
            "iat": now - 3600,
            "exp": now - 1800,
        }
        expired_token = pyjwt.encode(
            expired_payload, jwt_strategy.SECRET_KEY, algorithm="HS256"
        )

        res = self.client.get(
            "/api/chat/state",
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("expired", res.get_json()["error"].lower())

    def test_refresh_token_used_as_access_token_rejected(self):
        """A refresh token must not be accepted on protected API routes."""
        res = self.client.get(
            "/api/chat/state",
            headers={"Authorization": f"Bearer {self.refresh_token}"},
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("invalid token type", res.get_json()["error"].lower())

    # ─────────────────────────────────────────────────────────────────────────
    # 4. REVOKED / BLACKLISTED TOKENS (LOGOUT VALIDATION)
    # ─────────────────────────────────────────────────────────────────────────

    @patch("database.user_store.find_by_id")
    @patch("app.is_blacklisted", return_value=True)
    def test_blacklisted_token_rejected(self, mock_is_blacklisted, mock_find_user):
        mock_find_user.return_value = self.user_a

        res = self.client.get(
            "/api/chat/state",
            headers={"Authorization": f"Bearer {self.token_a}"},
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("revoked", res.get_json()["error"].lower())

    # ─────────────────────────────────────────────────────────────────────────
    # 5. DEACTIVATED ACCOUNTS
    # ─────────────────────────────────────────────────────────────────────────

    @patch("database.user_store.find_by_id")
    @patch("app.is_blacklisted", return_value=False)
    def test_deactivated_user_token_rejected(self, mock_is_blacklisted, mock_find_user):
        deactivated = dict(self.user_a)
        deactivated["is_active"] = False
        mock_find_user.return_value = deactivated

        res = self.client.get(
            "/api/chat/state",
            headers={"Authorization": f"Bearer {self.token_a}"},
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("inactive", res.get_json()["error"].lower())

    # ─────────────────────────────────────────────────────────────────────────
    # 6. ROW-LEVEL AUTHORIZATION & IDOR ISOLATION
    # ─────────────────────────────────────────────────────────────────────────

    @patch("database.user_store.find_by_id")
    @patch("app.is_blacklisted", return_value=False)
    @patch("database.chat_store.get_state")
    def test_authenticated_user_only_gets_their_own_chat_state(
        self, mock_get_state, mock_is_blacklisted, mock_find_user
    ):
        mock_find_user.return_value = self.user_a
        mock_get_state.return_value = {
            "selected_model": "nvidia-nemotron",
            "web_search_enabled": False,
            "sessions": [{"id": "session-1", "title": "User A BTC Trade"}],
        }

        # User A makes request with User B's header to attempt ID spoofing
        res = self.client.get(
            "/api/chat/state",
            headers={
                "Authorization": f"Bearer {self.token_a}",
                "X-Chat-Owner-ID": str(self.user_b_id),  # Spoofing attempt
            },
        )
        self.assertEqual(res.status_code, 200)

        # Verify chat_store was called with User A's ID, completely ignoring spoofed header
        mock_get_state.assert_called_once_with(self.user_a_id)

    @patch("database.user_store.find_by_id")
    @patch("app.is_blacklisted", return_value=False)
    @patch("database.chat_store.delete_session", return_value=False)
    def test_user_cannot_delete_other_user_session_idor(
        self, mock_delete_session, mock_is_blacklisted, mock_find_user
    ):
        mock_find_user.return_value = self.user_a
        other_session = uuid4()

        # User A attempts to delete session owned by User B
        res = self.client.delete(
            f"/api/chat/sessions/{other_session}",
            headers={"Authorization": f"Bearer {self.token_a}"},
        )

        # DB returns rowcount=0, translated to 404 Not Found
        self.assertEqual(res.status_code, 404)
        mock_delete_session.assert_called_once_with(self.user_a_id, other_session)

    @patch("database.user_store.find_by_id")
    @patch("app.is_blacklisted", return_value=False)
    @patch("database.chat_store.add_message", return_value=False)
    def test_user_cannot_append_message_to_other_user_session_idor(
        self, mock_add_message, mock_is_blacklisted, mock_find_user
    ):
        mock_find_user.return_value = self.user_a
        other_session = uuid4()

        res = self.client.post(
            f"/api/chat/sessions/{other_session}/messages",
            headers={"Authorization": f"Bearer {self.token_a}"},
            json={"role": "user", "content": "Tampering with User B's session"},
        )

        self.assertEqual(res.status_code, 404)
        mock_add_message.assert_called_once()

    @patch("database.user_store.find_by_id")
    @patch("app.is_blacklisted", return_value=False)
    @patch("database.market_preferences.get_crypto_provider", return_value="coinbase")
    def test_trading_provider_preference_bound_to_token(
        self, mock_get_provider, mock_is_blacklisted, mock_find_user
    ):
        mock_find_user.return_value = self.user_a

        res = self.client.get(
            "/api/trading/provider-preference",
            headers={
                "Authorization": f"Bearer {self.token_a}",
                "X-Chat-Owner-ID": str(self.user_b_id),  # Spoofing attempt
            },
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["crypto_provider"], "coinbase")
        mock_get_provider.assert_called_once_with(self.user_a_id)

    # ─────────────────────────────────────────────────────────────────────────
    # 7. PUBLIC ROUTES ACCESSIBILITY (OPT-OUT VERIFICATION)
    # ─────────────────────────────────────────────────────────────────────────

    def test_public_routes_accessible_without_tokens(self):
        """Public endpoints must NOT require Authorization header."""
        res_feed = self.client.get("/api/trading/feed-health")
        self.assertEqual(res_feed.status_code, 200)

        res_models = self.client.get("/api/models")
        self.assertEqual(res_models.status_code, 200)
        self.assertIsInstance(res_models.get_json(), list)


if __name__ == "__main__":
    unittest.main(verbosity=2)
