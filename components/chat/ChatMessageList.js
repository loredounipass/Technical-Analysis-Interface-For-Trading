"use client"

import React, { useEffect, useMemo, useState, useRef } from "react"
import { User, CheckCircle2, Circle, Bot, ChevronDown, ChevronUp, Brain } from "lucide-react"
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
      `Ingestando telemetría de mercado y libro L2/L3 [${symbol}]...`,
      `Consultando memoria vectorial MCP y contexto institucional...`,
      `Computando matriz técnica cuantitativa (EMAs, RSI, MACD, ADX)...`,
      `Detectando Order Blocks, Fair Value Gaps (FVG) y Swings de liquidez...`,
      `Decodificando microestructura de Order Flow y Delta acumulativo...`,
      `Evaluando confluencia multi-temporalidad y fractales de precio...`,
      `Sintetizando inferencia neuronal de alta precisión y proyecciones de riesgo...`,
    ],
    [symbol]
  )

  const [phase, setPhase] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase((p) => (p + 1) % phases.length)
    }, 1600)
    return () => clearInterval(timer)
  }, [phases.length])

  return (
    <div className="flex items-center gap-2 min-w-0 text-xs sm:text-[13px] font-mono tracking-wide text-slate-300">
      <span className="text-[#00f5c4] font-bold select-none animate-pulse">›</span>
      <span className="truncate">{phases[phase]}</span>
    </div>
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
  messages,
  symbol,
  interval,
  isTyping,
  typingText,
  loading,
  streamingThought,
  isThinking,
  models = [],
  selectedModel,
}) {
  const intervalLabel = INTERVAL_LABELS[interval] || interval
  const thoughtBoxRef = useRef(null)
  const currentModelReasons = models.find((m) => m.key === selectedModel)?.reasoning ?? true

  // Auto-scroll SOLO de la caja interna de razonamiento. El scroll del
  // contenedor de la conversacion lo gobierna en exclusiva useChatSession
  // (un unico efecto), para que dos escritores no peleen y la vista tiemble.
  useEffect(() => {
    if (streamingThought && thoughtBoxRef.current) {
      thoughtBoxRef.current.scrollTop = thoughtBoxRef.current.scrollHeight
    }
  }, [streamingThought])

  return (
    <div
      ref={chatContainerRef}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-5 cyber-scrollbar relative z-10"
      style={{ background: "rgba(4, 9, 14, 0.25)" }}
    >
      {/* Lista de Mensajes: memoizada para que los mensajes ya completados no
          se re-rendericen ni re-analicen (renderMarkdown) en cada frame del
          streaming; solo se recalcula cuando cambia el historico o el simbolo. */}
      {useMemo(() => messages.map((msg, idx) => {
        if (msg.role === "user") {
          const meta = msg.meta
          /* Mensaje del Usuario */
          return (
            <div key={idx} className="w-full">
              <div className="flex flex-col items-end gap-1.5 my-2">
                <div className="relative group max-w-[95%] sm:max-w-[85%] md:max-w-[78%]">
                  {/* Punto verde de acento en la esquina superior derecha */}
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] z-10" />

                  {meta ? (
                    /* Tarjeta Estructurada Paso a Paso para Acciones Rápidas */
                    <div className="bg-[#07171d]/90 backdrop-blur-md border border-emerald-500/40 text-white p-4 sm:p-5 rounded-2xl rounded-tr-sm shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(16,185,129,0.12)]">
                      {/* Cabecera de la Acción */}
                      <div className="flex items-center justify-between gap-3 border-b border-emerald-500/20 pb-3 mb-3.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center flex-shrink-0 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                            <Bot className="w-4 h-4 text-cyan-300" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-[13px] font-mono font-bold text-white tracking-wide truncate">
                              {meta.title}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <span className="text-cyan-400 font-semibold">{symbol}</span>
                              <span className="text-slate-600">•</span>
                              <span>Timeframe {intervalLabel}</span>
                            </div>
                          </div>
                        </div>
                        <span className="text-[9px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 uppercase tracking-wider font-semibold whitespace-nowrap">
                          {meta.category || "COMANDO RÁPIDO"}
                        </span>
                      </div>

                      {/* Guía Paso a Paso */}
                      {meta.steps && meta.steps.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10.5px] font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#00f5c4]" />
                            <span>Estructura de Análisis Paso a Paso:</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {meta.steps.map((st, sIdx) => (
                              <div
                                key={sIdx}
                                className="bg-[#050f14]/80 border border-slate-700/60 rounded-xl p-2.5 hover:border-emerald-500/40 transition-colors"
                              >
                                <div className="text-[11px] font-mono font-bold text-cyan-300 flex items-center gap-1.5">
                                  <span className="text-[9.5px] font-semibold text-emerald-400/80">0{sIdx + 1} ·</span>
                                  <span>{st.title}</span>
                                </div>
                                <div className="text-[10px] font-sans text-slate-400 mt-1 leading-snug">
                                  {st.desc}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Mensaje de Usuario Estándar con Markdown y Espaciado Limpio */
                    <div className="bg-[#092222]/80 backdrop-blur-sm border border-emerald-500/40 text-white px-4 py-2.5 rounded-2xl rounded-tr-sm text-[13.5px] sm:text-sm font-sans shadow-lg leading-relaxed whitespace-pre-wrap break-words">
                      {renderMarkdown(msg.content, symbol, intervalLabel)}
                    </div>
                  )}
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
            {/* Indicador de Herramienta MCP de Memoria */}
            {msg.memoryAccessed && msg.memoryAccessed.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2">
                {msg.memoryAccessed.map((m, mIdx) => (
                  <div
                    key={mIdx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#00f5c4]/10 border border-[#00f5c4]/30 text-[#00f5c4] text-[10.5px] font-mono shadow-[0_0_8px_rgba(0,245,196,0.1)]"
                  >
                    <Brain className="w-3.5 h-3.5 text-[#00f5c4] animate-pulse" />
                    <span>
                      MCP Memory Tool: Accedió al historial ({m.found} resultado{m.found === 1 ? "" : "s"} para "{m.query}")
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Pensamiento / Razonamiento interno desplegable */}
            {msg.thought && (
              <details className="mb-2.5 group">
                <summary className="cursor-pointer select-none text-[11px] font-mono text-slate-400 hover:text-[#00f5c4] flex items-center gap-2 py-1 px-2.5 rounded-lg bg-[#071218]/60 border border-slate-800/60 hover:border-emerald-500/30 transition-all w-fit">
                  <span className="text-[#00f5c4] text-[9px] group-open:rotate-90 transition-transform">▶</span>
                  <span className="font-semibold tracking-wide">Razonamiento del modelo</span>
                  <span className="text-[10px] text-slate-500">({msg.thought.length} chars)</span>
                </summary>
                <div className="mt-2 p-3.5 rounded-xl bg-[#040a0f]/80 border border-slate-800/80 text-slate-300 font-mono text-[11px] leading-relaxed max-h-56 overflow-y-auto cyber-scrollbar whitespace-pre-wrap break-words">
                  {msg.thought}
                </div>
              </details>
            )}

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
      }), [messages, symbol, interval, intervalLabel])}

      {/* Efecto de Escritura en Vivo (texto plano) */}
      {isTyping && typingText && (
        <div className="w-full my-2">
          <div className="text-[13.5px] sm:text-[14.5px] font-sans leading-[1.68] text-slate-100 break-words tracking-[-0.01em]">
            {renderMarkdown(typingText, symbol, intervalLabel)}
            <span className="inline-block w-1.5 h-4 ml-1 bg-emerald-400 animate-pulse align-middle" />
          </div>
        </div>
      )}

      {/* Indicador de Carga / Razonamiento en vivo */}
      {loading && !isTyping && (
        <AgentPanel
          statusLabel={streamingThought ? "PENSAMIENTO EN VIVO" : currentModelReasons ? "RAZONANDO" : "ANALIZANDO"}
          statusPulse
          steps={LOADING_STEPS}
        >
          <div className="flex items-start gap-4">
            <div className="skynet-ring mt-0.5">
              <div className="ring ring-1" />
              <div className="ring ring-2" />
              <div className="ring ring-3" />
              <div className="core" />
              <div className="scan-line" />
            </div>
            <div className="flex-1 min-w-0">
              {streamingThought ? (
                <div
                  ref={thoughtBoxRef}
                  className="text-xs sm:text-[13px] font-mono leading-relaxed text-slate-200 max-h-48 sm:max-h-56 overflow-y-auto cyber-scrollbar pr-2 whitespace-pre-wrap break-words"
                >
                  <span className="text-[#00f5c4] font-bold mr-2 select-none animate-pulse">›</span>
                  <span>{streamingThought}</span>
                  <span className="inline-block w-1.5 h-3.5 ml-1 bg-[#00f5c4] animate-pulse align-middle" />
                </div>
              ) : (
                <ProcessingStatus symbol={symbol} />
              )}
            </div>
          </div>
        </AgentPanel>
      )}
    </div>
  )
}
