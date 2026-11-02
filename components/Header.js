"use client"

import { useState, useEffect } from "react"
import { ArrowLeftRight, Newspaper, Activity, Diamond, LayoutDashboard } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import InstallButton from "./InstallButton"

export default function Header({
  moneda,
  onCambiarMoneda,
  timeframe = "15m",
  onTimeframeChange,
  isConnected = true,
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

  // Par formateado con slash: ETHUSDT -> ETH/USDT (stocks quedan igual)
  const rawSymbol = activeAsset?.symbol || "ETHUSDT"
  const pairLabel =
    activeAsset?.market === "stock"
      ? rawSymbol
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
  
          {/* Connection status + UTC clock. The text label collapses to just a
              colored dot on mobile so the top row never wraps. */}
          <div className="order-2 ml-auto flex items-center gap-2 sm:gap-3 text-[11px] flex-shrink-0 lg:order-3 lg:ml-0">
            <div
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full bg-[#09111b] border border-[#16283d]"
              title={isConnected ? "Connection stable" : "Connection lost"}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]" : "bg-[#ff3b69]"}`}
              />
              <span className={`hidden sm:inline ${isConnected ? "text-slate-200" : "text-[#ff3b69]"}`}>
                {isConnected ? "CONN. STABLE" : "CONN. LOST"}
              </span>
            </div>
  
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
              onClick={handleCambiarMoneda}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#00f5c4]/40 hover:bg-[#00f5c4]/5 text-white transition-all text-sm font-semibold tracking-wide shadow-sm"
              title="Change Trading Pair"
            >
              <ArrowLeftRight className="w-4 h-4 text-[#00f5c4]" />
              <span className="hidden sm:inline font-semibold whitespace-nowrap">Change Pair</span>
            </button>
          </div>
  
          {/* Timeframe pill selector: compacto y con scroll horizontal propio,
              asi ocupa menos ancho y las opciones fuera de vista se deslizando
              siguen accesibles (drag en movil, shift+rueda / trackpad en desktop). */}
          {onTimeframeChange && (
            <div className="flex min-w-0 max-w-full items-center gap-0.5 px-1 rounded-full bg-[#09111b] border border-[#16283d] overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {timeframes.map((tf) => {
                const isActive = timeframe.toLowerCase() === tf.toLowerCase()
                return (
                  <button
                    key={tf}
                    onClick={() => onTimeframeChange(tf)}
                    className={`flex-shrink-0 whitespace-nowrap px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-semibold tracking-wide transition-all uppercase text-center ${isActive
                      ? "bg-[#00f5c4]/15 border border-[#00f5c4] text-[#00f5c4] shadow-[0_0_12px_rgba(0,245,196,0.35)]"
                      : "text-slate-300 hover:text-white border border-transparent"
                      }`}
                  >
                    {tf}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
