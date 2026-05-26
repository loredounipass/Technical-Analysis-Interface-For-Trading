import { useEffect, useState } from "react"
import { io } from "socket.io-client"

const SOCKET_URL = "http://localhost:5000"

/**
 * Custom hook to handle real-time trading data via WebSockets.
 * @param {string} symbol - The trading pair (e.g., 'BTC').
 * @param {string} interval - The timeframe (e.g., '15m').
 * @returns {Object} - The latest market data and connection status.
 */
export default function useTradingSocket(symbol, interval) {
  const [liveData, setLiveData] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!symbol || !interval) return

    const socket = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      timeout: 10000,
    })

    const room = `${symbol}:${interval}`

    socket.on("connect", () => {
      console.log(`[Socket] Connected. Joining room: ${room}`)
      setIsConnected(true)
      setError(null)
      socket.emit("join", { room })
    })

    socket.on("connect_error", (err) => {
      console.error("[Socket] Connection Error:", err.message)
      setError("Fallo de conexión en tiempo real")
      setIsConnected(false)
    })

    socket.on("trading_data_update", (data) => {
      console.log(`[Socket] Data update for ${data.symbol}`)
      setLiveData(data)
    })

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason)
      setIsConnected(false)
    })

    return () => {
      console.log(`[Socket] Cleaning up connection for ${room}`)
      socket.emit("leave", { room })
      socket.disconnect()
    }
  }, [symbol, interval])

  return { liveData, isConnected, error }
}
