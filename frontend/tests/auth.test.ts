import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import * as tokenManager from "@/services/auth/tokenManager"
import { validatePasswordRules } from "@/components/auth/PasswordStrengthIndicator"
import { ENDPOINTS } from "@/services/api/endpoints"

describe("Token Manager Unit Tests", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("returns null when no session is stored", () => {
    expect(tokenManager.getAccessToken()).toBeNull()
    expect(tokenManager.getRefreshToken()).toBeNull()
    expect(tokenManager.getUser()).toBeNull()
    expect(tokenManager.isAuthenticated()).toBe(false)
  })

  it("correctly persists and retrieves session data", () => {
    const mockUser = { id: "user-123", email: "trader@synapse.com", username: "trader_pro" }
    const sessionData = {
      access_token: "mock-access-token",
      refresh_token: "mock-refresh-token",
      expires_in: 900, // 15 minutes
      user: mockUser,
    }

    const eventSpy = vi.fn()
    window.addEventListener(tokenManager.SESSION_CHANGE_EVENT, eventSpy)

    tokenManager.setSession(sessionData)

    expect(tokenManager.getAccessToken()).toBe("mock-access-token")
    expect(tokenManager.getRefreshToken()).toBe("mock-refresh-token")
    expect(tokenManager.getUser()).toEqual(mockUser)
    expect(tokenManager.isAuthenticated()).toBe(true)
    expect(eventSpy).toHaveBeenCalledTimes(1)

    window.removeEventListener(tokenManager.SESSION_CHANGE_EVENT, eventSpy)
  })

  it("updates tokens without modifying user data", () => {
    const mockUser = { id: "user-123", email: "trader@synapse.com", username: "trader_pro" }
    tokenManager.setSession({
      access_token: "old-access",
      refresh_token: "old-refresh",
      expires_in: 900,
      user: mockUser,
    })

    tokenManager.updateTokens({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 900,
    })

    expect(tokenManager.getAccessToken()).toBe("new-access")
    expect(tokenManager.getRefreshToken()).toBe("new-refresh")
    expect(tokenManager.getUser()).toEqual(mockUser)
  })

  it("clears session data completely", () => {
    tokenManager.setSession({
      access_token: "token",
      refresh_token: "refresh",
      expires_in: 900,
      user: { id: "1" },
    })

    tokenManager.clearSession()

    expect(tokenManager.getAccessToken()).toBeNull()
    expect(tokenManager.getRefreshToken()).toBeNull()
    expect(tokenManager.getUser()).toBeNull()
    expect(tokenManager.isAuthenticated()).toBe(false)
  })

  it("considers token expired when timestamp is in the past", () => {
    tokenManager.setSession({
      access_token: "token",
      refresh_token: "refresh",
      expires_in: -10, // already expired
      user: { id: "1" },
    })

    expect(tokenManager.isAuthenticated()).toBe(false)
  })
})

describe("Password Security Validation Rules", () => {
  it("rejects passwords shorter than 8 characters", () => {
    const rules = validatePasswordRules("Pass1!")
    const lengthRule = rules.find((r) => r.id === "length")
    expect(lengthRule?.valid).toBe(false)
  })

  it("rejects passwords longer than 72 characters (Bcrypt boundary limit)", () => {
    const tooLong = "A".repeat(73) + "a1!"
    const rules = validatePasswordRules(tooLong)
    const lengthRule = rules.find((r) => r.id === "length")
    expect(lengthRule?.valid).toBe(false)
  })

  it("detects missing uppercase letter", () => {
    const rules = validatePasswordRules("password123!")
    const upperRule = rules.find((r) => r.id === "uppercase")
    expect(upperRule?.valid).toBe(false)
  })

  it("detects missing lowercase letter", () => {
    const rules = validatePasswordRules("PASSWORD123!")
    const lowerRule = rules.find((r) => r.id === "lowercase")
    expect(lowerRule?.valid).toBe(false)
  })

  it("detects missing digit", () => {
    const rules = validatePasswordRules("PasswordSpecial!")
    const digitRule = rules.find((r) => r.id === "digit")
    expect(digitRule?.valid).toBe(false)
  })

  it("detects missing special symbol", () => {
    const rules = validatePasswordRules("Password1234")
    const symbolRule = rules.find((r) => r.id === "symbol")
    expect(symbolRule?.valid).toBe(false)
  })

  it("validates compliant password satisfying all 5 security rules", () => {
    const rules = validatePasswordRules("StrongPass123!")
    const allValid = rules.every((r) => r.valid)
    expect(allValid).toBe(true)
  })
})

describe("Auth Endpoints Map", () => {
  it("generates correct relative paths for authentication endpoints", () => {
    expect(ENDPOINTS.authRegister()).toBe("/auth/register")
    expect(ENDPOINTS.authLogin()).toBe("/auth/login")
    expect(ENDPOINTS.authRefresh()).toBe("/auth/refresh")
    expect(ENDPOINTS.authLogout()).toBe("/auth/logout")
    expect(ENDPOINTS.authProfile()).toBe("/auth/profile")
  })
})

