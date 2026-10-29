"use client"

import React from "react"
import { FlaskConical } from "lucide-react"

/**
 * Botón flotante que aparece cuando el chat está minimizado/cerrado,
 * permitiendo abrirlo con un clic.
 */
export default function ChatLauncherButton({ onOpen, symbol, interval }) {
  return (
    <button
      id="ai-chat-toggle"
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-50 group flex items-center gap-3 bg-[#081216] border border-emerald-500/40 rounded-full pl-3 pr-4 py-2.5 shadow-[0_0_25px_rgba(0,255,178,0.25)] hover:border-emerald-400 hover:scale-105 transition-all duration-300"
    >
      <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/50 flex items-center justify-center text-cyan-300">
        <FlaskConical className="w-4 h-4" />
      </div>
      <div className="flex flex-col text-left">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-bold text-white tracking-wider">WOODY AGENT</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <span className="text-[10px] font-mono text-emerald-400/80">
          {symbol} @ {interval}
        </span>
      </div>
    </button>
  )
}
