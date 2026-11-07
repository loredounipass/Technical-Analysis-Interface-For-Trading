import { describe, it, expect, beforeEach, vi } from "vitest"
import { httpRequest } from "@/services/api/httpClient"
import * as tokenManager from "@/services/auth/tokenManager"

describe("HTTP Client Auth Interceptor & Auto-Refresh", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("automatically injects Authorization Bearer header when token is stored", async () => {
    tokenManager.setSession({
      access_token: "valid-jwt-token-123",
      refresh_token: "refresh-token-123",
      expires_in: 900,
      user: { id: "1" },
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    })
    globalThis.fetch = fetchMock

    const res = await httpRequest("/trading/BTCUSDT", { retries: 0 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers["Authorization"]).toBe("Bearer valid-jwt-token-123")
    expect(res).toEqual({ success: true })
  })

  it("does not inject Authorization header when skipAuth is true", async () => {
    tokenManager.setSession({
      access_token: "valid-jwt-token-123",
      refresh_token: "refresh-token-123",
      expires_in: 900,
      user: { id: "1" },
    })

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true }),
    })
    globalThis.fetch = fetchMock

    await httpRequest("/auth/login", { skipAuth: true, retries: 0 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers["Authorization"]).toBeUndefined()
  })

  it("automatically handles 401 expired token, performs refresh, and retries request with new token", async () => {
    tokenManager.setSession({
      access_token: "expired-token",
      refresh_token: "valid-refresh-token",
      expires_in: 900,
      user: { id: "1" },
    })

    const fetchMock = vi.fn()

    // 1st call: Protected request returns 401 Token has expired.
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Token has expired." }),
    })

    // 2nd call: POST /auth/refresh returns 200 with new tokens
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "new-access-token-456",
        refresh_token: "new-refresh-token-456",
        expires_in: 900,
      }),
    })

    // 3rd call: Retried protected request returns 200 with fresh data
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: "trading-indicators" }),
    })

    globalThis.fetch = fetchMock

    const result = await httpRequest("/trading/BTCUSDT", { retries: 0 })

    expect(fetchMock).toHaveBeenCalledTimes(3)

    // Check that refresh was called
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[1]
    expect(refreshUrl).toContain("/auth/refresh")
    expect(JSON.parse(refreshInit.body)).toEqual({ refresh_token: "valid-refresh-token" })

    // Check that retried call had the new token
    const [, retryInit] = fetchMock.mock.calls[2]
    expect(retryInit.headers["Authorization"]).toBe("Bearer new-access-token-456")

    expect(tokenManager.getAccessToken()).toBe("new-access-token-456")
    expect(result).toEqual({ data: "trading-indicators" })
  })

  it("clears session and dispatches auth-required event when token is revoked", async () => {
    tokenManager.setSession({
      access_token: "blacklisted-token",
      refresh_token: "refresh-token",
      expires_in: 900,
      user: { id: "1" },
    })

    const authRequiredSpy = vi.fn()
    window.addEventListener(tokenManager.AUTH_REQUIRED_EVENT, authRequiredSpy)

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: "Token has been revoked." }),
    })

    await expect(httpRequest("/trading/BTCUSDT", { retries: 0 })).rejects.toThrow("Token has been revoked.")

    expect(tokenManager.isAuthenticated()).toBe(false)
    expect(tokenManager.getAccessToken()).toBeNull()
    expect(authRequiredSpy).toHaveBeenCalledTimes(1)

    window.removeEventListener(tokenManager.AUTH_REQUIRED_EVENT, authRequiredSpy)
  })
})

