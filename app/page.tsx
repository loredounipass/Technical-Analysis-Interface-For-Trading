"use client"

import { useState, useEffect } from "react"
import CoinSelector from "@/components/CoinSelector"
import Dashboard from "@/components/Dashboard"

// Configuración de monedas
type Moneda = {
  nombre: string
  symbol: string
  icon: string
  badge: string
  market: "crypto" | "stock"
}

const MONEDAS: Record<string, Moneda> = {
  1: { nombre: "Ethereum", symbol: "ETHUSDT", icon: "⟠", badge: "USDT", market: "crypto" },
  2: { nombre: "Pepe", symbol: "PEPEUSDT", icon: "🐸", badge: "USDT", market: "crypto" },
  3: { nombre: "Solana", symbol: "SOLUSDT", icon: "◎", badge: "USDT", market: "crypto" },
  4: { nombre: "Bitcoin", symbol: "BTCUSDT", icon: "₿", badge: "USDT", market: "crypto" },
  15: { nombre: "BNB", symbol: "BNBUSDT", icon: "🟡", badge: "USDT", market: "crypto" },
  16: { nombre: "Polygon", symbol: "MATICUSDT", icon: "🔷", badge: "USDT", market: "crypto" },
  17: { nombre: "XRP", symbol: "XRPUSDT", icon: "✖️", badge: "USDT", market: "crypto" },
}

const ACCIONES: Record<string, Moneda> = {
  5: { nombre: "Apple Inc.", symbol: "AAPL", icon: "🍏", badge: "NASDAQ", market: "stock" },
  6: { nombre: "Microsoft", symbol: "MSFT", icon: "💻", badge: "NASDAQ", market: "stock" },
  7: { nombre: "NVIDIA Corp.", symbol: "NVDA", icon: "🎮", badge: "NASDAQ", market: "stock" },
  8: { nombre: "Tesla Inc.", symbol: "TSLA", icon: "🚗", badge: "NASDAQ", market: "stock" },
  9: { nombre: "Amazon.com", symbol: "AMZN", icon: "📦", badge: "NASDAQ", market: "stock" },
  10: { nombre: "Alphabet Inc.", symbol: "GOOGL", icon: "🔎", badge: "NASDAQ", market: "stock" },
  11: { nombre: "Meta Platforms", symbol: "META", icon: "👓", badge: "NASDAQ", market: "stock" },
  12: { nombre: "Netflix Inc.", symbol: "NFLX", icon: "🎬", badge: "NASDAQ", market: "stock" },
  13: { nombre: "AMD", symbol: "AMD", icon: "💾", badge: "NASDAQ", market: "stock" },
  14: { nombre: "Intel Corp.", symbol: "INTC", icon: "🖥️", badge: "NASDAQ", market: "stock" },
}

const STORAGE_KEY = "woody-terminal-asset"

function loadSavedMoneda(): Moneda | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (saved && saved.symbol) return saved as Moneda
  } catch (e) {
    // ignore corrupt storage
  }
  return null
}

export default function CryptoTradingApp() {
  const [monedaSeleccionada, setMonedaSeleccionada] = useState<Moneda | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Restaurar el activo guardado (recargar la pagina no saca del dashboard)
  useEffect(() => {
    setMonedaSeleccionada(loadSavedMoneda())
    setHydrated(true)
  }, [])

  const seleccionarMoneda = (key: string) => {
    const moneda = MONEDAS[key] || ACCIONES[key]
    if (moneda) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(moneda))
      } catch (e) {
        // ignore storage errors
      }
      setMonedaSeleccionada(moneda)
    }
  }
  const cambiarMoneda = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      // ignore storage errors
    }
    setMonedaSeleccionada(null)
  }

  // Evitar flash del selector mientras se restaura el activo guardado
  if (!hydrated) return null

  // Renderizado condicional basado en el estado
  if (!monedaSeleccionada) {
    return <CoinSelector monedas={MONEDAS} acciones={ACCIONES} onSelect={seleccionarMoneda} />
  }

  return (
    <Dashboard
      moneda={monedaSeleccionada}
      market={monedaSeleccionada.market}
      onCambiarMoneda={cambiarMoneda}
    />
  )
}
