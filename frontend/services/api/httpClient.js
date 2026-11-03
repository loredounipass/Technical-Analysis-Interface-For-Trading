/**
 * Cliente HTTP de bajo nivel (capa de transporte).
 *
 * Único lugar del frontend que conoce la URL base del backend y que ejecuta
 * `fetch`. Expone dos primitivas:
 *   - httpRequest: GET/POST con reintentos, timeout y normalización de errores
 *     (para endpoints de JSON como trading y news).
 *   - rawRequest:  `fetch` sin reintentos que devuelve la Response cruda, para
 *     casos especiales (streaming SSE de /chat y blobs de audio de /tts).
 *
 * Ningún hook o componente debe llamar a `fetch` directamente: consumen los
 * servicios de `services/api/*` que se apoyan en este módulo.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api"

// URL raiz del servidor (sin el sufijo /api) para la conexión socket.io.
// Equivalente a la derivación que hacía useTradingSocket de forma inline.
export const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  API_BASE_URL.replace(/\/+$/, "").replace(/\/api$/, "")

function buildUrl(path) {
  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`
}

/**
 * Petición JSON con timeout y reintentos (5xx / rate-limit / abort).
 * Devuelve el cuerpo ya parseado (u objeto con `.error`) o lanza Error.
 */
export async function httpRequest(
  path,
  { method = "GET", headers = {}, body = null, timeout = 15000, retries = 2 } = {}
) {
  const url = buildUrl(path)

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)

    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: "application/json", ...headers },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
      })
      clearTimeout(id)

      const text = await res.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch (e) {
        // non-json response
        data = text
      }

      const isRateLimit =
        res.status === 429 || (data && data.error && data.error.toLowerCase().includes("rate limit"))

      if (!res.ok || (data && data.error)) {
        const errorMessage = data && data.error ? data.error : `HTTP ${res.status}`
        const err = new Error(errorMessage)
        err.status = data && data.status ? data.status : res.status !== 200 ? res.status : 400
        err.body = data

        // retry on 5xx or rate limit
        if ((err.status >= 500 || isRateLimit) && attempt < retries) {
          const delay = isRateLimit ? 2000 * (attempt + 1) : 2 ** attempt * 100
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        throw err
      }

      return data
    } catch (err) {
      clearTimeout(id)
      const isAbort = err.name === "AbortError"
      const shouldRetry = (isAbort || err.status >= 500 || !err.status) && attempt < retries
      if (shouldRetry) {
        await new Promise((r) => setTimeout(r, 2 ** attempt * 100))
        continue
      }
      throw err
    }
  }
}

/**
 * `fetch` crudo que devuelve la Response tal cual (sin parsear ni reintentar).
 * Se usa para el stream SSE de /chat (el lector vive en el hook) y para el
 * blob de audio de /tts. Solo centraliza el armadado de la URL base.
 */
export function rawRequest(path, init = {}) {
  return fetch(buildUrl(path), init)
}
