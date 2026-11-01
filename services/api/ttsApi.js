/**
 * Servicio de síntesis de voz (TTS). POST /api/tts.
 *
 * Devuelve el Blob de audio listo para reproducir, o `null` si el endpoint
 * responde con error (hoy /api/tts no está implementado en el backend, por lo
 * que el flujo termina en el aviso y no reproduce, igual que antes). Los
 * fallos de red se dejan lanzar para que el hook los capture.
 */
import { rawRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"

export async function fetchTtsAudioBlob(text) {
  const resp = await rawRequest(ENDPOINTS.tts(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  })
  if (!resp.ok) {
    console.warn("[VoiceTTS] TTS API error:", resp.status)
    return null
  }
  return resp.blob()
}
