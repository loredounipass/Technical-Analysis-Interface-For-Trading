/**
 * Servicio de datos de trading: snapshot de indicadores para un símbolo.
 * Habla con GET /api/trading/<symbol> a través del cliente HTTP con reintentos.
 */
import { httpRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"

export const fetchTradingData = async (symbol, interval = "15m", market = "crypto") => {
  if (!symbol) throw new Error("symbol is required")
  return httpRequest(ENDPOINTS.trading(symbol, interval, market), { retries: 4 })
}
