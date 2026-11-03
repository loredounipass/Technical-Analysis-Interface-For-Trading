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
  // Con MARKET_BACKEND=redis, la primera peticion de una sala (cambiar de
  // proveedor o de timeframe) puede tardar 10-17 s: la API espera al feeder que
  // siembra Redis. Si el timeout del cliente es menor, la peticion se aborta y
  // los reintentos vuelven a pedir el mismo seed. 30 s > STORE_SEED_WAIT_SECONDS
  // (20 s) y menos reintentos = un solo seed por sala.
  return httpRequest(
    ENDPOINTS.trading(symbol, interval, market, provider),
    { timeout: 30000, retries: 2 },
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
