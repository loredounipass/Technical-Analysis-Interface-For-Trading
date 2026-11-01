/**
 * Mapa centralizado de endpoints del backend.
 *
 * Cada clave está nombrada según el recurso y la ruta real que expone el
 * servidor (ver backend/controllers): /api/trading/<symbol>,
 * /api/news/<symbol>, /api/chat, /api/models. Mantener las rutas aquí evita
 * que los strings de URL se dispersen por los servicios y componentes.
 *
 * Todas las rutas son RELATIVAS a la base `/api` definida en httpClient.js
 * (NEXT_PUBLIC_API_BASE_URL), por lo que no repiten el prefijo `/api`.
 */
export const ENDPOINTS = {
  // GET /api/trading/<symbol>?interval=&market=
  trading: (symbol, interval, market) =>
    `/trading/${symbol}?interval=${interval}&market=${market}`,

  // GET /api/news/<symbol>?market=
  news: (symbol, market) => `/news/${symbol}?market=${market}`,

  // GET /api/models  -> listado de modelos de IA disponibles
  models: () => `/models`,

  // POST /api/chat  -> agente de trading (SSE o JSON)
  chat: () => `/chat`,

  // POST /api/tts  -> síntesis de voz (ruta usada por el frontend)
  tts: () => `/tts`,
}
