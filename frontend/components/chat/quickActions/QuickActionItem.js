"use client"

import React from "react"
import { ChevronRight } from "lucide-react"

/**
 * Tarjeta-boton de una acción rápida (estrategia o análisis). Presenta el
 * preset declarativo (icono, título, descripción) y despacha onSelect con el
 * preset completo para que el orquestador arme el payload del comando.
 */
export default function QuickActionItem({ action, onSelect, disabled }) {
  const Icon = action.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(action)}
      disabled={disabled}
      className="group w-full text-left bg-[#09151d]/80 hover:bg-emerald-950/50 border border-slate-700/60 hover:border-emerald-500/40 rounded-xl px-3.5 py-3 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-start gap-3 shadow-sm"
    >
      <div className="w-9 h-9 rounded-lg bg-slate-900/70 border border-slate-700/60 flex items-center justify-center flex-shrink-0 group-hover:border-emerald-500/40 transition-colors">
        <Icon className={`w-4 h-4 ${action.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-mono font-bold text-slate-200 group-hover:text-white transition-colors">
          {action.title}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{action.desc}</div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-2.5" />
    </button>
  )
}
