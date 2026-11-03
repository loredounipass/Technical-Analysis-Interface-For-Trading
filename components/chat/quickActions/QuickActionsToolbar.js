"use client"

import React from "react"
import { Layers, Globe, Cpu, ChevronDown } from "lucide-react"

/**
 * Barra inferior del compositor de acciones: botón que abre la ventana de
 * acciones rápidas, toggle de búsqueda web (DuckDuckGo) y botón que abre el
 * selector de modelo. Presentación pura — recibe el estado y despacha
 * intenciones (onOpenActions / onToggleWebSearch / onOpenModels).
 */
export default function QuickActionsToolbar({
  actionCount,
  onOpenActions,
  webSearchEnabled = false,
  onToggleWebSearch,
  currentModelName = "Nemotron 3 Nano Omni",
  onOpenModels,
}) {
  return (
    <div className="px-2.5 py-2 sm:px-6 sm:py-2.5 bg-[#050d12]/40 backdrop-blur-sm border-t border-emerald-500/10 flex flex-nowrap items-center gap-1.5 sm:gap-3 z-10 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <button
        type="button"
        onClick={onOpenActions}
        aria-haspopup="dialog"
        className="flex-shrink-0 bg-[#09151d] hover:bg-emerald-950/60 border border-emerald-500/30 hover:border-emerald-400/60 text-xs font-mono text-slate-300 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-2 active:scale-95"
      >
        <Layers className="w-3.5 h-3.5 text-emerald-400" />
        <span className="sm:hidden">Acciones</span>
        <span className="hidden sm:inline">Estrategias y Análisis</span>
        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
          {actionCount}
        </span>
      </button>

      {/* Habilidad de busqueda web (DuckDuckGo) — toggle ON/OFF */}
      <button
        type="button"
        onClick={onToggleWebSearch}
        aria-pressed={webSearchEnabled}
        title="Buscar en la web (DuckDuckGo). Activar o desactivar esta habilidad"
        className={`flex-shrink-0 text-xs font-mono px-2.5 sm:px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-2 active:scale-95 border ${
          webSearchEnabled
            ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
            : "bg-[#09151d] border-slate-700/60 text-slate-400 hover:border-slate-500/60 hover:text-slate-200"
        }`}
      >
        <Globe className={`w-3.5 h-3.5 ${webSearchEnabled ? "text-emerald-300" : "text-slate-500"}`} />
        <span className="hidden sm:inline">Web Search</span>
        <span
          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
            webSearchEnabled
              ? "text-emerald-200 bg-emerald-500/20 border-emerald-400/50"
              : "text-slate-500 bg-slate-800/40 border-slate-700"
          }`}
        >
          {webSearchEnabled ? "ON" : "OFF"}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenModels}
        aria-haspopup="dialog"
        title={`Modelo actual: ${currentModelName}. Cambiar modelo`}
        className="ml-auto flex-shrink-0 bg-[#09151d] hover:bg-cyan-950/50 border border-cyan-500/30 hover:border-cyan-400/60 text-xs font-mono text-slate-300 hover:text-white px-2.5 sm:px-3 py-1.5 rounded-full transition-all cursor-pointer shadow-sm flex items-center gap-2 active:scale-95"
      >
        <Cpu className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
        <span className="text-slate-500 hidden sm:inline">Modelo:</span>
        <span className="max-w-[56px] sm:max-w-[120px] truncate">{currentModelName}</span>
        <ChevronDown className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
      </button>
    </div>
  )
}
