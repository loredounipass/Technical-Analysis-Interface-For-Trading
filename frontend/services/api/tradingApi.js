/**
 * Servicio de datos de trading: snapshot de indicadores para un símbolo.
 * Habla con GET /api/trading/<symbol> a través del cliente HTTP con reintentos
 * y autenticación Bearer JWT automática.
 */
import { httpRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"

export const fetchTradingData = async (
  symbol,
  interval = "15m",
  market = "crypto",
  provider = "coinbase",
) => {
  if (!symbol) throw new Error("symbol is required")
  return httpRequest(
    ENDPOINTS.trading(symbol, interval, market, provider),
    { timeout: 30000, retries: 2 },
  )
}

export function fetchTradingProviderPreference() {
  return httpRequest(ENDPOINTS.tradingProviderPreference(), {
    retries: 0,
  })
}

export function saveTradingProviderPreference(provider) {
  return httpRequest(ENDPOINTS.tradingProviderPreference(), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: { crypto_provider: provider },
    retries: 0,
  })
}
