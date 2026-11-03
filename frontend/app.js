"use client"

import { useState } from "react"
import CoinSelector from "./components/CoinSelector"
import LoadingScreen from "./components/LoadingScreen"
import Dashboard from "./components/Dashboard"

// Configuración de monedas
const MONEDAS = {
  1: { nombre: "Ethereum", symbol: "ETHUSDT", icon: "⟠" },
  2: { nombre: "Pepe", symbol: "PEPEUSDT", icon: "🐸" },
  3: { nombre: "Solana", symbol: "SOLUSDT", icon: "◎" },
  4: { nombre: "Bitcoin", symbol: "BTCUSDT", icon: "₿" },
}

export default function App() {
  const [monedaSeleccionada, setMonedaSeleccionada] = useState(null)
  const [datos, setDatos] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)

  const seleccionarMoneda = (key) => {
    const moneda = MONEDAS[key]
    setMonedaSeleccionada(moneda)
  }

  const actualizarDatos = () => {
    if (monedaSeleccionada) {
      cargarAnalisis(monedaSeleccionada)
    }
  }

  const cambiarMoneda = () => {
    setMonedaSeleccionada(null)
    setDatos(null)
  }

  // Renderizado condicional basado en el estado
  if (!monedaSeleccionada) {
    return <CoinSelector monedas={MONEDAS} onSelect={seleccionarMoneda} />
  }

  if (!monedaSeleccionada) {
    return <CoinSelector monedas={MONEDAS} onSelect={seleccionarMoneda} />
  }
  return (
    <Dashboard
      moneda={monedaSeleccionada}
      onCambiarMoneda={cambiarMoneda}
    />
  )
}
