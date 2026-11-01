/**
 * Servicio de noticias: titulares por símbolo desde GET /api/news/<symbol>.
 */
import { httpRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"

/** Versión tolerante: nunca lanza, devuelve [] ante cualquier fallo. */
export const fetchNews = async (symbol, market = "crypto") => {
  if (!symbol) return []
  try {
    return await httpRequest(ENDPOINTS.news(symbol, market), { retries: 2, timeout: 8000 })
  } catch {
    return []
  }
}

/**
 * Devuelve SIEMPRE un array de artículos (para la página de noticias).
 * Reemplaza el `fetch` crudo que la página hacía por símbolo; ante error o
 * respuesta no-listada devuelve [] preservando el comportamiento original.
 */
export const fetchNewsBySymbol = async (symbol, market = "crypto") => {
  if (!symbol) return []
  try {
    const data = await httpRequest(ENDPOINTS.news(symbol, market), { retries: 0, timeout: 8000 })
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
