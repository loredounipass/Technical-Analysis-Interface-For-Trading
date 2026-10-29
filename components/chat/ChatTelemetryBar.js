"use client"

import React from "react"

/**
 * Barra de telemetría de mercado en vivo debajo del encabezado:
 * Muestra estado de conexión al libro de órdenes, dominancia compradora
 * y la píldora de tendencia técnica detectada.
 */
export default function ChatTelemetryBar({ buyerPercent, trendLabel }) {
  return (
    <div className="px-5 py-2 sm:px-6 bg-[#050c10]/60 backdrop-blur-sm border-b border-emerald-500/15 flex items-center justify-between text-xs font-mono z-10 flex-wrap gap-2">
      {/* Lado Izquierdo: Estado de vinculación al libro de órdenes y volumen */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
        <span className="text-emerald-400 font-semibold text-[10px] sm:text-[11px] tracking-wider uppercase">
          ESTADO: VINCULADO AL LIBRO DE ÓRDENES
        </span>
        <span className="text-slate-600 hidden sm:inline">|</span>
        <span className="text-slate-400 text-[10px] sm:text-[11px]">
          VOLUMEN COMPRADOR: <strong className="text-white font-bold">{buyerPercent}</strong>
        </span>
      </div>

      {/* Lado Derecho: Píldora de Tendencia de Mercado */}
      <div>
        <span className="border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 text-[10px] sm:text-[11px] font-semibold px-2.5 py-0.5 rounded tracking-wider uppercase">
          TENDENCIA: {trendLabel}
        </span>
      </div>
    </div>
  )
}
