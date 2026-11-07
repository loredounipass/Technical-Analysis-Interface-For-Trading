"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import CoinSelector from "@/components/CoinSelector"
import { useAuth } from "@/hooks/useAuth"
import { showAuthRequiredToast } from "@/components/global-toast"
import { AuthNavbar } from "@/components/auth/AuthNavbar"
import { PublicRoute } from "@/components/guards/PublicRoute"

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
  16: { nombre: "Dogecoin", symbol: "DOGEUSDT", icon: "🐕", badge: "USDT", market: "crypto" },
  17: { nombre: "XRP", symbol: "XRPUSDT", icon: "✖️", badge: "USDT", market: "crypto" },
  18: { nombre: "Shiba Inu", symbol: "SHIBUSDT", icon: "🐕‍🦺", badge: "USDT", market: "crypto" },
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
  18: { nombre: "Lockheed Martin", symbol: "LMT", icon: "✈️", badge: "NYSE", market: "stock" },
}

const INDICES: Record<string, Moneda> = {
  19: { nombre: "Nasdaq 100", symbol: "^NDX", icon: "📊", badge: "NASDAQ", market: "stock" },
  20: { nombre: "Oro (Futuro)", symbol: "GC=F", icon: "🥇", badge: "COMEX", market: "stock" },
  21: { nombre: "Euro / Dólar", symbol: "EURUSD=X", icon: "💶", badge: "FOREX", market: "stock" },
}

const STORAGE_KEY = "woody-terminal-asset"

export default function CryptoTradingApp() {
  const router = useRouter()
  const { isAuthenticated, isLoading, openLoginDialog } = useAuth()
  const [hydrated, setHydrated] = useState(false)

  // Si ya hay un activo guardado Y el usuario está autenticado, redirigir directamente al dashboard
  useEffect(() => {
    if (isLoading) return

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw && isAuthenticated) {
        const saved = JSON.parse(raw)
        if (saved && saved.symbol) {
          router.replace("/dashboard")
          return
        }
      }
    } catch (e) {
      // ignore corrupt storage
    }
    setHydrated(true)
  }, [router, isAuthenticated, isLoading])

  const seleccionarMoneda = (key: string) => {
    const moneda = MONEDAS[key] || ACCIONES[key] || INDICES[key]
    if (!moneda) return

    // Verificación de sesión requerida antes de entrar al terminal
    if (!isAuthenticated) {
      showAuthRequiredToast(
        "Se requiere iniciar sesión para seleccionar un activo y acceder al terminal.",
        () => openLoginDialog(`Inicia sesión para acceder a ${moneda.nombre}`)
      )
      openLoginDialog(`Inicia sesión para acceder a ${moneda.nombre}`)
      return
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(moneda))
    } catch (e) {
      // ignore storage errors
    }
    router.push("/dashboard")
  }

  // Evitar flash del selector mientras se verifica estado
  if (!hydrated || isLoading) return null

  return (
    <PublicRoute>
      <div className="min-h-screen flex flex-col bg-[#070c14]">
        <AuthNavbar />
        <main className="flex-1">
          <CoinSelector
            monedas={MONEDAS}
            acciones={ACCIONES}
            indices={INDICES}
            onSelect={seleccionarMoneda}
            hideTopStatus={true}
          />
        </main>
      </div>
    </PublicRoute>
  )
}
