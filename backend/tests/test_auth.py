"""Unit and security tests for the Authentication and Session module.

Tests cover:
1. DTO validation (RegisterDTO, LoginDTO, RefreshTokenDTO, AuthResponseDTO)
   - Password complexity: min 8, max 72, upper, lower, digit, symbol
   - Username normalization and character restrictions
   - Email validation
2. Password strategy (Bcrypt hashing, verification, timing attack dummy verify)
3. JWT strategy (Token generation, claims, expiry, tampering detection)
4. Auth service business logic (Registration, login, brute force, token theft detection)
5. Controller routes (/api/auth/*) via Flask test client
"""

import os
import sys
import time
import unittest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

# Add backend directory to sys.path so imports resolve cleanly
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from pydantic import ValidationError

from auth.constants import (
    DEFAULT_ACCESS_TOKEN_TTL,
    DEFAULT_REFRESH_TOKEN_TTL,
    MAX_LOGIN_ATTEMPTS,
    TOKEN_TYPE_ACCESS,
    TOKEN_TYPE_REFRESH,
)
from auth.dto import (
    AuthResponseDTO,
    LoginDTO,
    RefreshTokenDTO,
    RegisterDTO,
    UserResponseDTO,
)
from auth.strategies import jwt_strategy, password_strategy
from services import auth_service


