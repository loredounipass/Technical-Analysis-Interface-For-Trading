"use client"

import { useState, useEffect } from "react"
import { BarChart3, Activity, Zap, Shield, Globe, ChevronRight, Radio, Bitcoin, LineChart } from "lucide-react"
import CoinLogo from "@/components/CoinLogo"

export default function CoinSelector({ monedas, acciones, onSelect }) {
  const [hoveredKey, setHoveredKey] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [time, setTime] = useState("")
  const [market, setMarket] = useState("crypto")

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

  const activeList = market === "stock" ? acciones : monedas

  const getDynamicCoinColor = (symbol) => {
    const knownColors = {
      "ETHUSDT": { from: "#00f5c4", to: "#0d5b8c", glow: "rgba(0, 245, 196, 0.25)" },
      "PEPEUSDT": { from: "#10e5bd", to: "#0d9488", glow: "rgba(16, 229, 189, 0.25)" },
      "SOLUSDT": { from: "#9945ff", to: "#00f5c4", glow: "rgba(153, 69, 255, 0.25)" },
      "BTCUSDT": { from: "#f59e0b", to: "#d97706", glow: "rgba(245, 158, 11, 0.25)" },
      "BNBUSDT": { from: "#fbbf24", to: "#b45309", glow: "rgba(251, 191, 36, 0.25)" },
      "DOGEUSDT": { from: "#eab308", to: "#854d0e", glow: "rgba(234, 179, 8, 0.25)" },
      "XRPUSDT": { from: "#38bdf8", to: "#0284c7", glow: "rgba(56, 189, 248, 0.25)" },
      "AAPL": { from: "#94a3b8", to: "#475569", glow: "rgba(148, 163, 184, 0.25)" },
      "MSFT": { from: "#00a4ef", to: "#0369a1", glow: "rgba(0, 164, 239, 0.25)" },
      "NVDA": { from: "#76b900", to: "#4d7c0f", glow: "rgba(118, 185, 0, 0.25)" },
      "TSLA": { from: "#ff3b69", to: "#be123c", glow: "rgba(255, 59, 105, 0.25)" },
      "AMZN": { from: "#f97316", to: "#c2410c", glow: "rgba(249, 115, 22, 0.25)" },
      "GOOGL": { from: "#38bdf8", to: "#1d4ed8", glow: "rgba(56, 189, 248, 0.25)" },
      "META": { from: "#3b82f6", to: "#1e40af", glow: "rgba(59, 130, 246, 0.25)" },
      "NFLX": { from: "#ff3b69", to: "#991b1b", glow: "rgba(255, 59, 105, 0.25)" },
      "AMD": { from: "#ff4d4d", to: "#991b1b", glow: "rgba(255, 77, 77, 0.25)" },
      "INTC": { from: "#0284c7", to: "#075985", glow: "rgba(2, 132, 199, 0.25)" },
      "LMT": { from: "#0ea5e9", to: "#0369a1", glow: "rgba(14, 165, 233, 0.25)" },
    }
    
    if (knownColors[symbol]) return knownColors[symbol]

    let hash = 0
    for (let i = 0; i < symbol.length; i++) {
      hash = symbol.charCodeAt(i) + ((hash << 5) - hash)
    }
    
    const h = Math.abs(hash % 360)
    return {
      from: `hsl(${h}, 80%, 60%)`,
      to: `hsl(${h}, 80%, 30%)`,
      glow: `hsla(${h}, 80%, 60%, 0.25)`,
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4 bg-[#070c14]">
      {/* Precision grid background */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(#00f5c4 1px, transparent 1px),
            linear-gradient(90deg, #00f5c4 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-15 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(0, 245, 196, 0.15) 0%, transparent 70%)",
        }}
      />

      {/* Main content */}
      <div
        className={`relative z-10 w-full max-w-2xl transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
        }`}
      >
        {/* Top status bar */}
        <div className="flex items-center justify-between mb-8 px-2 font-mono">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0c1420] border border-[#16283d]">
            <div className="w-2 h-2 rounded-full bg-[#00f5c4] shadow-[0_0_8px_#00f5c4] animate-pulse" />
            <span className="text-[10px] text-[#00f5c4] uppercase tracking-widest font-bold">
              SYS.ON • DATA FEED ACTIVE
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-400">UTC {time}</span>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0c1420] border border-[#16283d]">
              <Radio className="w-3 h-3 text-[#00f5c4]" />
              <span className="text-[10px] text-slate-300 font-bold">LIVE</span>
            </div>
          </div>
        </div>

        {/* Logo & Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5">
            <div className="w-14 h-14 rounded-2xl bg-[#0c1420] border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] shadow-[0_0_20px_rgba(0,245,196,0.25)]">
              <Activity className="w-7 h-7 animate-pulse" />
            </div>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold mb-2 tracking-wider font-mono text-white">
            SYNAPSE TERMINAL
          </h1>

          <p className="text-slate-400 text-xs font-mono tracking-widest uppercase mb-4">
            Next-Gen Technical Analysis Interface
          </p>

          <div className="flex items-center justify-center flex-wrap gap-x-5 gap-y-2 font-mono">
            {[
              { icon: Zap, label: "Live Feed" },
              { icon: BarChart3, label: "Advanced TA" },
              { icon: Shield, label: "Sub-Second" },
              { icon: Globe, label: "Multi-Market" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-slate-400 text-[10px] uppercase tracking-wider">
                <Icon className="w-3.5 h-3.5 text-[#00f5c4]" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section label */}
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#16283d] to-transparent" />
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-[0.25em]">
            Select Trading Asset
          </span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#16283d] to-transparent" />
        </div>

        {/* Market toggle */}
        <div className="flex items-center justify-center mb-5 font-mono">
          <div className="flex items-center gap-1 bg-[#0c1420] p-1 rounded-full border border-[#16283d]">
            {[
              { key: "crypto", label: "CRYPTO SPOT", Icon: Bitcoin },
              { key: "stock", label: "US EQUITIES", Icon: LineChart },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setMarket(key)}
                className={`flex items-center gap-2 px-4 py-1 rounded-full text-[11px] font-bold tracking-wider transition-all uppercase ${
                  market === key
                    ? "bg-[#00f5c4]/15 text-[#00f5c4] border border-[#00f5c4] shadow-[0_0_12px_rgba(0,245,196,0.25)]"
                    : "text-slate-400 hover:text-white border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Asset cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(activeList).map(([key, moneda]) => {
            const colors = getDynamicCoinColor(moneda.symbol)
            const isHovered = hoveredKey === key

            return (
              <button
                key={key}
                id={`coin-select-${moneda.symbol}`}
                onClick={() => onSelect(key)}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                className="synapse-card p-4 flex items-center justify-between text-left group transition-all duration-200"
                style={{
                  borderColor: isHovered ? colors.from : "#16283d",
                  boxShadow: isHovered ? `0 4px 25px ${colors.glow}` : "none",
                  transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                }}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-11 h-11 rounded-xl bg-[#09111b] border flex items-center justify-center flex-shrink-0 transition-transform duration-200"
                    style={{
                      borderColor: isHovered ? colors.from : "#16283d",
                      transform: isHovered ? "scale(1.05)" : "scale(1)",
                    }}
                  >
                    <CoinLogo symbol={moneda.symbol} market={moneda.market} size={28} fallbackIcon={moneda.icon} />
                  </div>

                  <div className="font-mono">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-bold text-white group-hover:text-[#00f5c4] transition-colors">
                        {moneda.symbol}
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#00f5c4]/10 text-[#00f5c4] border border-[#00f5c4]/30 uppercase">
                        {moneda.badge || "USDT"}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{moneda.nombre}</span>
                  </div>
                </div>

                <ChevronRight
                  className="w-4 h-4 transition-transform duration-200 text-slate-500 group-hover:text-[#00f5c4] group-hover:translate-x-1"
                />
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center font-mono">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0c1420] border border-[#16283d] text-slate-400 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] shadow-[0_0_6px_#00f5c4]" />
            <span>WOODY AGENT v3.0 • READY FOR REAL-TIME TELEMETRY</span>
          </div>
        </div>
      </div>
    </div>
  )
}
