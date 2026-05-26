"use client"

import { useState, useEffect } from "react"
import { TrendingUp, BarChart3, Activity, Zap, Shield, Globe, ChevronRight, Radio } from "lucide-react"

export default function CoinSelector({ monedas, onSelect }) {
  const [hoveredKey, setHoveredKey] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [time, setTime] = useState("")

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

  const coinColors = {
    "ETHUSDT": { from: "#627eea", to: "#3b5998", glow: "rgba(98, 126, 234, 0.3)" },
    "PEPEUSDT": { from: "#3cc68a", to: "#1a8f5c", glow: "rgba(60, 198, 138, 0.3)" },
    "SOLUSDT": { from: "#9945ff", to: "#14f195", glow: "rgba(153, 69, 255, 0.3)" },
    "BTCUSDT": { from: "#f7931a", to: "#e2820a", glow: "rgba(247, 147, 26, 0.3)" },
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center p-4"
      style={{ background: "#05070a" }}
    >
      {/* Animated grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)",
        }}
      />

      {/* Corner accents */}
      <div className="absolute top-0 left-0 w-32 h-32 opacity-20 pointer-events-none"
        style={{ borderTop: "1px solid #10b981", borderLeft: "1px solid #10b981" }}
      />
      <div className="absolute bottom-0 right-0 w-32 h-32 opacity-20 pointer-events-none"
        style={{ borderBottom: "1px solid #10b981", borderRight: "1px solid #10b981" }}
      />

      {/* Main content */}
      <div className={`relative z-10 w-full max-w-2xl transition-all duration-1000 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>

        {/* Top status bar */}
        <div className="flex items-center justify-between mb-8 px-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono text-emerald-400/60 uppercase tracking-widest">System Online</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">UTC {time}</span>
            <div className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-emerald-500/50" />
              <span className="text-[10px] font-mono text-gray-600">LIVE</span>
            </div>
          </div>
        </div>

        {/* Logo & Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-xl" />
              <div
                className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.1))",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                <Activity className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
          </div>

          <h1
            className="text-4xl md:text-5xl font-bold mb-3 tracking-tight"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #a3a3a3 50%, #10b981 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
            }}
          >
            TRADING TERMINAL
          </h1>

          <p className="text-gray-500 text-sm font-mono tracking-wider mb-2">
            Professional Technical Analysis Platform
          </p>

          <div className="flex items-center justify-center gap-6 mt-4">
            {[
              { icon: Zap, label: "Real-Time" },
              { icon: BarChart3, label: "Advanced TA" },
              { icon: Shield, label: "Secure" },
              { icon: Globe, label: "Multi-Market" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <Icon className="w-3 h-3 text-emerald-500/50" />
                <span className="text-[10px] font-mono text-gray-600 uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Section label */}
        <div className="flex items-center gap-3 mb-4 px-1">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
          <span className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.2em]">Select Trading Pair</span>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-800 to-transparent" />
        </div>

        {/* Coin cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Object.entries(monedas).map(([key, moneda], index) => {
            const colors = coinColors[moneda.symbol] || { from: "#10b981", to: "#059669", glow: "rgba(16,185,129,0.3)" }
            const isHovered = hoveredKey === key

            return (
              <button
                key={key}
                id={`coin-select-${moneda.symbol}`}
                onClick={() => onSelect(key)}
                onMouseEnter={() => setHoveredKey(key)}
                onMouseLeave={() => setHoveredKey(null)}
                className="group relative rounded-xl overflow-hidden transition-all duration-300"
                style={{
                  background: isHovered
                    ? `linear-gradient(135deg, rgba(17,24,39,0.95), rgba(17,24,39,0.8))`
                    : "rgba(10, 14, 20, 0.6)",
                  border: `1px solid ${isHovered ? `${colors.from}40` : "rgba(55, 65, 81, 0.3)"}`,
                  boxShadow: isHovered ? `0 8px 32px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.03)` : "none",
                  transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                }}
              >
                {/* Hover glow line at top */}
                <div
                  className="absolute top-0 left-0 right-0 h-px transition-opacity duration-300"
                  style={{
                    opacity: isHovered ? 1 : 0,
                    background: `linear-gradient(90deg, transparent, ${colors.from}, transparent)`,
                  }}
                />

                <div className="flex items-center gap-4 p-5">
                  {/* Icon */}
                  <div
                    className="relative w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300"
                    style={{
                      background: isHovered
                        ? `linear-gradient(135deg, ${colors.from}25, ${colors.to}15)`
                        : "rgba(55, 65, 81, 0.2)",
                      border: `1px solid ${isHovered ? `${colors.from}30` : "rgba(55, 65, 81, 0.2)"}`,
                    }}
                  >
                    <span className="text-3xl transition-transform duration-300" style={{ transform: isHovered ? "scale(1.1)" : "scale(1)" }}>
                      {moneda.icon}
                    </span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className="text-base font-bold transition-colors duration-300 font-mono"
                        style={{ color: isHovered ? colors.from : "#e5e7eb" }}
                      >
                        {moneda.symbol}
                      </span>
                      <div
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-all duration-300"
                        style={{
                          background: isHovered ? `${colors.from}15` : "rgba(55, 65, 81, 0.3)",
                          color: isHovered ? colors.from : "#6b7280",
                          border: `1px solid ${isHovered ? `${colors.from}20` : "transparent"}`,
                        }}
                      >
                        USDT
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{moneda.nombre}</span>
                  </div>

                  {/* Arrow */}
                  <ChevronRight
                    className="w-5 h-5 transition-all duration-300 flex-shrink-0"
                    style={{
                      color: isHovered ? colors.from : "#374151",
                      transform: isHovered ? "translateX(4px)" : "translateX(0)",
                    }}
                  />
                </div>
              </button>
            )
          })}
        </div>

        {/* Bottom info */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: "rgba(16, 185, 129, 0.04)",
              border: "1px solid rgba(16, 185, 129, 0.08)",
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-gray-500 tracking-wider">
              Binance • TradingView • 15m Interval • AI Agent Ready
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-6">
          <span className="text-[9px] font-mono text-gray-700 tracking-wider">POWERED BY NVIDIA AI</span>
          <div className="w-px h-3 bg-gray-800" />
          <span className="text-[9px] font-mono text-gray-700 tracking-wider">v2.0</span>
        </div>
      </div>
    </div>
  )
}
