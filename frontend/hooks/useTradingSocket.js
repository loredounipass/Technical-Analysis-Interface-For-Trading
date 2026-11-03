import { useEffect, useState } from "react"
import { connectTradingRoom } from "@/services/realtime/tradingSocketClient"

/**
 * Custom hook (capa de lógica) que expone los datos de trading en tiempo real.
 * El transporte socket.io vive en services/realtime/tradingSocketClient; acá
 * solo se mantiene el estado React y se reacciona a los callbacks.
 *
 * @param {string} symbol   - Par de trading (p.ej. 'BTC').
 * @param {string} interval - Timeframe (p.ej. '15m').
 * @param {string} market   - Tipo de mercado ('crypto' | 'stock').
 * @param {string} provider - Proveedor crypto ('coinbase' | 'binance'); 'yahoo'
 *   se asume solo para acciones. Si llega vacio la conexion no se abre: esperar
 *   a que el proveedor este resuelto evita un join/leave inutil (en modo Redis
 *   cada join registra un lease y el feeder empieza a calcular esa sala).
 * @returns {{ liveData: Object|null, isConnected: boolean, error: string|null }}
 */
export default function useTradingSocket(
  symbol,
  interval,
  market = "crypto",
  provider = "coinbase",
) {
  const [liveData, setLiveData] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const resolvedProvider = market === "stock" ? "yahoo" : provider
    if (!symbol || !interval || !resolvedProvider) return
    setLiveData(null)
    setIsConnected(false)

    return connectTradingRoom({
      symbol,
      interval,
      market,
      provider: resolvedProvider,
      onConnected: () => {
        setIsConnected(true)
        setError(null)
      },
      onConnectError: (msg) => {
        setError(msg)
        setIsConnected(false)
      },
      onDataUpdate: (data) => setLiveData(data),
      onDisconnected: () => setIsConnected(false),
    })
  }, [symbol, interval, market, provider])

  return { liveData, isConnected, error }
}
