/**
 * Servicio de datos de trading: snapshot de indicadores para un símbolo.
 * Habla con GET /api/trading/<symbol> a través del cliente HTTP con reintentos.
 */
import { httpRequest } from "./httpClient"
import { ENDPOINTS } from "./endpoints"
import { getChatOwnerId } from "./chatApi"

export const fetchTradingData = async (
  symbol,
  interval = "15m",
  market = "crypto",
  provider = "coinbase",
) => {
  if (!symbol) throw new Error("symbol is required")
  return httpRequest(
    ENDPOINTS.trading(symbol, interval, market, provider),
    { retries: 4 },
  )
}

export function fetchTradingProviderPreference() {
  return httpRequest(ENDPOINTS.tradingProviderPreference(), {
    headers: { "X-Chat-Owner-ID": getChatOwnerId() },
    retries: 0,
  })
}

export function saveTradingProviderPreference(provider) {
  return httpRequest(ENDPOINTS.tradingProviderPreference(), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "X-Chat-Owner-ID": getChatOwnerId(),
    },
    body: { crypto_provider: provider },
    retries: 0,
  })
}
