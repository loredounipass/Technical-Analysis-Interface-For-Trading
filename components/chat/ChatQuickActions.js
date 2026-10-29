"use client"

import React from "react"
import { Sparkles, BarChart2, Scale, Zap, FileText } from "lucide-react"

/**
 * Barra horizontal con píldoras de acciones rápidas para ejecutar análisis
 * comunes de forma instantánea con un solo clic.
 */
export default function ChatQuickActions({ symbol, interval, onSendQuickAction, disabled }) {
  return (
    <div className="px-5 py-2.5 sm:px-6 bg-[#050d12] border-t border-emerald-500/10 flex items-center gap-3 overflow-x-auto cyber-scrollbar z-10">
      <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 font-semibold flex-shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
        <span>Acciones Rápidas:</span>
      </div>

      <div className="flex items-center gap-2 flex-nowrap">
        <button
          onClick={() => onSendQuickAction(`Analizar soporte clave y niveles de reacción de ${symbol}`)}
          disabled={disabled}
          className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
          <span>Analizar soporte clave</span>
        </button>

        <button
          onClick={() => onSendQuickAction(`Calcular ratio riesgo/beneficio 1:3 para ${symbol} en ${interval}`)}
          disabled={disabled}
          className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          <Scale className="w-3.5 h-3.5 text-amber-400" />
          <span>Calcular riesgo/beneficio 1:3</span>
        </button>

        <button
          onClick={() => onSendQuickAction(`Estrategia scalping con cruce MACD y RSI en ${symbol}`)}
          disabled={disabled}
          className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          <Zap className="w-3.5 h-3.5 text-emerald-400" />
          <span>Estrategia scalping MACD</span>
        </button>

        <button
          onClick={() => onSendQuickAction(`Resumen técnico cuantitativo completo de ${symbol}`)}
          disabled={disabled}
          className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
        >
          <FileText className="w-3.5 h-3.5 text-rose-400" />
          <span>Resumen técnico completo</span>
        </button>
      </div>
    </div>
  )
}