# ─────────────────────────────────────────────────────────────────────────────
# 1. DTO VALIDATION TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestAuthDTOs(unittest.TestCase):
    """Test validation constraints on DTOs."""

    def test_register_dto_valid(self):
        dto = RegisterDTO(
            email="trader@synapse.com",
            username="ProTrader_99",
            password="Str0ng!PassWord",
        )
        self.assertEqual(dto.email, "trader@synapse.com")
        self.assertEqual(dto.username, "protrader_99")  # Normalized to lower
        self.assertEqual(dto.password, "Str0ng!PassWord")

    def test_register_dto_invalid_email(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="not-an-email",
                username="valid_user",
                password="Str0ng!PassWord",
            )
        self.assertIn("email", str(ctx.exception))

    def test_register_dto_password_too_short(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="trader@synapse.com",
                username="trader",
                password="Sh0!rt",  # < 8 chars
            )
        self.assertIn("at least 8 characters", str(ctx.exception))

    def test_register_dto_password_too_long(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="trader@synapse.com",
                username="trader",
                password="A" * 70 + "1!a" + "extra_chars_exceeding_72_boundary",
            )
        self.assertIn("must not exceed 72 characters", str(ctx.exception))

    def test_register_dto_password_missing_uppercase(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="trader@synapse.com",
                username="trader",
                password="lowercase123!pass",
            )
        self.assertIn("uppercase letter", str(ctx.exception))

    def test_register_dto_password_missing_lowercase(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="trader@synapse.com",
                username="trader",
                password="UPPERCASE123!PASS",
            )
        self.assertIn("lowercase letter", str(ctx.exception))

    def test_register_dto_password_missing_digit(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="trader@synapse.com",
                username="trader",
                password="NoDigitsHere!Pass",
            )
        self.assertIn("digit", str(ctx.exception))

    def test_register_dto_password_missing_symbol(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="trader@synapse.com",
                username="trader",
                password="NoSymbols123Pass",
            )
        self.assertIn("special character or symbol", str(ctx.exception))

    def test_register_dto_username_invalid_characters(self):
        with self.assertRaises(ValidationError) as ctx:
            RegisterDTO(
                email="trader@synapse.com",
                username="user@bad!chars",
                password="Str0ng!PassWord",
            )
        self.assertIn("Username may only contain letters", str(ctx.exception))

    def test_register_dto_username_length_boundaries(self):
        # Too short (<3)
        with self.assertRaises(ValidationError):
            RegisterDTO(email="a@b.com", username="ab", password="Str0ng!PassWord")
        # Too long (>30)
        with self.assertRaises(ValidationError):
            RegisterDTO(email="a@b.com", username="a" * 31, password="Str0ng!PassWord")

    def test_login_dto_valid(self):
        dto = LoginDTO(email="trader@synapse.com", password="anyPassword123!")
        self.assertEqual(dto.email, "trader@synapse.com")

    def test_login_dto_empty_password(self):
        with self.assertRaises(ValidationError):
            LoginDTO(email="trader@synapse.com", password="   ")

    def test_login_dto_excessive_password_length(self):
        with self.assertRaises(ValidationError):
            LoginDTO(email="trader@synapse.com", password="A" * 200)

    def test_refresh_token_dto_valid(self):
        dto = RefreshTokenDTO(refresh_token="valid.jwt.token")
        self.assertEqual(dto.refresh_token, "valid.jwt.token")

    def test_refresh_token_dto_empty(self):
        with self.assertRaises(ValidationError):
            RefreshTokenDTO(refresh_token="   ")

    def test_auth_response_dto_never_exposes_password_hash(self):
        uid = uuid4()
        now = datetime.now(timezone.utc)
        user_dict = {
            "id": uid,
            "email": "trader@synapse.com",
            "username": "trader",
            "password_hash": "$2b$12$secretHashThatMustNeverLeak",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        tokens = {
            "access_token": "mock.access.token",
            "refresh_token": "mock.refresh.token",
            "expires_in": 900,
        }
        resp = AuthResponseDTO.from_user_and_tokens(user_dict, tokens)
        dumped = resp.model_dump(mode="json")

        self.assertNotIn("password_hash", dumped["user"])
        self.assertNotIn("password_hash", dumped)
        self.assertEqual(dumped["token_type"], "Bearer")
        self.assertEqual(dumped["expires_in"], 900)
        self.assertEqual(dumped["user"]["id"], str(uid))


# ─────────────────────────────────────────────────────────────────────────────
# 2. PASSWORD STRATEGY TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestPasswordStrategy(unittest.TestCase):
    """Test bcrypt hashing, verification, and timing attack dummy check."""

    def test_hash_and_verify(self):
        password = "Str0ng!PassWord"
        hashed = password_strategy.hash_password(password)

        self.assertTrue(hashed.startswith("$2b$12$"))
        self.assertTrue(password_strategy.verify_password(password, hashed))
        self.assertFalse(password_strategy.verify_password("WrongPassword123!", hashed))

    def test_dummy_verify_password_timing_mitigation(self):
        # dummy_verify_password must run bcrypt.checkpw safely and return False
        result = password_strategy.dummy_verify_password("any_attempted_password")
        self.assertFalse(result)


# ─────────────────────────────────────────────────────────────────────────────
# 3. JWT STRATEGY TESTS
# ─────────────────────────────────────────────────────────────────────────────

class TestJWTStrategy(unittest.TestCase):
    """Test token encoding, decoding, validation, and expiry."""

    def test_access_token_creation_and_decoding(self):
        user_id = str(uuid4())
        token, jti, ttl = jwt_strategy.encode_access_token(user_id)

        self.assertEqual(ttl, DEFAULT_ACCESS_TOKEN_TTL)
        self.assertTrue(isinstance(jti, str) and len(jti) == 32)

        payload = jwt_strategy.decode_token(token)
        self.assertEqual(payload["sub"], user_id)
        self.assertEqual(payload["jti"], jti)
        self.assertEqual(payload["type"], TOKEN_TYPE_ACCESS)
        self.assertIn("exp", payload)
        self.assertIn("iat", payload)

    @patch("auth.strategies.jwt_strategy.store_refresh_token")
    def test_refresh_token_creation(self, mock_store):
        user_id = str(uuid4())
        token, jti = jwt_strategy.encode_refresh_token(user_id)

        mock_store.assert_called_once_with(user_id, jti)
        payload = jwt_strategy.decode_token(token)
        self.assertEqual(payload["sub"], user_id)
        self.assertEqual(payload["jti"], jti)
        self.assertEqual(payload["type"], TOKEN_TYPE_REFRESH)

    def test_expired_token_rejected(self):
        # Forge expired token
        import jwt as pyjwt
        now = int(time.time())
        expired_payload = {
            "sub": str(uuid4()),
            "jti": "mock_jti",
            "type": TOKEN_TYPE_ACCESS,
            "iat": now - 1000,
            "exp": now - 100,  # Expired in past
        }
        expired_token = pyjwt.encode(expired_payload, jwt_strategy.SECRET_KEY, algorithm="HS256")

        with self.assertRaises(ValueError) as ctx:
            jwt_strategy.decode_token(expired_token)
        self.assertIn("expired", str(ctx.exception).lower())

    def test_tampered_token_rejected(self):
        token, _, _ = jwt_strategy.encode_access_token(str(uuid4()))
        tampered_token = token[:-4] + "fake"

        with self.assertRaises(ValueError) as ctx:
            jwt_strategy.decode_token(tampered_token)
        self.assertIn("invalid", str(ctx.exception).lower())


# ─────────────────────────────────────────────────────────────────────────────
# 4. AUTH SERVICE TESTS (BUSINESS LOGIC)
# ─────────────────────────────────────────────────────────────────────────────

class TestAuthService(unittest.TestCase):
    """Test registration, login, token refresh, and logout business logic."""

    @patch("database.user_store.create_user")
    @patch("database.user_store.username_exists", return_value=False)
    @patch("database.user_store.email_exists", return_value=False)
    @patch("auth.strategies.jwt_strategy.store_refresh_token")
    def test_register_success(self, mock_store_rf, mock_email_ex, mock_user_ex, mock_create):
        uid = uuid4()
        now = datetime.now(timezone.utc)
        mock_create.return_value = {
            "id": uid,
            "email": "new_user@synapse.com",
            "username": "new_user",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }

        dto = RegisterDTO(
            email="new_user@synapse.com",
            username="new_user",
            password="ValidPass123!@",
        )
        result = auth_service.register(dto)

        self.assertEqual(result["user"]["email"], "new_user@synapse.com")
        self.assertIn("access_token", result)
        self.assertIn("refresh_token", result)

    @patch("database.user_store.email_exists", return_value=True)
    def test_register_duplicate_email(self, mock_email_ex):
        dto = RegisterDTO(
            email="existing@synapse.com",
            username="new_user",
            password="ValidPass123!@",
        )
        with self.assertRaises(ValueError) as ctx:
            auth_service.register(dto)
        self.assertIn("Email already registered", str(ctx.exception))

    @patch("database.user_store.username_exists", return_value=True)
    @patch("database.user_store.email_exists", return_value=False)
    def test_register_duplicate_username(self, mock_email_ex, mock_user_ex):
        dto = RegisterDTO(
            email="new_user@synapse.com",
            username="taken_user",
            password="ValidPass123!@",
        )
        with self.assertRaises(ValueError) as ctx:
            auth_service.register(dto)
        self.assertIn("Username already taken", str(ctx.exception))

    @patch("database.user_store.find_by_email")
    @patch("auth.strategies.jwt_strategy.store_refresh_token")
    @patch("auth.strategies.jwt_strategy._get_auth_redis", return_value=None)
    def test_login_success(self, mock_redis, mock_store_rf, mock_find):
        raw_pass = "ValidPass123!@"
        hashed = password_strategy.hash_password(raw_pass)
        uid = uuid4()
        now = datetime.now(timezone.utc)

        mock_find.return_value = {
            "id": uid,
            "email": "user@synapse.com",
            "username": "trader",
            "password_hash": hashed,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }

        dto = LoginDTO(email="user@synapse.com", password=raw_pass)
        result = auth_service.login(dto)

        self.assertEqual(result["user"]["email"], "user@synapse.com")
        self.assertIn("access_token", result)
        self.assertIn("refresh_token", result)

    @patch("database.user_store.find_by_email", return_value=None)
    @patch("auth.strategies.password_strategy.dummy_verify_password")
    @patch("auth.strategies.jwt_strategy._get_auth_redis", return_value=None)
    def test_login_unknown_email_runs_dummy_bcrypt(self, mock_redis, mock_dummy, mock_find):
        dto = LoginDTO(email="unknown@synapse.com", password="AnyPassword123!")

        with self.assertRaises(ValueError) as ctx:
            auth_service.login(dto)

        self.assertIn("Invalid email or password", str(ctx.exception))
        mock_dummy.assert_called_once_with("AnyPassword123!")

    @patch("database.user_store.find_by_email")
    @patch("auth.strategies.jwt_strategy._get_auth_redis", return_value=None)
    def test_login_wrong_password(self, mock_redis, mock_find):
        hashed = password_strategy.hash_password("CorrectPass123!@")
        mock_find.return_value = {
            "id": uuid4(),
            "email": "user@synapse.com",
            "username": "trader",
            "password_hash": hashed,
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
        }
        dto = LoginDTO(email="user@synapse.com", password="WrongPassword123!@")

        with self.assertRaises(ValueError) as ctx:
            auth_service.login(dto)
        self.assertIn("Invalid email or password", str(ctx.exception))

    @patch("database.user_store.find_by_email")
    @patch("auth.strategies.jwt_strategy._get_auth_redis", return_value=None)
    def test_login_deactivated_account(self, mock_redis, mock_find):
        hashed = password_strategy.hash_password("CorrectPass123!@")
        mock_find.return_value = {
            "id": uuid4(),
            "email": "user@synapse.com",
            "username": "trader",
            "password_hash": hashed,
            "is_active": False,  # Deactivated
            "created_at": datetime.now(timezone.utc),
        }
        dto = LoginDTO(email="user@synapse.com", password="CorrectPass123!@")

        with self.assertRaises(ValueError) as ctx:
            auth_service.login(dto)
        self.assertIn("deactivated", str(ctx.exception).lower())

    @patch("auth.strategies.jwt_strategy.decode_token")
    @patch("auth.strategies.jwt_strategy.is_rotated_token", return_value=True)
    @patch("auth.strategies.jwt_strategy.revoke_all_refresh_tokens")
    def test_refresh_token_theft_reuse_detection(self, mock_revoke_all, mock_is_rotated, mock_decode):
        user_id = str(uuid4())
        mock_decode.return_value = {
            "sub": user_id,
            "jti": "stolen_jti_previously_rotated",
            "type": TOKEN_TYPE_REFRESH,
        }

        with self.assertRaises(ValueError) as ctx:
            auth_service.refresh("stolen_token_string")

        self.assertIn("token reuse detected", str(ctx.exception).lower())
        mock_revoke_all.assert_called_once_with(user_id)


# ─────────────────────────────────────────────────────────────────────────────
# 5. CONTROLLER FLASK TEST CLIENT INTEGRATION
# ─────────────────────────────────────────────────────────────────────────────

class TestAuthControllerRoutes(unittest.TestCase):
    """Test HTTP status codes and responses on /api/auth/* routes."""

    @classmethod
    def setUpClass(cls):
        from flask import Flask
        from controllers.routes_auth import auth_bp
        cls.app = Flask(__name__)
        cls.app.config["TESTING"] = True
        cls.app.register_blueprint(auth_bp)
        cls.client = cls.app.test_client()

    @patch("services.auth_service.register")
    def test_register_endpoint_success(self, mock_svc_reg):
        mock_svc_reg.return_value = {
            "user": {
                "id": str(uuid4()),
                "email": "trader@synapse.com",
                "username": "trader",
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
            "access_token": "mock.access.token",
            "refresh_token": "mock.refresh.token",
            "token_type": "Bearer",
            "expires_in": 900,
        }
        res = self.client.post(
            "/api/auth/register",
            json={
                "email": "trader@synapse.com",
                "username": "trader",
                "password": "ValidPass123!@",
            },
        )
        self.assertEqual(res.status_code, 201)
        data = res.get_json()
        self.assertEqual(data["user"]["email"], "trader@synapse.com")

    def test_register_endpoint_bad_validation(self):
        res = self.client.post(
            "/api/auth/register",
            json={
                "email": "invalid-email",
                "username": "a",  # Too short
                "password": "weak",
            },
        )
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertIn("details", data)

    @patch("services.auth_service.register", side_effect=ValueError("Email already registered."))
    def test_register_endpoint_conflict_409(self, mock_svc_reg):
        res = self.client.post(
            "/api/auth/register",
            json={
                "email": "existing@synapse.com",
                "username": "trader",
                "password": "ValidPass123!@",
            },
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("Email already registered", res.get_json()["error"])

    @patch("services.auth_service.login")
    def test_login_endpoint_success(self, mock_svc_login):
        mock_svc_login.return_value = {
            "user": {"id": str(uuid4()), "email": "trader@synapse.com"},
            "access_token": "access.jwt",
            "refresh_token": "refresh.jwt",
        }
        res = self.client.post(
            "/api/auth/login",
            json={"email": "trader@synapse.com", "password": "ValidPass123!@"},
        )
        self.assertEqual(res.status_code, 200)

    @patch("services.auth_service.login", side_effect=ValueError("Invalid email or password."))
    def test_login_endpoint_invalid_credentials_401(self, mock_svc_login):
        res = self.client.post(
            "/api/auth/login",
            json={"email": "trader@synapse.com", "password": "WrongPassword123!@"},
        )
        self.assertEqual(res.status_code, 401)

    @patch("services.auth_service.login", side_effect=ValueError("Account is deactivated."))
    def test_login_endpoint_deactivated_403(self, mock_svc_login):
        res = self.client.post(
            "/api/auth/login",
            json={"email": "trader@synapse.com", "password": "AnyPassword123!@"},
        )
        self.assertEqual(res.status_code, 403)

    @patch("services.auth_service.login", side_effect=ValueError("Too many login attempts. Try again later."))
    def test_login_endpoint_rate_limited_429(self, mock_svc_login):
        res = self.client.post(
            "/api/auth/login",
            json={"email": "trader@synapse.com", "password": "AnyPassword123!@"},
        )
        self.assertEqual(res.status_code, 429)

    def test_protected_routes_without_token_rejected_401(self):
        # /api/auth/logout requires @jwt_required
        res = self.client.post("/api/auth/logout")
        self.assertEqual(res.status_code, 401)

        # /api/auth/profile requires @jwt_required
        res = self.client.get("/api/auth/profile")
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)

