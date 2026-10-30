"use client"

import Header from "@/components/Header"
import PriceCard from "@/components/indicators/PriceCard"
import RecommendationCard from "@/components/indicators/RecommendationCard"
import IndicatorGrid from "@/components/indicators/IndicatorGrid"
import AiChat from "@/components/AiChat"
import { getRecommendation } from "@/utils/dataUtils"
import { fetchTradingData } from "@/utils/apiService"
import { useState, useEffect, useRef } from "react"
import useTradingSocket from "@/hooks/useTradingSocket"

export default function Dashboard({ moneda, market = "crypto", onCambiarMoneda }) {
  const [datos, setDatos] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null)
  const [timeframe, setTimeframe] = useState("15m")
  const [time, setTime] = useState("")
  const [mounted, setMounted] = useState(false)
  const [woodyScanning, setWoodyScanning] = useState(false)

  const fetchCounterRef = useRef(0)
  const { liveData, isConnected } = useTradingSocket(moneda.symbol, timeframe, market)

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

  const fetchData = async (selectedTimeframe = timeframe, force = false) => {
    const currentFetch = ++fetchCounterRef.current
    try {
      const nuevoDatos = await fetchTradingData(moneda.symbol, selectedTimeframe, market, force)
      if (currentFetch === fetchCounterRef.current) {
        setDatos(nuevoDatos)
        setUltimaActualizacion(new Date().toLocaleTimeString())
        setError(null)
      }
    } catch (err) {
      if (currentFetch === fetchCounterRef.current) {
        console.error("Error:", err)
        setError("Error al obtener datos de trading")
      }
    } finally {
      if (currentFetch === fetchCounterRef.current) {
        setLoading(false)
      }
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
  }, [moneda.symbol, market])

  useEffect(() => {
    if (liveData) {
      fetchCounterRef.current++
      setDatos(liveData)
      setUltimaActualizacion(new Date().toLocaleTimeString())
      setLoading(false)
    }
  }, [liveData])

  // Cyberpunk Loading State
  if (loading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4 bg-[#070c14] font-mono">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(#00f5c4 1px, transparent 1px), linear-gradient(90deg, #00f5c4 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-15 pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(0, 245, 196, 0.2) 0%, transparent 70%)" }}
        />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#00f5c4]/10 border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] animate-pulse shadow-[0_0_20px_rgba(0,245,196,0.3)]">
            <span className="w-3 h-3 rounded-full bg-[#00f5c4] animate-ping" />
          </div>
          <div className="text-white text-sm font-bold tracking-[0.25em] animate-pulse">
            SYNAPSE • LOADING FEED...
          </div>
        </div>
      </div>
    )
  }

  // Error State
  if (error) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4 bg-[#070c14] font-mono">
        <div className="text-[#ff3b69] text-base font-bold tracking-wider text-center mb-4">
          {error}
        </div>
        <button
          onClick={onCambiarMoneda}
          className="px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-[#00f5c4] bg-[#00f5c4]/10 border border-[#00f5c4]/40 hover:bg-[#00f5c4]/20 transition-all shadow-[0_0_15px_rgba(0,245,196,0.15)]"
        >
          ⟵ Volver al terminal
        </button>
      </div>
    )
  }

  // No Data State
  if (!datos) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4 bg-[#070c14] font-mono">
        <div className="text-slate-400 text-sm font-bold tracking-wider mb-4">
          NO DATA AVAILABLE
        </div>
        <button
          onClick={onCambiarMoneda}
          className="px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-[#00f5c4] bg-[#00f5c4]/10 border border-[#00f5c4]/40 hover:bg-[#00f5c4]/20 transition-all"
        >
          ⟵ Volver al terminal
        </button>
      </div>
    )
  }

  const recomendacion = getRecommendation(datos)

  return (
    <div className="min-h-screen relative overflow-x-hidden font-mono bg-[#070c14] text-slate-100 selection:bg-[#00f5c4]/20 selection:text-[#00f5c4]">
      {/* Precision Grid Background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 245, 196, 0.4) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 245, 196, 0.4) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Deep Space Radial Glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] rounded-full opacity-10 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at top, rgba(0, 245, 196, 0.25) 0%, transparent 70%)",
        }}
      />

      {/* Unified Synapse Top Navigation Header */}
      <Header
        moneda={moneda}
        ultimaActualizacion={ultimaActualizacion}
        onActualizar={() => fetchData(timeframe, true)}
        onCambiarMoneda={onCambiarMoneda}
        timeframe={timeframe}
        onTimeframeChange={handleTimeframeChange}
        isConnected={isConnected}
        time={time}
      />

      {/* Main Dashboard Layout */}
      <main
        className={`max-w-[1600px] mx-auto px-3 sm:px-6 pb-8 relative z-10 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {/* Top Row: Current Price Card & Market Signal Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <PriceCard
            precio={datos.precio}
            decimales={datos.decimales}
            symbol={moneda.symbol}
            history={datos.history}
            volumen={datos.volumen}
          />
          <RecommendationCard
            recomendacion={recomendacion}
            buySignals={datos.buySignals}
            sellSignals={datos.sellSignals}
            neutralSignals={datos.neutralSignals}
          />
        </div>

        {/* Candlestick & Technical Indicators Grid */}
        <IndicatorGrid datos={datos} />
      </main>

      {/* Woody scanning animation */}
      {woodyScanning && (
        <div className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center bg-[#070c14]/40 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[#0c1420]/90 border border-[#00f5c4]/30 shadow-[0_0_30px_rgba(0,245,196,0.2)]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[#00f5c4] inline-block animate-ping rounded-full" />
              <span className="text-xs font-mono font-bold text-[#00f5c4] tracking-[0.25em]">
                WOODY AGENT SCANNING
              </span>
              <span className="w-2 h-2 bg-cyan-400 inline-block animate-ping rounded-full" />
            </div>
            <div className="text-[10px] font-mono text-slate-400 tracking-[0.2em]">
              ANALYZING LIVE MARKET SIGNALS...
            </div>
          </div>
        </div>
      )}

      {/* AI Woody Chat Component */}
      <AiChat
        symbol={moneda.symbol}
        datos={datos}
        interval={timeframe}
        market={market}
        onAnalysisChange={setWoodyScanning}
      />
    </div>
  )
}
