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
 * @returns {{ liveData: Object|null, isConnected: boolean, error: string|null }}
 */
export default function useTradingSocket(symbol, interval, market = "crypto") {
  const [liveData, setLiveData] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!symbol || !interval) return

    return connectTradingRoom({
      symbol,
      interval,
      market,
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
  }, [symbol, interval, market])

  return { liveData, isConnected, error }
}
