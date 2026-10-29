"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import {
  Send,
  User,
  Trash2,
  ChevronDown,
  Cpu,
  Sparkles,
  MessageSquare,
  X,
  Plus,
  History,
  Terminal,
  Square,
  Minus,
  ArrowRight,
  FlaskConical,
  BarChart2,
  Scale,
  Zap,
  FileText,
} from "lucide-react"
import { useVoiceTTS, MicIcon } from "./VoiceTTS"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api"

// Formato de tiempo HH:MM:SS
function formatTime(timestamp) {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  return d.toTimeString().split(" ")[0]
}

// Intervalos legibles
const INTERVAL_LABELS = {
  "1m": "1 minuto",
  "5m": "5 minutos",
  "15m": "15 minutos",
  "1h": "1 hora",
  "4h": "4 horas",
  "1d": "1 día",
}

// Renderizado de Markdown enriquecido para el tema Cyber-Quant
function renderMarkdown(text, currentSymbol, currentInterval) {
  if (!text) return null
  const lines = text.split("\n")
  const elements = []
  let listItems = []
  let tableRows = []
  let inTable = false
  let inCodeBlock = false
  let codeBlockLines = []
  let codeBlockLang = ""

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 ml-5 space-y-1.5 list-disc marker:text-emerald-400 text-slate-300 text-[13px]">
          {listItems}
        </ul>
      )
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto border border-emerald-500/20 rounded-lg bg-[#04090d]">
          <table className="w-full text-left border-collapse text-[12px] font-mono">
            <tbody>
              {tableRows.map((row, rIdx) => {
                const isHeader = rIdx === 0
                const isSeparator = row.every((cell) => cell.includes("---"))
                if (isSeparator) return null
                return (
                  <tr
                    key={rIdx}
                    className={
                      isHeader
                        ? "bg-emerald-950/40 border-b border-emerald-500/30 text-emerald-300 font-semibold"
                        : "border-b border-slate-800/60 hover:bg-emerald-950/20"
                    }
                  >
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={`px-3 py-2 ${isHeader ? "text-emerald-300 font-bold" : "text-slate-300"}`}>
                        {formatInline(cell.trim(), `${rIdx}-${cIdx}`)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )
      tableRows = []
      inTable = false
    }
  }

  const formatInline = (line, keyPrefix) => {
    let result = []
    let keyIdx = 0

    // Inline code (`text`)
    const partsCode = line.split(/(`.*?`)/)
    partsCode.forEach((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
        result.push(
          <code
            key={`${keyPrefix}-c-${keyIdx++}`}
            className="px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 font-mono text-[11px]"
          >
            {part.slice(1, -1)}
          </code>
        )
      } else {
        // Bold (**text**)
        const partsBold = part.split(/(\*\*.*?\*\*)/)
        partsBold.forEach((bPart) => {
          if (bPart.startsWith("**") && bPart.endsWith("**") && bPart.length >= 4) {
            const rawBold = bPart.slice(2, -2)
            // Si coincide con símbolo o timeframe, resaltarlo con estilo de píldora
            if (rawBold === currentSymbol || rawBold.includes("USDT") || rawBold.includes("/")) {
              result.push(
                <strong key={`${keyPrefix}-b-${keyIdx++}`} className="text-white font-bold tracking-wide">
                  {rawBold}
                </strong>
              )
            } else if (rawBold.toLowerCase().includes("minuto") || rawBold.toLowerCase().includes("hora") || rawBold === currentInterval) {
              result.push(
                <span
                  key={`${keyPrefix}-badge-${keyIdx++}`}
                  className="inline-flex mx-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono text-[11px] font-semibold"
                >
                  {rawBold}
                </span>
              )
            } else {
              result.push(
                <strong key={`${keyPrefix}-b-${keyIdx++}`} className="font-semibold text-emerald-300">
                  {rawBold}
                </strong>
              )
            }
          } else {
            // Italics (*text*)
            const partsItalic = bPart.split(/(\*.*?\*)/)
            partsItalic.forEach((iPart) => {
              if (iPart.startsWith("*") && iPart.endsWith("*") && iPart.length >= 2) {
                result.push(
                  <em key={`${keyPrefix}-i-${keyIdx++}`} className="italic text-slate-400">
                    {iPart.slice(1, -1)}
                  </em>
                )
              } else if (iPart) {
                result.push(iPart)
              }
            })
          }
        })
      }
    })
    return result.length > 0 ? result : line
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()

    // Code blocks
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <div key={`code-${i}`} className="my-3 rounded-lg bg-[#04080c] border border-emerald-500/25 overflow-hidden">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-emerald-950/40 border-b border-emerald-500/20 text-[10px] text-emerald-400 font-mono uppercase tracking-wider">
                {codeBlockLang}
              </div>
            )}
            <pre className="p-3 overflow-x-auto text-[12px] text-emerald-300 font-mono leading-relaxed">
              <code>{codeBlockLines.join("\n")}</code>
            </pre>
          </div>
        )
        inCodeBlock = false
        codeBlockLines = []
        codeBlockLang = ""
      } else {
        flushList()
        flushTable()
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
      }
      return
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      return
    }

    // Table parsing
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList()
      inTable = true
      const cells = trimmed.split("|").slice(1, -1)
      tableRows.push(cells)
      return
    } else if (inTable) {
      flushTable()
    }

    if (trimmed.startsWith("### ")) {
      flushList()
      elements.push(
        <h4 key={i} className="font-semibold text-emerald-300 text-[14px] mt-4 mb-2 flex items-center gap-2">
          {formatInline(trimmed.slice(4), i)}
        </h4>
      )
    } else if (trimmed.startsWith("## ")) {
      flushList()
      elements.push(
        <h3 key={i} className="font-bold text-white text-[16px] mt-5 mb-2.5 border-b border-emerald-500/20 pb-1.5 tracking-wide">
          {formatInline(trimmed.slice(3), i)}
        </h3>
      )
    } else if (trimmed.startsWith("# ")) {
      flushList()
      elements.push(
        <h2 key={i} className="font-bold text-white text-[18px] mt-6 mb-3 uppercase tracking-wider font-mono">
          {formatInline(trimmed.slice(2), i)}
        </h2>
      )
    } else if (/^[-*•]\s/.test(trimmed)) {
      listItems.push(
        <li key={i} className="text-slate-300">
          {formatInline(trimmed.replace(/^[-*•]\s/, ""), i)}
        </li>
      )
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushList()
      elements.push(
        <div key={i} className="my-1.5 flex gap-2 text-[13px]">
          <span className="text-emerald-400 font-mono font-bold flex-shrink-0 mt-0.5">{trimmed.match(/^\d+\./)[0]}</span>
          <span className="text-slate-300">{formatInline(trimmed.replace(/^\d+\.\s/, ""), i)}</span>
        </div>
      )
    } else if (trimmed.startsWith("> ")) {
      flushList()
      elements.push(
        <blockquote key={i} className="pl-3 border-l-2 border-emerald-400 my-2 text-slate-300 italic bg-emerald-950/20 py-1.5 pr-2 rounded-r text-[13px]">
          {formatInline(trimmed.slice(2), i)}
        </blockquote>
      )
    } else if (trimmed === "") {
      flushList()
      elements.push(<div key={i} className="h-2" />)
    } else {
      flushList()
      elements.push(
        <p key={i} className="text-slate-200 my-1.5 leading-relaxed text-[13px]">
          {formatInline(trimmed, i)}
        </p>
      )
    }
  })

  if (inCodeBlock) {
    elements.push(
      <div key="code-unclosed" className="my-3 rounded-lg bg-[#04080c] border border-emerald-500/25 overflow-hidden">
        <pre className="p-3 overflow-x-auto text-[12px] text-emerald-300 font-mono leading-relaxed">
          <code>{codeBlockLines.join("\n")}</code>
        </pre>
      </div>
    )
  }

  flushList()
  flushTable()
  return elements
}

