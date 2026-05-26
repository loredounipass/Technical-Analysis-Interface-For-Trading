"use client"

import Header from "@/components/Header"
import PriceCard from "@/components/indicators/PriceCard"
import RecommendationCard from "@/components/indicators/RecommendationCard"
import IndicatorGrid from "@/components/indicators/IndicatorGrid"
import AiChat from "@/components/AiChat"
import { getRecommendation } from "@/utils/dataUtils"
import { fetchTradingData } from "@/utils/apiService"
import { useState, useEffect } from "react"
import useTradingSocket from "@/hooks/useTradingSocket"

export default function Dashboard({ moneda, onCambiarMoneda }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)
  const [timeframe, setTimeframe] = useState("15m")

  // Use our new real-time socket hook
  const { liveData, isConnected } = useTradingSocket(moneda.symbol, timeframe)

  const fetchData = async (selectedTimeframe = timeframe) => {
    try {
      const nuevoDatos = await fetchTradingData(moneda.symbol, selectedTimeframe)
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

  const handleTimeframeChange = (newTimeframe) => {
    setTimeframe(newTimeframe)
    setLoading(true)
    fetchData(newTimeframe)
  }

  // Effect for initial fetch and cleanup
  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [moneda.symbol])

  // Effect to update data when socket emits new info
  useEffect(() => {
    if (liveData) {
      setDatos(liveData)
      setUltimaActualizacion(new Date().toLocaleString())
      setLoading(false)
    }
  }, [liveData])

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
        {/* Connection Status Badge */}
        <div className="flex justify-end mb-2">
          <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono border ${
            isConnected 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
            {isConnected ? 'LIVE CONNECTION ACTIVE' : 'CONNECTION OFFLINE'}
          </div>
        </div>

        <Header
          moneda={moneda}
          ultimaActualizacion={ultimaActualizacion}
          onActualizar={() => fetchData()}
          onCambiarMoneda={onCambiarMoneda}
        />

        {/* Timeframe Selector */}
        <div className="flex items-center gap-2 mb-6 bg-gray-900/40 p-1 rounded-xl border border-white/5 w-fit">
          {["1m", "5m", "15m", "1h", "4h", "1d"].map((tf) => (
            <button
              key={tf}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-4 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 ${
                timeframe === tf
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

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
      <AiChat symbol={moneda.symbol} datos={datos} interval={timeframe} />
    </div>
  )
}
