"""Concurrency, Stress, and Load Testing Suite for Synapse Backend.

Tests simulate high-concurrency traffic patterns:
1. Concurrency burst & Brute-force rate limiting (verifying 429 triggers accurately under thread contention).
2. High-throughput concurrent JWT authentication (verifying thread-safety and latency of global JWT guard).
3. IP isolation under load (verifying concurrent requests from different IPs are never throttled mutually).
4. Concurrent Token Reuse / Replay attack race conditions (OAuth 2.0 BCP theft detection under concurrent storm).
5. Burst traffic throughput and P95/P99 latency benchmarks.
"""

import os
import sys
import time
import unittest
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Mock background sockets & streamers before importing Flask app
patch("database.chat_store.initialize_database").start()
patch("common.sockets.init_sockets").start()
patch("gateways.stream_manager.init_market_streams").start()

from app import app
from auth.strategies import jwt_strategy
from common import cache


class TestLoadAndConcurrency(unittest.TestCase):
    """Stress and concurrency tests for backend authentication and protected routes."""

    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()

        cls.user_id = uuid4()
        cls.user = {
            "id": cls.user_id,
            "email": "load_tester@synapse.com",
            "username": "load_tester",
            "is_active": True,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        cls.access_token, _, _ = jwt_strategy.encode_access_token(str(cls.user_id))

    def setUp(self):
        with cache.ip_lock:
            cache.ip_requests.clear()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. CONCURRENT BRUTE FORCE & RATE LIMITING TEST
    # ─────────────────────────────────────────────────────────────────────────

    @patch("common.cache.RATE_LIMIT", 10)
    @patch("database.user_store.find_by_email", return_value=None)
    def test_concurrent_brute_force_rate_limiting(self, mock_find_user):
        """Simulate 25 threads attacking /api/auth/login simultaneously from the same IP.

        Must permit initial threshold, then deterministically throttle with HTTP 429.
        """
        attacker_ip = "198.51.100.99"
        total_requests = 25
        concurrency = 10

        def send_login_request(index):
            return self.client.post(
                "/api/auth/login",
                json={"email": f"victim_{index}@synapse.com", "password": "WrongPassword1!"},
                environ_base={"REMOTE_ADDR": attacker_ip},
            )

        responses = []
        with ThreadPoolExecutor(max_workers=concurrency) as executor:
            futures = [executor.submit(send_login_request, i) for i in range(total_requests)]
            for future in as_completed(futures):
                responses.append(future.result())

        status_codes = [r.status_code for r in responses]
        rate_limited_429 = [code for code in status_codes if code == 429]
        processed_401 = [code for code in status_codes if code == 401]

        # The rate limiter must activate and reject excess requests
        self.assertGreater(
            len(rate_limited_429),
            0,
            f"Rate limiter failed: All {total_requests} requests passed without any 429.",
        )
        # Total responses must match request count exactly (no lost requests or thread crashes)
        self.assertEqual(len(responses), total_requests)

    # ─────────────────────────────────────────────────────────────────────────
    # 2. CONCURRENT DIFFERENT IPS NOT MUTUALLY THROTTLED
    # ─────────────────────────────────────────────────────────────────────────

    @patch("database.user_store.find_by_email", return_value=None)
    def test_concurrent_different_ips_not_throttled(self, mock_find_user):
        """Simulate 20 distinct users logging in concurrently from 20 different IPs.

        Rate limiting must isolate per-IP and not block legitimate concurrent users.
        """
        total_users = 20

        def send_login_from_unique_ip(index):
            client_ip = f"203.0.113.{index + 10}"
            return self.client.post(
                "/api/auth/login",
                json={"email": f"user_{index}@synapse.com", "password": "WrongPassword1!"},
                environ_base={"REMOTE_ADDR": client_ip},
            )

        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = [executor.submit(send_login_from_unique_ip, i) for i in range(total_users)]
            responses = [f.result() for f in as_completed(futures)]

        status_codes = [r.status_code for r in responses]
        # None should be throttled (429) since each IP only sent 1 request
        self.assertEqual(
            status_codes.count(429),
            0,
            "False positive throttling: unique IPs were throttled.",
        )
        self.assertEqual(status_codes.count(401), total_users)

    # ─────────────────────────────────────────────────────────────────────────
    # 3. HIGH-THROUGHPUT CONCURRENT JWT AUTHENTICATION
    # ─────────────────────────────────────────────────────────────────────────

    @patch("database.user_store.find_by_id")
    @patch("app.is_blacklisted", return_value=False)
    @patch("database.chat_store.get_state")
    def test_high_throughput_concurrent_jwt_guard(
        self, mock_get_state, mock_is_blacklisted, mock_find_user
    ):
        """Simulate 50 concurrent authenticated requests to /api/chat/state.

        Verifies thread-safety, zero memory corruptions, and measures latency.
        """
        mock_find_user.return_value = self.user
        mock_get_state.return_value = {
            "selected_model": "nvidia-nemotron",
            "sessions": [],
        }

        total_requests = 50
        max_workers = 12

        def send_authenticated_request(req_id):
            client_ip = f"10.0.0.{req_id % 200 + 1}"
            start = time.perf_counter()
            res = self.client.get(
                "/api/chat/state",
                headers={
                    "Authorization": f"Bearer {self.access_token}",
                    "X-Forwarded-For": client_ip,
                },
            )
            duration_ms = (time.perf_counter() - start) * 1000
            return res.status_code, duration_ms

        latencies = []
        status_codes = []

        start_all = time.perf_counter()
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(send_authenticated_request, i) for i in range(total_requests)]
            for f in as_completed(futures):
                code, duration = f.result()
                status_codes.append(code)
                latencies.append(duration)
        total_time_s = time.perf_counter() - start_all

        # 100% of requests must succeed with 200 OK
        self.assertEqual(status_codes.count(200), total_requests)

        # Performance metrics
        latencies.sort()
        p50 = latencies[int(len(latencies) * 0.50)]
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[int(len(latencies) * 0.99)]
        throughput = total_requests / total_time_s

        print(
            f"\n[Load Test Metrics] 50 Concurrent JWT Requests:"
            f"\n  Throughput: {throughput:.1f} req/s"
            f"\n  Latency P50: {p50:.2f}ms | P95: {p95:.2f}ms | P99: {p99:.2f}ms"
            f"\n  Total Wall Time: {total_time_s:.2f}s"
        )

        # Must process 50 requests in under 2.5 seconds in local test suite
        self.assertLess(total_time_s, 2.5)

    # ─────────────────────────────────────────────────────────────────────────
    # 4. CONCURRENT REFRESH TOKEN RACE CONDITION / REPLAY ATTACK
    # ─────────────────────────────────────────────────────────────────────────

    @patch("database.user_store.find_by_id")
    def test_concurrent_replay_theft_detection(self, mock_find_user):
        """Simulate concurrent re-use attempts of a stolen/rotated refresh token.

        All concurrent attempts must be rejected with 401 without deadlocking.
        """
        mock_find_user.return_value = self.user

        # Seed rotated token in in-memory / redis store
        stolen_jti = "stolen_token_jti_race_test"
        jwt_strategy.record_rotated_token(stolen_jti)

        now = int(time.time())
        import jwt as pyjwt

        stolen_payload = {
            "sub": str(self.user_id),
            "jti": stolen_jti,
            "type": "refresh",
            "iat": now,
            "exp": now + 600,
        }
        stolen_token = pyjwt.encode(stolen_payload, jwt_strategy.SECRET_KEY, algorithm="HS256")

        def attempt_refresh(idx):
            return self.client.post(
                "/api/auth/refresh",
                json={"refresh_token": stolen_token},
                headers={"X-Forwarded-For": f"172.16.0.{idx + 1}"},
            )

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(attempt_refresh, i) for i in range(5)]
            responses = [f.result() for f in as_completed(futures)]

        for r in responses:
            self.assertEqual(r.status_code, 401)
            err_msg = r.get_json()["error"].lower()
            self.assertTrue(
                "reuse" in err_msg or "revoked" in err_msg or "invalid" in err_msg,
                f"Unexpected error on token reuse: {err_msg}",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)

