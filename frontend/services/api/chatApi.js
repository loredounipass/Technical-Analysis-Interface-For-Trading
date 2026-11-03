/**
 * Servicio del agente de chat/IA.
 *   - fetchChatModels: GET /api/models  (lista de modelos disponibles).
 *   - openChatStream:  POST /api/chat   (devuelve la Response cruda para que el
 *     hook consuma el stream SSE; el parseo y la telemetría de estado son
 *     lógica del hook, no de esta capa de peticiones).
 */
import { httpRequest, rawRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"

const OWNER_ID_STORAGE_KEY = "trading_terminal_owner_id"

export function getChatOwnerId() {
  let ownerId = localStorage.getItem(OWNER_ID_STORAGE_KEY)
  if (!ownerId) {
    ownerId = crypto.randomUUID()
    localStorage.setItem(OWNER_ID_STORAGE_KEY, ownerId)
  }
  return ownerId
}

function ownerHeaders() {
  return { "X-Chat-Owner-ID": getChatOwnerId() }
}

function chatRequest(path, options = {}) {
  return httpRequest(path, {
    ...options,
    retries: 0,
    headers: {
      "Content-Type": "application/json",
      ...ownerHeaders(),
      ...options.headers,
    },
  })
}

/**
 * Obtiene los modelos. Semantics idénticas al fetch inline original:
 *   - respuesta 2xx -> devuelve el JSON parseado.
 *   - respuesta no-ok (p.ej. 503 transitorio) -> devuelve null (el hook NO
 *     pisa el estado ni aplica el fallback en ese caso).
 *   - fallo de red -> lanza (el hook aplica el listado de respaldo).
 */
export async function fetchChatModels() {
  const res = await rawRequest(ENDPOINTS.models())
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
 */
export function openChatStream(payload, signal) {
  return rawRequest(ENDPOINTS.chat(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ownerHeaders() },
    signal,
    body: JSON.stringify(payload),
  })
}
