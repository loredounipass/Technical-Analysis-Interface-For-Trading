"use client"

import React from "react"
import { FlaskConical, Sparkles, ChevronDown, History, Trash2, Minus, X, Cpu, SquarePen } from "lucide-react"

/**
 * Encabezado superior de la ventana Cyber-Quant:
 * Icono de matraz, título con metadata (v3.0, símbolo, timeframe),
 * selector de motor de IA y controles de ventana.
 */
export default function ChatHeader({
  symbol,
  interval,
  currentModelName,
  selectedModel,
  setSelectedModel,
  models,
  showModelSelect,
  setShowModelSelect,
  onOpenSidebar,
  onNewChat,
  onClearChat,
  onMinimize,
  onClose,
}) {
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
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold">
                v3.0
              </span>
              <span className="text-slate-600 font-mono">•</span>
              <span className="text-slate-400 font-mono text-xs">
                {symbol} @ {interval}
              </span>
            </div>

            {/* Subtítulo: Motor de IA y Estado */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <Sparkles className="w-3 h-3 text-cyan-400 flex-shrink-0" />
              <button
                onClick={() => setShowModelSelect(!showModelSelect)}
                className="text-cyan-400/90 hover:text-cyan-300 font-mono text-[11px] flex items-center gap-1 transition-colors text-left"
                title="Cambiar motor de IA"
              >
                <span>{currentModelName} / Low-Latency Neural Engine</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showModelSelect ? "rotate-180" : ""}`} />
              </button>
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

      {/* Menú Desplegable Selector de Modelos */}
      {showModelSelect && (
        <div className="px-6 py-2 bg-[#061016]/70 backdrop-blur-md border-b border-emerald-500/20 z-20 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <Cpu className="w-3 h-3 text-emerald-400" /> MODELO:
          </span>
          {models.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setSelectedModel(m.key)
                setShowModelSelect(false)
              }}
              className={`px-2.5 py-1 rounded text-[10px] font-mono transition-all ${
                selectedModel === m.key
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 font-bold"
                  : "bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
