"use client"

import React from "react"
import { FlaskConical, History, Trash2, Minus, X, SquarePen } from "lucide-react"

/**
 * Encabezado superior de la ventana Cyber-Quant:
 * Icono de matraz, título con símbolo, timeframe y precio actual,
 * junto a los controles de ventana.
 */
export default function ChatHeader({
  symbol,
  interval,
  price,
  decimals = 2,
  onOpenSidebar,
  onNewChat,
  onClearChat,
  onMinimize,
  onClose,
}) {
  const numericPrice = Number(price)
  const formattedPrice = price !== null && price !== undefined && Number.isFinite(numericPrice)
    ? numericPrice.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : "—"

  return (
    <>
      <div className="relative px-5 py-3.5 sm:px-6 sm:py-4 bg-[#071116]/50 backdrop-blur-md border-b border-emerald-500/15 flex items-center justify-between z-10">
        {/* Lado Izquierdo: Icono + Título + Subtítulo */}
        <div className="flex items-center gap-3.5">
          {/* Avatar Cuadrado con Icono de Matraz / Quant */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.15)] flex-shrink-0">
            <FlaskConical className="w-5 h-5 text-cyan-300" />
          </div>

          <div className="flex flex-col">
            {/* Título Principal */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-white font-mono font-bold tracking-wider text-sm sm:text-base">
                WOODY AGENT
              </span>
              <span className="text-slate-600 font-mono">•</span>
              <span className="text-slate-400 font-mono text-xs">
                {symbol} @ {interval}
              </span>
              <span className="text-slate-600 font-mono">•</span>
              <span className="text-emerald-300 font-mono text-xs font-semibold">
                ${formattedPrice}
              </span>
            </div>

          </div>
        </div>

        {/* Lado Derecho: Controles de Ventana */}
        <div className="flex items-center gap-1">
          <button
            id="ai-chat-new"
            onClick={onNewChat}
            className="p-1.5 text-cyan-300 hover:text-cyan-200 rounded-lg hover:bg-cyan-950/40 border border-cyan-500/30 transition-colors"
            title="Nuevo chat"
          >
            <SquarePen className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenSidebar}
            className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-emerald-950/30 transition-colors"
            title="Historial de sesiones"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            id="ai-chat-clear"
            onClick={onClearChat}
            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/20 transition-colors"
            title="Limpiar conversación"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            id="ai-chat-minimize"
            onClick={onMinimize}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/40 transition-colors"
            title="Minimizar ventana"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            id="ai-chat-close"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-emerald-950/30 transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

    </>
  )
}
