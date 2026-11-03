"use client"

import { useState, useEffect, useRef } from "react"
import { ArrowLeftRight, Newspaper, Activity, Diamond, LayoutDashboard, ChevronLeft, ChevronRight } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import InstallButton from "./InstallButton"
import { formatDisplaySymbol } from "@/utils/dataUtils"

export default function Header({
  moneda,
  onCambiarMoneda,
  timeframe = "15m",
  onTimeframeChange,
  time = "",
}) {
  const router = useRouter()
  const pathname = usePathname()
  const isNewsPage = pathname === "/news"

  const [activeAsset, setActiveAsset] = useState(moneda)
  const [currentTime, setCurrentTime] = useState(time)

  useEffect(() => {
    if (moneda) {
      setActiveAsset(moneda)
    } else {
      try {
        const raw = window.localStorage.getItem("woody-terminal-asset")
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.symbol) setActiveAsset(parsed)
        }
      } catch (e) {}
    }
  }, [moneda])

  useEffect(() => {
    if (time) {
      setCurrentTime(time)
    } else {
      const updateTime = () => {
        const now = new Date()
        setCurrentTime(now.toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" }))
      }
      updateTime()
      const interval = setInterval(updateTime, 1000)
      return () => clearInterval(interval)
    }
  }, [time])

  const handleCambiarMoneda = () => {
    if (onCambiarMoneda) {
      onCambiarMoneda()
    } else {
      try {
        window.localStorage.removeItem("woody-terminal-asset")
      } catch (e) {}
      router.push("/")
    }
  }

  const timeframes = ["1m", "5m", "15m", "1h", "6h", "1d"]

  // Selector de temporalidades: iguala las dimensiones de Change Pair; las
  // opciones se desplazan horizontalmente cuando no caben.
  const tfScrollRef = useRef(null)
  const changePairRef = useRef(null)
  const [tfSize, setTfSize] = useState(null)
  const scrollTf = (dir) => {
    const el = tfScrollRef.current
    if (el) el.scrollBy({ left: dir * 64, behavior: "smooth" })
  }

  useEffect(() => {
    const el = changePairRef.current
    if (!el) return
    const measure = () => setTfSize({ width: el.offsetWidth, height: el.offsetHeight })
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  useEffect(() => {
    const el = tfScrollRef.current
    if (!el) return
    // Rueda vertical -> scroll horizontal (desktop con mouse, sin scrollbar visible).
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  useEffect(() => {
    // Al cambiar de temporalidad, traer la activa al centro del recuadro.
    const el = tfScrollRef.current
    if (!el) return
    const active = el.querySelector('[data-active="true"]')
    if (active) active.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
  }, [timeframe])

  // Par formateado con slash: ETHUSDT -> ETH/USDT. Stocks/forex/indices de Yahoo
  // pasan por formatDisplaySymbol para quitar el sufijo =X/=F (EURUSD=X -> EUR/USD).
  const rawSymbol = activeAsset?.symbol || "ETHUSDT"
  const pairLabel =
    activeAsset?.market === "stock"
      ? formatDisplaySymbol(rawSymbol)
      : rawSymbol.includes("/")
        ? rawSymbol
        : rawSymbol.replace(/(USDT|USDC|BTC|ETH|EUR|USD)$/, "/$1")

  return (
    <header className="w-full bg-[#070c14]/95 border-b border-[#142335] sticky top-0 z-50 backdrop-blur-md px-3 sm:px-6 py-2.5 mb-5 shadow-lg shadow-black/40">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-x-3 gap-y-2.5 text-xs font-mono">
        {/* Brand (left). On large screens it shares a single row with the
            controls and status; on mobile it sits above them. */}
          <div
            onClick={() => router.push("/dashboard")}
            className="order-1 flex items-center gap-2.5 cursor-pointer group min-w-0"
          >
            <div className="w-8 h-8 rounded-lg bg-[#00f5c4]/10 border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] shadow-[0_0_12px_rgba(0,245,196,0.3)] group-hover:scale-105 transition-transform flex-shrink-0">
              <Activity className="w-4.5 h-4.5 animate-pulse" />
            </div>
            <span className="font-extrabold tracking-wider text-white text-base sm:text-lg whitespace-nowrap group-hover:text-[#00f5c4] transition-colors">
              SYNAPSE TERMINAL
            </span>
          </div>
  
          {/* UTC clock */}
          <div className="order-2 ml-auto flex items-center gap-2 sm:gap-3 text-[11px] flex-shrink-0 lg:order-3 lg:ml-0">
            <div className="text-slate-300 font-semibold tracking-wider">
              UTC <span className="text-white font-bold">{currentTime || "00:00:00"}</span>
            </div>
          </div>
  
        {/* Asset badge + navigation actions + timeframe selector. Centered in the
            navbar on large screens; its own full-width row on mobile. */}
        <div className="order-3 w-full flex flex-wrap md:flex-nowrap items-center gap-2 sm:gap-3 md:overflow-x-auto md:[&::-webkit-scrollbar]:hidden md:[-ms-overflow-style:none] md:[scrollbar-width:none] lg:order-2 lg:w-auto lg:flex-1 lg:justify-center">
          {/* Coin / Pair badge con ETH/USDT y SPOT claramente separados */}
          <button
            onClick={handleCambiarMoneda}
            title="Click para cambiar activo"
            className="group flex flex-shrink-0 items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#00f5c4]/40 transition-all shadow-sm"
          >
            <div className="w-5 h-5 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center shadow-[0_0_8px_rgba(0,245,196,0.2)]">
              <Diamond className="w-3 h-3 text-[#00f5c4] fill-[#00f5c4]/40" />
            </div>
            <span className="font-bold text-white tracking-wider text-xs">{pairLabel}</span>
            <span className="px-2 py-0.5 rounded-full bg-[#00f5c4]/15 border border-[#00f5c4]/30 text-[#00f5c4] font-bold text-[9px] tracking-widest uppercase shadow-[0_0_8px_rgba(0,245,196,0.15)]">
              {activeAsset?.market === "stock" ? (activeAsset?.badge || "STOCK") : "SPOT"}
            </span>
          </button>
  
          {/* Navigation actions: icon-only on mobile, icon + label from sm up */}
          <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Install app button (solo aparece si el navegador ofrece instalar la PWA) */}
            <InstallButton />
  
            {/* Dashboard button (shown when on news page) */}
            {isNewsPage && (
              <button
                onClick={() => router.push("/dashboard")}
                className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#00f5c4]/40 hover:bg-[#00f5c4]/5 text-white transition-all text-sm font-semibold tracking-wide shadow-sm"
                title="Return to Trading Dashboard"
              >
                <LayoutDashboard className="w-4 h-4 text-[#00f5c4]" />
                <span className="hidden sm:inline font-semibold whitespace-nowrap">Dashboard</span>
              </button>
            )}
  
            {/* Market News button */}
            <button
              onClick={() => router.push("/news")}
              className={`flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full transition-all text-sm font-semibold tracking-wide shadow-sm ${
                isNewsPage
                  ? "bg-cyan-400/15 border border-cyan-400 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                  : "bg-[#09111b] border border-[#16283d] hover:border-cyan-400/40 hover:bg-cyan-400/5 text-white"
              }`}
              title="Market News"
            >
              <Newspaper className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline font-semibold whitespace-nowrap">MarketNews</span>
            </button>
  
            {/* Change pair button */}
            <button
              ref={changePairRef}
              onClick={handleCambiarMoneda}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#00f5c4]/40 hover:bg-[#00f5c4]/5 text-white transition-all text-sm font-semibold tracking-wide shadow-sm"
              title="Change Trading Pair"
            >
              <ArrowLeftRight className="w-4 h-4 text-[#00f5c4]" />
              <span className="hidden sm:inline font-semibold whitespace-nowrap">Change Pair</span>
            </button>
          </div>
  
          {/* Timeframe selector: mismas dimensiones que el boton Change Pair. */}
          {onTimeframeChange && (
            <div
              style={tfSize ? { width: tfSize.width, height: tfSize.height } : undefined}
              className="flex flex-shrink-0 min-w-0 items-center gap-1"
            >
              <button
                type="button"
                onClick={() => scrollTf(-1)}
                aria-label="Temporalidades anteriores"
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-[#09111b] border border-[#16283d] text-slate-400 hover:text-white hover:border-[#00f5c4]/40 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <div
                ref={tfScrollRef}
                className="flex h-full min-w-0 flex-1 items-center gap-0.5 px-1 rounded-full bg-[#09111b] border border-[#16283d] overflow-x-auto overscroll-contain [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                {timeframes.map((tf) => {
                  const isActive = timeframe.toLowerCase() === tf.toLowerCase()
                  return (
                    <button
                      key={tf}
                      data-active={isActive ? "true" : "false"}
                      onClick={() => onTimeframeChange(tf)}
                      className={`flex h-full flex-shrink-0 items-center whitespace-nowrap px-2.5 rounded-full text-xs font-semibold tracking-wide transition-all uppercase text-center ${isActive
                        ? "bg-[#00f5c4]/15 border border-[#00f5c4] text-[#00f5c4] shadow-[0_0_12px_rgba(0,245,196,0.35)]"
                        : "text-slate-300 hover:text-white border border-transparent"
                        }`}
                    >
                      {tf}
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => scrollTf(1)}
                aria-label="Temporalidades siguientes"
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-[#09111b] border border-[#16283d] text-slate-400 hover:text-white hover:border-[#00f5c4]/40 transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
