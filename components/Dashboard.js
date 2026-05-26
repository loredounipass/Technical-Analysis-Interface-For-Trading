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
import { Radio, Activity } from "lucide-react"

export default function Dashboard({ moneda, onCambiarMoneda }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)
  const [timeframe, setTimeframe] = useState("15m")
  const [time, setTime] = useState("")
  const [mounted, setMounted] = useState(false)
  const [woodyScanning, setWoodyScanning] = useState(false)

  const { liveData, isConnected } = useTradingSocket(moneda.symbol, timeframe)

  useEffect(() => {
    setMounted(true)
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString("en-US", { hour12: false }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

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

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [moneda.symbol])

  useEffect(() => {
    if (liveData) {
      setDatos(liveData)
      setUltimaActualizacion(new Date().toLocaleString())
      setLoading(false)
    }
  }, [liveData])

  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4" style={{ background: "#05070a" }}>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)" }} />
        <div className="text-white text-xl font-mono tracking-widest animate-pulse">LOADING MARKET DATA...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4" style={{ background: "#05070a" }}>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)" }} />
        <div className="text-trading-red-400 text-xl font-mono">{error}</div>
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4" style={{ background: "#05070a" }}>
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)" }} />
        <div className="text-white text-xl font-mono">NO DATA AVAILABLE</div>
      </div>
    )
  }

  const recomendacion = getRecommendation(datos)

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "#05070a" }}>
      {/* Animated grid background */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Radial glow */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)" }} />

      {/* Corner accents */}
      <div className="fixed top-0 left-0 w-32 h-32 opacity-20 pointer-events-none z-50"
        style={{ borderTop: "1px solid #10b981", borderLeft: "1px solid #10b981" }} />
      <div className="fixed bottom-0 right-0 w-32 h-32 opacity-20 pointer-events-none z-50"
        style={{ borderBottom: "1px solid #10b981", borderRight: "1px solid #10b981" }} />

      {/* Top status bar */}
      <div className="relative z-10 flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400/60 uppercase tracking-widest">System Online</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Activity className={`w-3 h-3 ${isConnected ? 'text-emerald-500/50' : 'text-red-500/50'}`} />
            <span className={`text-[10px] font-mono uppercase tracking-wider ${isConnected ? 'text-emerald-500/50' : 'text-red-500/50'}`}>
              {isConnected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
          <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">UTC {time}</span>
        </div>
      </div>

      <div className={`relative z-10 transition-all duration-1000 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
        <div className="max-w-7xl mx-auto px-4 pb-4">
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
      </div>

      {/* Woody scanning animation */}
      {woodyScanning && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div className="absolute inset-0" style={{ background: "rgba(5, 7, 10, 0.3)" }} />
          <div className="absolute inset-0 overflow-hidden">
            {/* Scanner line removed by user request */}
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-400 inline-block animate-ping rounded-sm" />
                <span className="text-xs font-mono text-emerald-400 tracking-[0.3em]">WOODY AGENT</span>
                <span className="w-2 h-2 bg-cyan-400 inline-block animate-ping rounded-sm" />
              </div>
              <div className="text-[10px] font-mono text-emerald-600/60 tracking-[0.2em]">THINKING...</div>
            </div>
          </div>
        </div>
      )}

      <AiChat symbol={moneda.symbol} datos={datos} interval={timeframe} onAnalysisChange={setWoodyScanning} />
    </div>
  )
}
