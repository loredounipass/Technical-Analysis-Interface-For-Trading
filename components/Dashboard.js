"use client"

import Header from "@/components/Header"
import PriceCard from "@/components/indicators/PriceCard"
import RecommendationCard from "@/components/indicators/RecommendationCard"
import IndicatorGrid from "@/components/indicators/IndicatorGrid"
import AiChat from "@/components/AiChat"
import { getRecommendation } from "@/utils/dataUtils"
import { fetchTradingData } from "@/utils/apiService"
import { useState, useEffect } from "react"

export default function Dashboard({ moneda, onCambiarMoneda }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)

  const fetchData = async () => {
    try {
      const nuevoDatos = await fetchTradingData(moneda.symbol)
      setDatos(nuevoDatos)
      setUltimaActualizacion(new Date().toLocaleString())
      setError(null)
    } catch (err) {
      console.error("Error:", err)
      setError("Error al obtener datos de trading")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [moneda.symbol])

  if (loading) {
    return (
      <div className="min-h-screen trading-gradient p-4 flex items-center justify-center">
        <div className="text-white text-xl font-mono">LOADING MARKET DATA...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen trading-gradient p-4 flex items-center justify-center">
        <div className="text-trading-red-400 text-xl font-mono">{error}</div>
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="min-h-screen trading-gradient p-4 flex items-center justify-center">
        <div className="text-white text-xl font-mono">NO DATA AVAILABLE</div>
      </div>
    )
  }

  const recomendacion = getRecommendation(datos)

  return (
    <div className="min-h-screen trading-gradient p-4">
      <div className="max-w-7xl mx-auto">
        <Header
          moneda={moneda}
          ultimaActualizacion={ultimaActualizacion}
          onActualizar={fetchData}
          onCambiarMoneda={onCambiarMoneda}
        />

        {/* Price and Recommendation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <PriceCard precio={datos.precio} decimales={datos.decimales} symbol={moneda.symbol} history={datos.history} />
          <RecommendationCard
            recomendacion={recomendacion}
            buySignals={datos.buySignals}
            sellSignals={datos.sellSignals}
            neutralSignals={datos.neutralSignals}
          />
        </div>

        {/* Technical Indicators */}
        <IndicatorGrid datos={datos} />
      </div>

      {/* AI Trading Agent Chat */}
      <AiChat symbol={moneda.symbol} datos={datos} />
    </div>
  )
}
