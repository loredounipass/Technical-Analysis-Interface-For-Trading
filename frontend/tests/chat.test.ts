import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  fetchChatModels,
  fetchChatState,
  createChatSession,
  deleteChatSession,
  saveChatMessage,
  updateChatWelcomeMessage,
  updateChatPreferences,
  openChatStream,
} from "@/services/api/chatApi"
import { INTERVAL_LABELS } from "@/components/chat/useChatSession"
import * as tokenManager from "@/services/auth/tokenManager"

describe("AI Chat Agent Services & Telemetry", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()

    // Seed session token
    tokenManager.setSession({
      access_token: "jwt-chat-token-999",
      refresh_token: "jwt-refresh-token-999",
      expires_in: 900,
      user: { id: "user-456", username: "trader_one" },
    })
  })

  it("fetchChatModels requests /models without Authorization (public route)", async () => {
    const mockModels = [
      { key: "nvidia-nemotron", name: "Nemotron 70B", provider: "nvidia", free: true },
    ]

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockModels,
    })
    globalThis.fetch = fetchMock

    const res = await fetchChatModels()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/models")
    expect(init.headers["Authorization"]).toBeUndefined()
    expect(res).toEqual(mockModels)
  })

  it("fetchChatState requests /chat/state injecting Bearer token", async () => {
    const mockState = {
      selected_model: "nvidia-nemotron",
      web_search_enabled: false,
      sessions: [{ id: "session-1", title: "BTC Analysis" }],
    }

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(mockState),
    })
    globalThis.fetch = fetchMock

    const res = await fetchChatState()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/chat/state")
    expect(init.headers["Authorization"]).toBe("Bearer jwt-chat-token-999")
    expect(res).toEqual(mockState)
  })

  it("createChatSession sends POST /chat/sessions with symbol and market", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: "new-session-uuid" }),
    })
    globalThis.fetch = fetchMock

    const payload = {
      symbol: "ETHUSDT",
      interval: "15m",
      market: "crypto",
      title: "ETH Analysis",
    }
    const res = await createChatSession(payload)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/chat/sessions")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual(payload)
    expect(init.headers["Authorization"]).toBe("Bearer jwt-chat-token-999")
    expect(res).toEqual({ id: "new-session-uuid" })
  })

  it("deleteChatSession sends DELETE /chat/sessions/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ deleted: true }),
    })
    globalThis.fetch = fetchMock

    const res = await deleteChatSession("session-uuid-to-delete")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/chat/sessions/session-uuid-to-delete")
    expect(init.method).toBe("DELETE")
    expect(init.headers["Authorization"]).toBe("Bearer jwt-chat-token-999")
    expect(res).toEqual({ deleted: true })
  })

  it("saveChatMessage sends POST /chat/sessions/:id/messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ saved: true }),
    })
    globalThis.fetch = fetchMock

    const msg = { role: "user", content: "What is the RSI trend?" }
    const res = await saveChatMessage("sess-1", msg)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/chat/sessions/sess-1/messages")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual(msg)
    expect(res).toEqual({ saved: true })
  })

  it("updateChatWelcomeMessage sends PATCH /chat/sessions/:id/welcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ saved: true }),
    })
    globalThis.fetch = fetchMock

    const welcomeMsg = { role: "assistant", content: "Hola trader, listo para operar." }
    const res = await updateChatWelcomeMessage("sess-1", welcomeMsg)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/chat/sessions/sess-1/welcome")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual(welcomeMsg)
    expect(res).toEqual({ saved: true })
  })

  it("updateChatPreferences sends PATCH /chat/preferences", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ updated: true }),
    })
    globalThis.fetch = fetchMock

    const prefs = { selected_model: "nvidia-nemotron", web_search_enabled: true }
    const res = await updateChatPreferences(prefs)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/chat/preferences")
    expect(init.method).toBe("PATCH")
    expect(JSON.parse(init.body)).toEqual(prefs)
    expect(res).toEqual({ updated: true })
  })

  it("openChatStream sends POST /chat with Bearer token and SSE request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: () => {} },
    })
    globalThis.fetch = fetchMock

    const controller = new AbortController()
    const payload = {
      prompt: "Analiza el order flow de BTC",
      session_id: "sess-uuid",
      stream: true,
    }

    await openChatStream(payload, controller.signal)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain("/chat")
    expect(init.method).toBe("POST")
    expect(init.headers["Authorization"]).toBe("Bearer jwt-chat-token-999")
    expect(init.signal).toBe(controller.signal)
    expect(JSON.parse(init.body)).toEqual(payload)
  })

  it("INTERVAL_LABELS covers all supported timeframe intervals in Spanish", () => {
    expect(INTERVAL_LABELS["1m"]).toBe("1 minuto")
    expect(INTERVAL_LABELS["5m"]).toBe("5 minutos")
    expect(INTERVAL_LABELS["15m"]).toBe("15 minutos")
    expect(INTERVAL_LABELS["1h"]).toBe("1 hora")
    expect(INTERVAL_LABELS["4h"]).toBe("4 horas")
    expect(INTERVAL_LABELS["6h"]).toBe("6 horas")
    expect(INTERVAL_LABELS["1d"]).toBe("1 día")
  })
})

