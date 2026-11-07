/**
 * Servicio del agente de chat/IA.
 *   - fetchChatModels: GET /api/models  (lista de modelos disponibles, pública).
 *   - openChatStream:  POST /api/chat   (devuelve la Response cruda para que el
 *     hook consuma el stream SSE con Bearer token inyectado automáticamente).
 *
 * Todas las peticiones protegidas usan el interceptor JWT de httpClient.
 */
import { httpRequest, rawRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"

function chatRequest(path, options = {}) {
  return httpRequest(path, {
    ...options,
    retries: 0,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })
}

/**
 * Obtiene los modelos disponibles.
 */
export async function fetchChatModels() {
  const res = await rawRequest(ENDPOINTS.models(), {}, { skipAuth: true })
  if (!res.ok) return null
  return res.json()
}

export function fetchChatState() {
  return chatRequest(ENDPOINTS.chatState())
}

export function importLegacyChatState(payload) {
  return chatRequest(ENDPOINTS.importChatState(), {
    method: "POST",
    body: payload,
  })
}

export function createChatSession(payload) {
  return chatRequest(ENDPOINTS.chatSessions(), {
    method: "POST",
    body: payload,
  })
}

export function deleteChatSession(sessionId) {
  return chatRequest(ENDPOINTS.chatSession(sessionId), { method: "DELETE" })
}

export function saveChatMessage(sessionId, message) {
  return chatRequest(ENDPOINTS.chatSessionMessages(sessionId), {
    method: "POST",
    body: message,
  })
}

export function updateChatWelcomeMessage(sessionId, message) {
  return chatRequest(ENDPOINTS.chatSessionWelcome(sessionId), {
    method: "PATCH",
    body: message,
  })
}

export function updateChatPreferences(preferences) {
  return chatRequest(ENDPOINTS.chatPreferences(), {
    method: "PATCH",
    body: preferences,
  })
}

/**
 * Abre la petición de chat en modo stream. Devuelve la Response cruda para que
 * el hook lea `res.body.getReader()` y procese los eventos SSE.
 * El Bearer token se inyecta automáticamente vía rawRequest.
 */
export function openChatStream(payload, signal) {
  return rawRequest(ENDPOINTS.chat(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(payload),
  })
}
