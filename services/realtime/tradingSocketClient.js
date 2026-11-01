/**
 * Cliente de tiempo real (capa de transporte socket.io).
 *
 * Aísla la creación de la conexión y el protocolo de salas (`join`/`leave` y
 * los nombres de eventos) del hook React. El hook solo mantiene estado y
 * reacciona a los callbacks; aquí vive TODO lo relativo al transporte.
 *
 * Room: `${market}:${symbol}:${interval}`  (ver backend/common/sockets.py).
 * Devuelve la función de limpieza para cerrarla conexión.
 */
import { io } from "socket.io-client"
import { SOCKET_URL } from "../api/httpClient"

export function connectTradingRoom({
  symbol,
  interval,
  market,
  onConnected,
  onDataUpdate,
  onConnectError,
  onDisconnected,
}) {
  const socket = io(SOCKET_URL, {
    reconnectionAttempts: 5,
    timeout: 10000,
  })

  const room = `${market}:${symbol}:${interval}`

  socket.on("connect", () => {
    console.log(`[Socket] Connected. Joining room: ${room}`)
    onConnected?.()
    socket.emit("join", { room })
  })

  socket.on("connect_error", (err) => {
    console.error("[Socket] Connection Error:", err.message)
    onConnectError?.("Fallo de conexión en tiempo real")
  })

  socket.on("trading_data_update", (data) => {
    console.log(`[Socket] Data update for ${data.symbol}`)
    onDataUpdate?.(data)
  })

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason)
    onDisconnected?.()
  })

  return () => {
    console.log(`[Socket] Cleaning up connection for ${room}`)
    socket.emit("leave", { room })
    socket.disconnect()
  }
}
