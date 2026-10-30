"use client"

import React from "react"

/**
 * Componente Tarjeta Cuantitativa (DIAGNÓSTICO CUANTITATIVO ACTUAL)
 * Muestra el panel técnico 2x2 con RSI, Soporte Clave, ADX Fuerza y MACD Cruce
 * con datos reales provenientes de los indicadores del activo y timeframe en pantalla.
 */
export default function DiagnosticCard({ diagnostic }) {
  if (!diagnostic) return null

  const rsiSub = diagnostic.rsiSubtitle || "▲ Alcista oculta"
  const isRsiBullish = rsiSub.includes("▲") || rsiSub.toLowerCase().includes("alcista")
  const isRsiBearish = rsiSub.includes("▼") || rsiSub.toLowerCase().includes("bajista")
  const rsiSubText = rsiSub.startsWith("▲") || rsiSub.startsWith("▼") || rsiSub.startsWith("●")
    ? rsiSub
    : `▲ ${rsiSub}`

  return (
    <div className="bg-[#050c10]/80 backdrop-blur-sm border border-slate-800/90 rounded-xl p-3.5 sm:p-4 space-y-3.5 my-3 shadow-inner">
      {/* Header del Diagnóstico */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
          <span className="text-[10px] sm:text-[11px] font-mono font-bold text-emerald-400 tracking-wider uppercase">
            DIAGNÓSTICO CUANTITATIVO ACTUAL
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded font-semibold tracking-wide">
          Auto-Scanner v3.2
        </span>
      </div>

      {/* Grid 2x2 de Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* RSI (14) */}
        <div className="bg-[#07131a]/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">RSI (14)</span>
            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.rsiBadge || "DIVERGENCIA"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-cyan-400 font-mono font-bold text-base sm:text-lg">{diagnostic.rsiValue}</span>
            <span className={`font-mono text-[11px] flex items-center gap-0.5 ${
              isRsiBullish ? "text-emerald-400" : isRsiBearish ? "text-rose-400" : "text-slate-400"
            }`}>
              {rsiSubText}
            </span>
          </div>
        </div>

        {/* SOPORTE CLAVE */}
        <div className="bg-[#07131a]/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">SOPORTE CLAVE</span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.supportBadge || "S1 DINÁMICO"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-white font-mono font-bold text-base sm:text-lg">{diagnostic.supportValue}</span>
            <span className="text-emerald-400 font-mono text-[11px]">{diagnostic.supportSubtitle || "Rechazo fuerte"}</span>
          </div>
        </div>

        {/* ADX FUERZA */}
        <div className="bg-[#07131a]/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">ADX FUERZA</span>
            <span className="text-[9px] font-mono text-amber-400 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.adxBadge || "DEFINIDA"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-amber-400 font-mono font-bold text-base sm:text-lg">{diagnostic.adxValue}</span>
            <span className="text-slate-300 font-mono text-[11px]">{diagnostic.adxSubtitle || "Tendencia alta"}</span>
          </div>
        </div>

        {/* MACD CRUCE */}
        <div className="bg-[#07131a]/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">MACD CRUCE</span>
            <span className="text-[9px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.macdBadge || "CONTRACCIÓN"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-rose-400 font-mono font-bold text-base sm:text-lg">{diagnostic.macdValue}</span>
            <span className="text-slate-400 font-mono text-[11px]">{diagnostic.macdSubtitle || "Histograma"}</span>
          </div>
        </div>
      </div>

      {/* Comentario de análisis sintético del scanner basado en indicadores */}
      {diagnostic.summary && (
        <p className="text-[12px] text-slate-300 font-sans leading-relaxed pt-1 border-t border-slate-800/60">
          {diagnostic.summary}
        </p>
      )}
    </div>
  )
}