// Componente Tarjeta Cuantitativa (DIAGNÓSTICO CUANTITATIVO ACTUAL)
function DiagnosticCard({ diagnostic, symbol, interval }) {
  if (!diagnostic) return null

  return (
    <div className="bg-[#050c10] border border-slate-800/90 rounded-xl p-3.5 sm:p-4 space-y-3.5 my-3 shadow-inner">
      {/* Header del Diagnóstico */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-800/60">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
          <span className="text-[10px] sm:text-[11px] font-mono font-bold text-emerald-400 tracking-wider uppercase">
            DIAGNÓSTICO CUANTITATIVO ACTUAL
          </span>
        </div>
        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 rounded font-semibold tracking-wide">
          Auto-Scanner v3.2
        </span>
      </div>

      {/* Grid 2x2 de Indicadores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* RSI (14) */}
        <div className="bg-[#07131a] border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">RSI (14)</span>
            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.rsiBadge || "DIVERGENCIA"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-cyan-400 font-mono font-bold text-base sm:text-lg">{diagnostic.rsiValue}</span>
            <span className="text-emerald-400 font-mono text-[11px] flex items-center gap-0.5">
              ▲ {diagnostic.rsiSubtitle || "Alcista oculta"}
            </span>
          </div>
        </div>

        {/* SOPORTE CLAVE */}
        <div className="bg-[#07131a] border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">SOPORTE CLAVE</span>
            <span className="text-[9px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.supportBadge || "S1 DINÁMICO"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-white font-mono font-bold text-base sm:text-lg">{diagnostic.supportValue}</span>
            <span className="text-emerald-400 font-mono text-[11px]">{diagnostic.supportSubtitle || "Rechazo fuerte"}</span>
          </div>
        </div>

        {/* ADX FUERZA */}
        <div className="bg-[#07131a] border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">ADX FUERZA</span>
            <span className="text-[9px] font-mono text-amber-400 bg-amber-950/60 border border-amber-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.adxBadge || "DEFINIDA"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-amber-400 font-mono font-bold text-base sm:text-lg">{diagnostic.adxValue}</span>
            <span className="text-slate-300 font-mono text-[11px]">{diagnostic.adxSubtitle || "Tendencia alta"}</span>
          </div>
        </div>

        {/* MACD CRUCE */}
        <div className="bg-[#07131a] border border-slate-800/80 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 tracking-wider">MACD CRUCE</span>
            <span className="text-[9px] font-mono text-rose-400 bg-rose-950/60 border border-rose-500/30 px-1.5 py-0.5 rounded font-semibold">
              {diagnostic.macdBadge || "CONTRACCIÓN"}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-rose-400 font-mono font-bold text-base sm:text-lg">{diagnostic.macdValue}</span>
            <span className="text-slate-400 font-mono text-[11px]">{diagnostic.macdSubtitle || "Histograma"}</span>
          </div>
        </div>
      </div>

      {/* Comentario de análisis sintético del scanner */}
      {diagnostic.summary && (
        <p className="text-[12px] text-slate-300 font-sans leading-relaxed pt-1 border-t border-slate-800/60">
          {diagnostic.summary}
        </p>
      )}
    </div>
  )
}

export default function AiChat({ symbol, datos, interval = "15m", market = "crypto", onAnalysisChange }) {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("trading_terminal_model") || "nvidia-nemotron"
    }
    return "nvidia-nemotron"
  })
  const [isOpen, setIsOpen] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showModelSelect, setShowModelSelect] = useState(false)
  const [typingText, setTypingText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const typingRef = useRef(null)
  const abortRef = useRef(null)
  const activeModelRef = useRef(null)
  const inputRef = useRef(null)
  const chatContainerRef = useRef(null)
  const isAutoScrollPausedRef = useRef(false)
  const { ttsEnabled, toggle: toggleTTS, playResponse } = useVoiceTTS()

  // Timestamp de inicio de sesión UTC
  const [sessionTime, setSessionTime] = useState("18:12:02")

  useEffect(() => {
    const now = new Date()
    setSessionTime(now.toTimeString().split(" ")[0])
  }, [])

  // Calcular métricas de telemetría de mercado a partir de `datos`
  const marketTelemetry = useMemo(() => {
    const buy = datos?.buySignals || 0
    const sell = datos?.sellSignals || 0
    const neutral = datos?.neutralSignals || 0
    const total = buy + sell + neutral

    let buyerPercent = "52.8%"
    if (total > 0) {
      buyerPercent = ((buy / total) * 100).toFixed(1) + "%"
    }

    let trendLabel = "ALCISTA LEVE"
    if (buy > sell + 2) {
      trendLabel = "ALCISTA FUERTE"
    } else if (buy > sell) {
      trendLabel = "ALCISTA LEVE"
    } else if (sell > buy + 2) {
      trendLabel = "BAJISTA FUERTE"
    } else if (sell > buy) {
      trendLabel = "BAJISTA LEVE"
    } else {
      trendLabel = "RANGO NEUTRAL"
    }

    // Diagnóstico cuantitativo actual
    const rsiVal = datos?.rsi != null ? Number(datos.rsi).toFixed(2) : "32.25"
    const s1Val =
      datos?.s1 != null
        ? "$" + Number(datos.s1).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : datos?.precio != null
        ? "$" + (Number(datos.precio) * 0.985).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "$2,764.50"

    const adxVal = datos?.adx != null ? Number(datos.adx).toFixed(2) : "39.23"
    const macdVal = datos?.macdHistogram != null ? Number(datos.macdHistogram).toFixed(2) : "-18.07"

    return {
      buyerPercent,
      trendLabel,
      diagnostic: {
        rsiValue: rsiVal,
        rsiBadge: Number(rsiVal) < 35 ? "DIVERGENCIA" : Number(rsiVal) > 65 ? "SOBRECOMPRA" : "EQUILIBRIO",
        rsiSubtitle: Number(rsiVal) < 40 ? "Alcista oculta" : "Neutral",
        supportValue: s1Val,
        supportBadge: "S1 DINÁMICO",
        supportSubtitle: "Rechazo fuerte",
        adxValue: adxVal,
        adxBadge: Number(adxVal) > 25 ? "DEFINIDA" : "CONSOLIDACIÓN",
        adxSubtitle: Number(adxVal) > 25 ? "Tendencia alta" : "Lateral",
        macdValue: macdVal,
        macdBadge: Number(macdVal) < 0 ? "CONTRACCIÓN" : "EXPANSIÓN",
        macdSubtitle: "Histograma",
        summary:
          "Actualmente observo compresión de volatilidad con presión compradora absorbiendo ventas cerca de soporte clave.",
      },
    }
  }, [datos])

  const handleScroll = () => {
    const container = chatContainerRef.current
    if (!container) return
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120
    isAutoScrollPausedRef.current = !isNearBottom
  }

  // Modelos disponibles
  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch(`${API_BASE_URL}/models`)
        if (res.ok) {
          const data = await res.json()
          setModels(data)
          if (!data.some((m) => m.key === selectedModel)) {
            setSelectedModel("nvidia-nemotron")
          }
        }
      } catch (e) {
        setModels([
          { key: "nvidia-nemotron", name: "Nemotron 3 Nano Omni", provider: "NVIDIA", free: true },
          { key: "nvidia-llama", name: "Llama 3.1 8B", provider: "Meta", free: true },
          { key: "nvidia-llama-70b", name: "Llama 3.3 70B", provider: "Meta", free: true },
          { key: "nvidia-nemotron-super", name: "Nemotron 3 Super 120B", provider: "NVIDIA", free: true },
        ])
      }
    }
    fetchModels()
  }, [])

  const scrollChatToBottom = (behavior = "smooth") => {
    const container = chatContainerRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }

  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return
    if (!isAutoScrollPausedRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: "auto" })
    }
  }, [messages, typingText])

  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current)
    }
  }, [])

  useEffect(() => {
    if (isOpen && !isSidebarOpen) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [isOpen, activeSessionId, isSidebarOpen])

  // Inicialización de sesiones desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem("trading_terminal_sessions")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed)
          setActiveSessionId(parsed[0].id)
          setMessages(parsed[0].messages || [])
          return
        }
      } catch (e) {
        // Fallback
      }
    }
    createNewSession()
  }, [])

  useEffect(() => {
    localStorage.setItem("trading_terminal_model", selectedModel)
  }, [selectedModel])

  useEffect(() => {
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, messages: messages } : s))
      )
    }
  }, [messages])

  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem("trading_terminal_sessions", JSON.stringify(sessions))
    }
  }, [sessions])

  useEffect(() => {
    onAnalysisChange?.(loading || isTyping)
  }, [loading, isTyping, onAnalysisChange])

  // Crear nueva sesión con el saludo inicial idéntico al diseño de la imagen
  const createNewSession = () => {
    const newId = Date.now().toString()
    const intervalLabel = INTERVAL_LABELS[interval] || interval

    // Mensaje de bienvenida inicial que replica el diseño exacto de la UI
    const initialWelcomeMessage = {
      role: "assistant",
      content: `¡Hola! ¿En qué puedo asistirte con el análisis del mercado de **${symbol}** en el timeframe de **${intervalLabel}**?`,
      timestamp: Date.now(),
      model: selectedModel,
      diagnostic: marketTelemetry.diagnostic,
    }

    const newSession = {
      id: newId,
      title: `${symbol} Analysis`,
      messages: [initialWelcomeMessage],
      symbol: symbol,
      timestamp: Date.now(),
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(newId)
    setMessages([initialWelcomeMessage])
    setIsSidebarOpen(false)
  }

  const switchSession = (id) => {
    const session = sessions.find((s) => s.id === id)
    if (session) {
      setActiveSessionId(id)
      setMessages(session.messages || [])
      setIsSidebarOpen(false)
    }
  }

  const deleteSession = (e, id) => {
    e.stopPropagation()
    const filtered = sessions.filter((s) => s.id !== id)
    setSessions(filtered)
    if (activeSessionId === id) {
      if (filtered.length > 0) {
        switchSession(filtered[0].id)
      } else {
        createNewSession()
      }
    }
  }

  const startTypingEffect = (fullText, model) => {
    activeModelRef.current = model
    setIsTyping(true)
    setTypingText("")
    const words = fullText.split(/( )/)
    let idx = 0
    const speed = 16

    typingRef.current = setInterval(() => {
      const chunk = words.slice(0, idx + 2).join("")
      idx += 2
      setTypingText(chunk)

      if (idx >= words.length) {
        clearInterval(typingRef.current)
        typingRef.current = null
        setIsTyping(false)
        setTypingText("")
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: fullText, timestamp: Date.now(), model },
        ])
        playResponse(fullText)
      }
    }, speed)
  }

  const sendMessage = async (customPrompt) => {
    const textToSend = typeof customPrompt === "string" ? customPrompt : input
    const trimmed = textToSend.trim()
    if (!trimmed || loading) return

    const userMsg = { role: "user", content: trimmed, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)
    isAutoScrollPausedRef.current = false
    setTimeout(() => scrollChatToBottom(), 50)

    const otherSessions = sessions.filter((s) => s.id !== activeSessionId)
    const globalContext = otherSessions
      .map((s) => {
        const summary = s.messages.length > 0 ? s.messages[0].content.slice(0, 50) + "..." : "Empty"
        return `Session [${s.symbol}]: ${summary}`
      })
      .join(" | ")

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: trimmed,
          model: selectedModel,
          symbol: symbol,
          interval: interval,
          market: market,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          global_context: globalContext,
          temperature: 0.3,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errMsg = data.error || `Error ${res.status}`
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `! ERROR: ${errMsg}`, timestamp: Date.now(), isError: true },
        ])
      } else {
        startTypingEffect(data.response, data.model)
      }
    } catch (err) {
      if (err?.name === "AbortError") return
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "! ERROR DE CONEXIÓN — Servicio AI offline o no disponible.",
          timestamp: Date.now(),
          isError: true,
        },
      ])
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
    }
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    abortRef.current = null
    if (typingRef.current) {
      clearInterval(typingRef.current)
      typingRef.current = null
    }
    const partial = typingText.trim()
    setIsTyping(false)
    setTypingText("")
    setLoading(false)
    if (partial) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: partial,
          timestamp: Date.now(),
          model: activeModelRef.current,
          interrupted: true,
        },
      ])
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    createNewSession()
  }

  const currentModelName =
    models.find((m) => m.key === selectedModel)?.name || "Nemotron 3 Nano Omni"

  // Botón flotante para abrir el terminal si está minimizado o cerrado
  if (!isOpen) {
    return (
      <button
        id="ai-chat-toggle"
        onClick={() => setIsOpen(true)}
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
      {/* Contenedor Principal de la Ventana del Chat */}
      <div
        className="relative flex flex-col w-full max-w-[940px] h-[92vh] sm:h-[86vh] max-h-[820px] rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(0,255,178,0.1)] border border-emerald-500/30 font-sans"
        style={{
          background: "linear-gradient(180deg, #09131a 0%, #060c10 100%)",
        }}
      >
        {/* Scanline sutil para ambiente cyber */}
        <div
          className="absolute inset-0 pointer-events-none z-40 opacity-[0.02]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.6) 2px, rgba(0, 0, 0, 0.6) 4px)",
          }}
        />

        {/* Sidebar de Sesiones Anteriores (Accesible desde menú) */}
        {isSidebarOpen && (
          <div
            className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm transition-all"
            onClick={() => setIsSidebarOpen(false)}
          >
            <div
              className="w-72 h-full bg-[#070e13] border-r border-emerald-500/30 flex flex-col p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-2">
                  <History className="w-4 h-4" /> SESIONES DE ANÁLISIS
                </span>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={createNewSession}
                className="w-full py-2 px-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-center gap-2 hover:bg-emerald-900/50 transition-colors"
              >
                <Plus className="w-4 h-4" /> Nueva Consulta
              </button>
              <div className="flex-1 overflow-y-auto space-y-1.5 cyber-scrollbar">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => switchSession(s.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-xs font-mono transition-colors ${
                      activeSessionId === s.id
                        ? "bg-emerald-950/50 border border-emerald-500/40 text-emerald-200"
                        : "hover:bg-slate-900/60 text-slate-400 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span className="truncate">{s.title || "Análisis"}</span>
                    </div>
                    <button
                      onClick={(e) => deleteSession(e, s.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 1. Header de la Ventana */}
        <div className="relative px-5 py-3.5 sm:px-6 sm:py-4 bg-[#071116] border-b border-emerald-500/15 flex items-center justify-between z-10">
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
              onClick={() => setIsSidebarOpen(true)}
              className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-emerald-950/30 transition-colors"
              title="Historial de sesiones"
            >
              <History className="w-4 h-4" />
            </button>
            <button
              id="ai-chat-clear"
              onClick={clearChat}
              className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-950/20 transition-colors"
              title="Limpiar conversación"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              id="ai-chat-minimize"
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/40 transition-colors"
              title="Minimizar ventana"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              id="ai-chat-close"
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-emerald-950/30 transition-colors"
              title="Cerrar ventana"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Menú Desplegable Selector de Modelos */}
        {showModelSelect && (
          <div className="px-6 py-2 bg-[#061016] border-b border-emerald-500/20 z-20 flex items-center gap-2 flex-wrap">
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

        {/* 2. Sub-header: Barra de Telemetría de Mercado */}
        <div className="px-5 py-2 sm:px-6 bg-[#050c10] border-b border-emerald-500/15 flex items-center justify-between text-xs font-mono z-10 flex-wrap gap-2">
          {/* Lado Izquierdo: Estado de vinculación al libro de órdenes y volumen */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]" />
            <span className="text-emerald-400 font-semibold text-[10px] sm:text-[11px] tracking-wider uppercase">
              ESTADO: VINCULADO AL LIBRO DE ÓRDENES
            </span>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <span className="text-slate-400 text-[10px] sm:text-[11px]">
              VOLUMEN COMPRADOR:{" "}
              <strong className="text-white font-bold">{marketTelemetry.buyerPercent}</strong>
            </span>
          </div>

          {/* Lado Derecho: Píldora de Tendencia de Mercado */}
          <div>
            <span className="border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 text-[10px] sm:text-[11px] font-semibold px-2.5 py-0.5 rounded tracking-wider uppercase">
              TENDENCIA: {marketTelemetry.trendLabel}
            </span>
          </div>
        </div>

        {/* 3. Área de Mensajes del Chat */}
        <div
          ref={chatContainerRef}
          onScroll={handleScroll}
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
                /* Mensaje del Usuario (Alineado a la derecha con punto verde y avatar de usuario) */
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
                /* Mensaje del Asistente (Alineado a la izquierda con avatar cyan y tarjeta bordeada en cyan) */
                <div className="flex items-start gap-3 w-full my-2">
                  {/* Avatar Hexagonal/Cuadrado con Sparkles */}
                  <div className="w-9 h-9 rounded-xl border border-cyan-500/40 bg-[#081820] flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.2)] flex-shrink-0 mt-1">
                    <Sparkles className="w-4 h-4 text-cyan-300" />
                  </div>

                  {/* Tarjeta del Asistente */}
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
                        {models.find((m) => m.key === msg.model)?.name?.split(" ")[0]?.toUpperCase() || "NEMOTRON-3"} | 94.6% ACC
                      </span>
                    </div>

                    {/* Contenido / Texto Markdown */}
                    <div className="text-[13px] sm:text-sm font-sans leading-relaxed text-slate-200 break-words">
                      {renderMarkdown(msg.content, symbol, INTERVAL_LABELS[interval] || interval)}
                    </div>

                    {/* Si el mensaje tiene diagnóstico cuantitativo adjunto, mostrarlo aquí */}
                    {msg.diagnostic && (
                      <DiagnosticCard
                        diagnostic={msg.diagnostic}
                        symbol={symbol}
                        interval={interval}
                      />
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
                  {renderMarkdown(typingText, symbol, INTERVAL_LABELS[interval] || interval)}
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

        {/* 4. Barra de Acciones Rápidas */}
        <div className="px-5 py-2.5 sm:px-6 bg-[#050d12] border-t border-emerald-500/10 flex items-center gap-3 overflow-x-auto cyber-scrollbar z-10">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 font-semibold flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Acciones Rápidas:</span>
          </div>

          <div className="flex items-center gap-2 flex-nowrap">
            <button
              onClick={() => sendMessage(`Analizar soporte clave y niveles de reacción de ${symbol}`)}
              disabled={loading}
              className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Analizar soporte clave</span>
            </button>

            <button
              onClick={() => sendMessage(`Calcular ratio riesgo/beneficio 1:3 para ${symbol} en ${interval}`)}
              disabled={loading}
              className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>Calcular riesgo/beneficio 1:3</span>
            </button>

            <button
              onClick={() => sendMessage(`Estrategia scalping con cruce MACD y RSI en ${symbol}`)}
              disabled={loading}
              className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Estrategia scalping MACD</span>
            </button>

            <button
              onClick={() => sendMessage(`Resumen técnico cuantitativo completo de ${symbol}`)}
              disabled={loading}
              className="bg-[#09151d] hover:bg-emerald-950/60 border border-slate-700/60 hover:border-emerald-500/40 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              <FileText className="w-3.5 h-3.5 text-rose-400" />
              <span>Resumen técnico completo</span>
            </button>
          </div>
        </div>

        {/* 5. Barra de Entrada de Comandos (Input Terminal) */}
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
              onKeyDown={handleKeyDown}
              placeholder="type a command, indicator setup, or question..."
              disabled={loading}
              className="flex-1 bg-transparent text-emerald-100 placeholder-slate-500 font-mono text-xs sm:text-sm outline-none resize-none py-1 min-h-[22px] max-h-[75px] cyber-scrollbar"
              style={{ lineHeight: "1.4" }}
            />

            {/* Botón de Micrófono / TTS */}
            <button
              type="button"
              onClick={toggleTTS}
              title={ttsEnabled ? "Voz activada (TTS ON)" : "Voz desactivada (TTS OFF)"}
              className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/30 rounded-lg transition-colors flex-shrink-0"
            >
              <MicIcon active={ttsEnabled} />
            </button>

            {/* Botón de Enviar o Detener */}
            {loading || isTyping ? (
              <button
                id="ai-chat-stop"
                onClick={stopGeneration}
                title="Detener respuesta"
                className="w-8 h-8 rounded-lg bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_10px_rgba(244,63,94,0.3)]"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                id="ai-chat-send"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                title="Enviar comando"
                className="w-8 h-8 rounded-lg bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-slate-950 font-bold flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_12px_rgba(52,211,153,0.35)] disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            )}
          </div>

          {/* 6. Barra de Pie de Página (Footer) */}
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 px-1 pt-1 tracking-wider uppercase">
            <span>
              WOODY AGENT — {symbol} @ {interval} • ENGINE: {selectedModel.toUpperCase().replace("NVIDIA-", "")}
            </span>
            <span className="hidden sm:inline">
              NOT FINANCIAL ADVICE • FOR ALGORITHMIC RESEARCH ONLY
            </span>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .cyber-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .cyber-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .cyber-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.2);
          border-radius: 4px;
        }
        .cyber-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.4);
        }
      `}</style>
    </div>
  )
}
