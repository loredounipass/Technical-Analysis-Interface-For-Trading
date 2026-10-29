"use client"

import React from "react"
import { ArrowRight, Square } from "lucide-react"
import { MicIcon } from "../VoiceTTS"

/**
 * Barra de comandos inferior:
 * Símbolo de prompt verde '>', campo de entrada de texto, botón de micrófono/TTS,
 * botón de envío o detención de respuesta y pie de página de aviso legal.
 */
export default function ChatCommandBar({
  input,
  setInput,
  inputRef,
  onKeyDown,
  onSend,
  onStop,
  loading,
  isTyping,
  ttsEnabled,
  onToggleTTS,
  symbol,
  interval,
  selectedModel,
}) {
  const modelEngine = selectedModel?.toUpperCase().replace("NVIDIA-", "") || "NEMOTRON-3"

  return (
    <div className="px-5 py-3 sm:px-6 bg-[#050c10] border-t border-emerald-500/15 space-y-2 z-10">
      <div className="relative bg-[#040a0e] border border-emerald-500/30 focus-within:border-emerald-400/80 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-[0_0_20px_rgba(0,255,178,0.06)] transition-all">
        {/* Símbolo de prompt verde `>` */}
        <span className="text-emerald-400 font-mono font-bold text-base select-none">&gt;</span>

        {/* Campo de texto */}
        <textarea
          ref={inputRef}
          id="ai-chat-input"
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="type a command, indicator setup, or question..."
          disabled={loading}
          className="flex-1 bg-transparent text-emerald-100 placeholder-slate-500 font-mono text-xs sm:text-sm outline-none resize-none py-1 min-h-[22px] max-h-[75px] cyber-scrollbar"
          style={{ lineHeight: "1.4" }}
        />

        {/* Botón de Micrófono / TTS */}
        <button
          type="button"
          onClick={onToggleTTS}
          title={ttsEnabled ? "Voz activada (TTS ON)" : "Voz desactivada (TTS OFF)"}
          className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/30 rounded-lg transition-colors flex-shrink-0"
        >
          <MicIcon active={ttsEnabled} />
        </button>

        {/* Botón de Enviar o Detener */}
        {loading || isTyping ? (
          <button
            id="ai-chat-stop"
            onClick={onStop}
            title="Detener respuesta"
            className="w-8 h-8 rounded-lg bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_10px_rgba(244,63,94,0.3)]"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button
            id="ai-chat-send"
            onClick={() => onSend()}
            disabled={!input.trim() || loading}
            title="Enviar comando"
            className="w-8 h-8 rounded-lg bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-slate-950 font-bold flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_12px_rgba(52,211,153,0.35)] disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Pie de Página (Footer) */}
      <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 px-1 pt-1 tracking-wider uppercase">
        <span>
          WOODY AGENT — {symbol} @ {interval} • ENGINE: {modelEngine}
        </span>
        <span className="hidden sm:inline">
          NOT FINANCIAL ADVICE • FOR ALGORITHMIC RESEARCH ONLY
        </span>
      </div>
    </div>
  )
}
