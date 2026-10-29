"use client"

import React from "react"
import { Sparkles, User } from "lucide-react"
import { renderMarkdown } from "./MarkdownRenderer"
import DiagnosticCard from "./DiagnosticCard"
import { INTERVAL_LABELS } from "./useChatSession"

function formatTime(timestamp) {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  return d.toTimeString().split(" ")[0]
}

/**
 * Contenedor de la conversación:
 * Renderiza los mensajes del usuario, las respuestas de Woody Agent con estilo
 * cyan/esmeralda, el panel de diagnóstico y los estados de streaming/espera.
 */
export default function ChatMessageList({
  chatContainerRef,
  onScroll,
  sessionTime,
  messages,
  symbol,
  interval,
  models,
  isTyping,
  typingText,
  loading,
}) {
  const intervalLabel = INTERVAL_LABELS[interval] || interval

  return (
    <div
      ref={chatContainerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-5 cyber-scrollbar relative z-10"
      style={{ background: "rgba(5, 11, 15, 0.92)" }}
    >
      {/* Píldora de Sesión Iniciada centrada */}
      <div className="flex justify-center my-1">
        <div className="px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-400 tracking-wider">
          SESIÓN INICIADA • {sessionTime} UTC • SERVIDOR SINCRONIZADO
        </div>
      </div>

      {/* Lista de Mensajes */}
      {messages.map((msg, idx) => (
        <div key={idx} className="w-full">
          {msg.role === "user" ? (
            /* Mensaje del Usuario */
            <div className="flex flex-col items-end gap-1.5 my-2">
              <div className="relative group max-w-[85%] sm:max-w-[75%]">
                {/* Punto verde de acento en la esquina superior derecha */}
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                <div className="bg-[#092222] border border-emerald-500/40 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-sm font-sans font-medium shadow-lg">
                  {msg.content}
                </div>
              </div>
              {/* Timestamp + TÚ + Avatar */}
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 pr-1">
                <span>{formatTime(msg.timestamp)}</span>
                <span>•</span>
                <span className="text-slate-300 font-bold">TÚ</span>
                <span>•</span>
                <div className="w-5 h-5 rounded-full border border-cyan-500/40 bg-cyan-950/40 flex items-center justify-center text-cyan-300">
                  <User className="w-3 h-3" />
                </div>
              </div>
            </div>
          ) : (
            /* Mensaje del Asistente (Woody Agent) */
            <div className="flex items-start gap-3 w-full my-2">
              {/* Avatar Squircle con Sparkles */}
              <div className="w-9 h-9 rounded-xl border border-cyan-500/40 bg-[#081820] flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.2)] flex-shrink-0 mt-1">
                <Sparkles className="w-4 h-4 text-cyan-300" />
              </div>

              {/* Tarjeta del Asistente con acento izquierdo cyan */}
              <div className="flex-1 bg-[#071218] border border-slate-800/90 border-l-2 border-l-cyan-400 rounded-r-2xl rounded-bl-2xl p-4 sm:p-5 shadow-xl space-y-3.5 text-slate-200">
                {/* Encabezado del Mensaje del Agente */}
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/60 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold tracking-wider text-white">
                      WOODY QUANT INTEL
                    </span>
                    <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                      AI QUANT AGENT - ACTIVE
                    </span>
                  </div>
                  <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-0.5 rounded font-semibold tracking-wider">
                    {models?.find((m) => m.key === msg.model)?.name?.split(" ")[0]?.toUpperCase() || "NEMOTRON-3"} | 94.6% ACC
                  </span>
                </div>

                {/* Contenido / Texto Markdown */}
                <div className="text-[13px] sm:text-sm font-sans leading-relaxed text-slate-200 break-words">
                  {renderMarkdown(msg.content, symbol, intervalLabel)}
                </div>

                {/* Diagnóstico Cuantitativo si viene adjunto */}
                {msg.diagnostic && (
                  <DiagnosticCard diagnostic={msg.diagnostic} symbol={symbol} interval={interval} />
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Efecto de Escritura en Vivo */}
      {isTyping && typingText && (
        <div className="flex items-start gap-3 w-full my-2">
          <div className="w-9 h-9 rounded-xl border border-cyan-500/40 bg-[#081820] flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.2)] flex-shrink-0 mt-1">
            <Sparkles className="w-4 h-4 text-cyan-300" />
          </div>
          <div className="flex-1 bg-[#071218] border border-slate-800/90 border-l-2 border-l-cyan-400 rounded-r-2xl rounded-bl-2xl p-4 sm:p-5 shadow-xl space-y-3 text-slate-200">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/60">
              <span className="text-xs font-mono font-bold tracking-wider text-white">
                WOODY QUANT INTEL
              </span>
              <span className="text-[9px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-0.5 rounded font-semibold animate-pulse">
                STREAMING NEURAL COMPUTE...
              </span>
            </div>
            <div className="text-[13px] sm:text-sm font-sans leading-relaxed text-slate-200 break-words">
              {renderMarkdown(typingText, symbol, intervalLabel)}
              <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-400 animate-pulse align-middle" />
            </div>
          </div>
        </div>
      )}

      {/* Indicador de Carga / Esperando respuesta */}
      {loading && !isTyping && (
        <div className="flex items-start gap-3 w-full my-2">
          <div className="w-9 h-9 rounded-xl border border-cyan-500/40 bg-[#081820] flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.2)] flex-shrink-0 mt-1">
            <Sparkles className="w-4 h-4 text-cyan-300 animate-spin" />
          </div>
          <div className="bg-[#071218] border border-slate-800/90 border-l-2 border-l-cyan-400 rounded-r-2xl rounded-bl-2xl px-4 py-3 shadow-xl flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <span className="text-xs font-mono text-slate-400">
              Procesando indicadores de {symbol} con motor cuántico...
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
