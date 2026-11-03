"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Dashboard from "@/components/Dashboard"

type Moneda = {
  nombre: string
  symbol: string
  icon: string
  badge: string
  market: "crypto" | "stock"
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

export default function DashboardPage() {
  const router = useRouter()
  const [moneda, setMoneda] = useState<Moneda | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const saved = loadSavedMoneda()
    if (!saved) {
      // No hay activo seleccionado, volver al selector
      router.replace("/")
      return
    }
    setMoneda(saved)
    setHydrated(true)
  }, [router])

  const cambiarMoneda = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      // ignore storage errors
    }
    router.push("/")
  }

  // Evitar flash mientras se restaura el activo guardado
  if (!hydrated || !moneda) return null

  return (
    <Dashboard
      moneda={moneda}
      market={moneda.market}
      onCambiarMoneda={cambiarMoneda}
    />
  )
}

