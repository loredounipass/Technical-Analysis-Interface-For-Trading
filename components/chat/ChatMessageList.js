"use client"

import React, { useEffect, useMemo, useState } from "react"
import { User, CheckCircle2, Circle } from "lucide-react"
import { renderMarkdown } from "./MarkdownRenderer"
import DiagnosticCard from "./DiagnosticCard"
import { INTERVAL_LABELS } from "./useChatSession"

function formatTime(timestamp) {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  return d.toTimeString().split(" ")[0]
}

const LOADING_STEPS = [
  { label: "DATOS MERCADO", done: true },
  { label: "INDICADORES", done: false },
  { label: "INFERENCIA", done: false },
  { label: "INFORME", done: false },
]

/**
 * Mensaje de estado profesional que rota mientras el agente procesa
 * la consulta: describe cada fase del análisis en curso.
 */
function ProcessingStatus({ symbol }) {
  const phases = useMemo(
    () => [
      `Analizando datos de mercado de ${symbol}...`,
      `Calculando indicadores técnicos (RSI, MACD, ADX)...`,
      `Evaluando estructura de precio y niveles clave...`,
      `Procesando flujo de órdenes del libro de compra/venta...`,
      `Sintetizando informe cuantitativo...`,
    ],
    [symbol]
  )

  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((p) => (p + 1) % phases.length)
    }, 1500)
    return () => clearInterval(timer)
  }, [phases.length])

  return (
    <span className="text-xs font-mono text-slate-400">
      {phases[phase]}
    </span>
  )
}

/**
 * Panel de estado del agente mientras se procesa la consulta:
 * muestra la fase del análisis en curso. Las respuestas finales se
 * renderizan como texto plano, sin tarjeta.
 */
function AgentPanel({ statusLabel, statusPulse, steps, children }) {
  return (
    <div className="w-full my-2">
      <div className="relative w-full overflow-hidden rounded-xl border border-cyan-500/25 bg-[#071218]/55 backdrop-blur-md shadow-xl">
        {/* Barra de título del panel de estado */}
        {(statusLabel || steps) && (
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-800/70 bg-[#081820]/70 flex-wrap">
            {statusLabel && (
              <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                {statusPulse && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                )}
                {statusLabel}
              </span>
            )}
          </div>
        )}

        {/* Pipeline de ejecución del agente */}
        {steps && (
          <div className="flex items-center gap-4 px-4 py-2 bg-emerald-950/10 border-b border-slate-800/50 text-[9px] font-mono tracking-wider overflow-x-auto cyber-scrollbar whitespace-nowrap">
            {steps.map((s, i) => (
              <span key={i} className="flex items-center gap-1.5 flex-shrink-0">
                {s.done ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Circle className="w-3 h-3 text-slate-600" />
                )}
                <span className={s.done ? "text-slate-300" : "text-slate-600"}>{s.label}</span>
              </span>
            ))}
          </div>
        )}

        {/* Contenido del panel */}
        <div className="px-4 sm:px-5 py-4 space-y-3.5">{children}</div>
      </div>
    </div>
  )
}

/**
 * Contenedor de la conversación:
 * Renderiza los mensajes del usuario, las respuestas de Woody Agent como
 * texto plano (sin tarjeta), y los estados de streaming/espera.
 */
export default function ChatMessageList({
  chatContainerRef,
  onScroll,
  sessionTime,
  messages,
  symbol,
  interval,
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
      style={{ background: "rgba(4, 9, 14, 0.25)" }}
    >
      {/* Píldora de Sesión Iniciada centrada */}
      <div className="flex justify-center my-1">
        <div className="px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[10px] font-mono text-slate-400 tracking-wider">
          SESIÓN INICIADA • {sessionTime} UTC • SERVIDOR SINCRONIZADO
        </div>
      </div>

      {/* Lista de Mensajes */}
      {messages.map((msg, idx) => {
        if (msg.role === "user") {
          /* Mensaje del Usuario */
          return (
            <div key={idx} className="w-full">
              <div className="flex flex-col items-end gap-1.5 my-2">
                <div className="relative group max-w-[85%] sm:max-w-[75%]">
                  {/* Punto verde de acento en la esquina superior derecha */}
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                  <div className="bg-[#092222]/80 backdrop-blur-sm border border-emerald-500/40 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-[13.5px] sm:text-sm font-sans font-medium shadow-lg leading-relaxed">
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
            </div>
          )
        }

        /* Respuesta del Agente: texto plano sin tarjeta */
        return (
          <div key={idx} className="w-full my-2">
            <div className="text-[13.5px] sm:text-[14.5px] font-sans leading-[1.68] text-slate-100 break-words tracking-[-0.01em]">
              {renderMarkdown(msg.content, symbol, intervalLabel)}
            </div>

            {/* Diagnóstico Cuantitativo con datos reales */}
            {msg.diagnostic && (
              <div className="mt-3.5">
                <DiagnosticCard diagnostic={msg.diagnostic} symbol={symbol} interval={interval} />
              </div>
            )}
          </div>
        )
      })}

      {/* Efecto de Escritura en Vivo (texto plano) */}
      {isTyping && typingText && (
        <div className="w-full my-2">
          <div className="text-[13.5px] sm:text-[14.5px] font-sans leading-[1.68] text-slate-100 break-words tracking-[-0.01em]">
            {renderMarkdown(typingText, symbol, intervalLabel)}
            <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-400 animate-pulse align-middle" />
          </div>
        </div>
      )}

      {/* Indicador de Carga / Esperando respuesta */}
      {loading && !isTyping && (
        <AgentPanel statusLabel="ANÁLISIS EN CURSO" statusPulse steps={LOADING_STEPS}>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
            <ProcessingStatus symbol={symbol} />
          </div>
        </AgentPanel>
      )}
    </div>
  )
}
