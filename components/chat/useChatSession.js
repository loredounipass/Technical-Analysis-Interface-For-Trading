"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useVoiceTTS } from "../VoiceTTS"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api"

export const INTERVAL_LABELS = {
  "1m": "1 minuto",
  "5m": "5 minutos",
  "15m": "15 minutos",
  "1h": "1 hora",
  "4h": "4 horas",
  "1d": "1 día",
}

/**
 * Custom hook que centraliza toda la lógica de estado, sesiones,
 * streaming, telemetría y llamadas al backend para el agente Woody.
 */
export function useChatSession({ symbol, datos, interval = "15m", market = "crypto", onAnalysisChange, isOpen }) {
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showModelSelect, setShowModelSelect] = useState(false)
  const [typingText, setTypingText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [sessionTime, setSessionTime] = useState("18:12:02")

  const typingRef = useRef(null)
  const abortRef = useRef(null)
  const activeModelRef = useRef(null)
  const inputRef = useRef(null)
  const chatContainerRef = useRef(null)
  const isAutoScrollPausedRef = useRef(false)
  const { ttsEnabled, toggle: toggleTTS, playResponse } = useVoiceTTS()

  // Hora de inicio de sesión UTC
  useEffect(() => {
    const now = new Date()
    setSessionTime(now.toTimeString().split(" ")[0])
  }, [])

  // Telemetría en vivo del libro de órdenes y diagnóstico cuantitativo
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

  // Detección de scroll para pausar auto-scroll
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

  // Cargar sesiones previas
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

  // Crear nueva sesión con el saludo inicial estilizado
  const createNewSession = () => {
    const newId = Date.now().toString()
    const intervalLabel = INTERVAL_LABELS[interval] || interval

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

  const currentModelName =
    models.find((m) => m.key === selectedModel)?.name || "Nemotron 3 Nano Omni"

  return {
    sessions,
    activeSessionId,
    messages,
    input,
    setInput,
    loading,
    models,
    selectedModel,
    setSelectedModel,
    currentModelName,
    isSidebarOpen,
    setIsSidebarOpen,
    showModelSelect,
    setShowModelSelect,
    typingText,
    isTyping,
    sessionTime,
    marketTelemetry,
    inputRef,
    chatContainerRef,
    ttsEnabled,
    toggleTTS,
    createNewSession,
    switchSession,
    deleteSession,
    clearChat: createNewSession,
    sendMessage,
    stopGeneration,
    handleKeyDown,
    handleScroll,
  }
}
