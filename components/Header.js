"use client"

import { RefreshCw, ArrowLeftRight, Newspaper, Activity, Diamond } from "lucide-react"
import { useRouter } from "next/navigation"

export default function Header({
  moneda,
  ultimaActualizacion,
  onActualizar,
  onCambiarMoneda,
  timeframe = "15m",
  onTimeframeChange,
  isConnected = true,
  latency = "12ms",
  time = "",
}) {
  const router = useRouter()
  const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d"]

  // Par formateado con slash: ETHUSDT -> ETH/USDT (stocks quedan igual)
  const rawSymbol = moneda?.symbol || "ETHUSDT"
  const pairLabel =
    moneda?.market === "stock"
      ? rawSymbol
      : rawSymbol.includes("/")
        ? rawSymbol
        : rawSymbol.replace(/(USDT|USDC|BTC|ETH|EUR|USD)$/, "/$1")

  return (
    <header className="w-full bg-[#070c14]/95 border-b border-[#142335] sticky top-0 z-40 backdrop-blur-md px-3 sm:px-6 py-2.5 mb-5 shadow-lg shadow-black/40">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-y-2.5 gap-x-3 text-xs font-mono">
        {/* Left: Brand + Status + Coin badge */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2 pr-1">
            <div className="w-6 h-6 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] shadow-[0_0_10px_rgba(0,245,196,0.25)]">
              <Activity className="w-3.5 h-3.5 animate-pulse" />
            </div>
            <span className="font-bold tracking-wider text-white text-sm whitespace-nowrap">
              SYNAPSE TERMINAL
            </span>
          </div>

          {/* SYS.ON Data Feed Active Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#00f5c4]/5 border border-[#00f5c4]/30 text-[#00f5c4] shadow-[0_0_10px_rgba(0,245,196,0.1)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] animate-ping" />
            <span className="text-[10px] font-bold tracking-wider whitespace-nowrap text-white">
              SYS.ON • <span className="text-[#00f5c4]">DATA FEED ACTIVE</span>
            </span>
          </div>

          {/* Coin / Pair badge con ETH/USDT y SPOT claramente separados */}
          <button
            onClick={onCambiarMoneda}
            title="Click para cambiar activo"
            className="group flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#00f5c4]/40 transition-all shadow-sm"
          >
            <div className="w-5 h-5 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 flex items-center justify-center shadow-[0_0_8px_rgba(0,245,196,0.2)]">
              <Diamond className="w-3 h-3 text-[#00f5c4] fill-[#00f5c4]/40" />
            </div>
            <span className="font-bold text-white tracking-wider text-xs">{pairLabel}</span>
            <span className="px-2 py-0.5 rounded-full bg-[#00f5c4]/15 border border-[#00f5c4]/30 text-[#00f5c4] font-bold text-[9px] tracking-widest uppercase shadow-[0_0_8px_rgba(0,245,196,0.15)]">
              {moneda?.market === "stock" ? (moneda?.badge || "STOCK") : "SPOT"}
            </span>
          </button>
        </div>

        {/* Center: Actions & Timeframes */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {/* Refresh button */}
          <button
            onClick={onActualizar}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#2b4c73] text-white transition-all"
            title={ultimaActualizacion ? `Last update: ${ultimaActualizacion}` : "Refresh Data"}
          >
            <RefreshCw className="w-3 h-3 text-cyan-400 group-hover:rotate-180 transition-transform duration-500" />
            <span className="hidden md:inline text-white font-medium">Refresh Data</span>
          </button>

          {/* Market News button */}
          <button
            onClick={() => router.push("/news")}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#2b4c73] text-white transition-all"
          >
            <Newspaper className="w-3 h-3 text-cyan-400" />
            <span className="hidden sm:inline text-white font-medium">MarketNews</span>
          </button>

          {/* Change pair button */}
          <button
            onClick={onCambiarMoneda}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#09111b] border border-[#16283d] hover:border-[#2b4c73] text-white transition-all"
            title="Change Trading Pair"
          >
            <ArrowLeftRight className="w-3 h-3 text-[#00f5c4]" />
            <span className="text-white font-medium">Ch</span>
          </button>

          {/* Timeframe pill selector */}
          {onTimeframeChange && (
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-[#09111b] border border-[#16283d]">
              {timeframes.map((tf) => {
                const isActive = timeframe.toLowerCase() === tf.toLowerCase()
                return (
                  <button
                    key={tf}
                    onClick={() => onTimeframeChange(tf)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wider transition-all uppercase ${isActive
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

        {/* Right: Latency Connection + UTC Clock */}
        <div className="flex items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#09111b] border border-[#16283d]">
            <span
              className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]" : "bg-[#ff3b69]"
                }`}
            />
            <span className={isConnected ? "text-slate-200" : "text-[#ff3b69]"}>
              {isConnected ? `CONN. STABLE (${latency})` : "CONN. LOST"}
            </span>
          </div>

          <div className="text-slate-300 font-semibold tracking-wider">
            CT <span className="text-white font-bold">{time || "18:14:02"}</span>
          </div>
        </div>
      </div>
    </header>
  )
}
