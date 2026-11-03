/**
 * Servicio del agente de chat/IA.
 *   - fetchChatModels: GET /api/models  (lista de modelos disponibles).
 *   - openChatStream:  POST /api/chat   (devuelve la Response cruda para que el
 *     hook consuma el stream SSE; el parseo y la telemetría de estado son
 *     lógica del hook, no de esta capa de peticiones).
 */
import { rawRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"

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

/**
 * Abre la petición de chat en modo stream. Devuelve la Response cruda para que
 * el hook lea `res.body.getReader()` y procese los eventos SSE.
 */
export function openChatStream(payload, signal) {
  return rawRequest(ENDPOINTS.chat(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify(payload),
  })
}
