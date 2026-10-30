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
      const saved = localStorage.getItem("trading_terminal_model")
      if (saved && ["nvidia-nemotron", "meta-muse", "google-diffusiongemma"].includes(saved)) {
        return saved
      }
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
  // Se alimenta directamente de los indicadores de `datos`
  const marketTelemetry = useMemo(() => {
    const buy = datos?.buySignals || 0
    const sell = datos?.sellSignals || 0
    const neutral = datos?.neutralSignals || 0
    const total = buy + sell + neutral

    let buyerPercent = "52.8%"
    // VOLUMEN COMPRADOR REAL: buyerPercent llega del backend calculado con el
    // libro de órdenes de Binance (o proxy de volumen de velas para stocks).
    // Solo si el backend no lo manda se cae al conteo de señales de indicadores.
    const realBuyerPercent = datos?.buyerPercent
    if (realBuyerPercent != null && !isNaN(Number(realBuyerPercent))) {
      buyerPercent = Number(realBuyerPercent).toFixed(1) + "%"
    } else if (total > 0) {
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

    // RSI (14) - Lee datos reales de datos.rsi
    const rsiVal = datos?.rsi != null ? Number(datos.rsi).toFixed(2) : "28.12"
    const rsiNum = Number(rsiVal)
    let rsiBadge = "DIVERGENCIA"
    let rsiSubtitle = "▲ Alcista oculta"
    if (rsiNum < 30) {
      rsiBadge = "SOBREVENTA"
      rsiSubtitle = "▲ Alcista oculta"
    } else if (rsiNum < 40) {
      rsiBadge = "DIVERGENCIA"
      rsiSubtitle = "▲ Alcista oculta"
    } else if (rsiNum > 70) {
      rsiBadge = "SOBRECOMPRA"
      rsiSubtitle = "▼ Presión bajista"
    } else if (rsiNum > 60) {
      rsiBadge = "PRESIÓN ALTA"
      rsiSubtitle = "▲ Impulso activo"
    } else {
      rsiBadge = "EQUILIBRIO"
      rsiSubtitle = "● Neutral"
    }

    // SOPORTE CLAVE (S1 DINÁMICO) - Lee datos reales de datos.s1 o calcula con datos.precio
    let s1Val = "$2,197.57"
    if (datos?.s1 != null) {
      const s1Num = Number(datos.s1)
      s1Val = "$" + (s1Num < 1 ? s1Num.toFixed(4) : s1Num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    } else if (datos?.precio != null) {
      const s1Calc = Number(datos.precio) * 0.985
      s1Val = "$" + (s1Calc < 1 ? s1Calc.toFixed(4) : s1Calc.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    }

    // ADX FUERZA - Lee datos reales de datos.adx
    const adxVal = datos?.adx != null ? Number(datos.adx).toFixed(2) : "42.38"
    const adxNum = Number(adxVal)
    const adxBadge = adxNum >= 25 ? "DEFINIDA" : "CONSOLIDACIÓN"
    const adxSubtitle = adxNum >= 25 ? "Tendencia alta" : "Lateral"

    // MACD CRUCE - Lee datos reales de datos.macdHistogram
    const macdVal = datos?.macdHistogram != null ? Number(datos.macdHistogram).toFixed(2) : "-1.04"
    const macdNum = Number(macdVal)
    const macdBadge = macdNum < 0 ? "CONTRACCIÓN" : "EXPANSIÓN"
    const macdSubtitle = "Histograma"

    // Diagnóstico resumen dinámico basado en las señales e indicadores reales
    let summary = "Actualmente observo compresión de volatilidad con presión compradora absorbiendo ventas cerca de soporte clave."
    if (datos) {
      if (buy > sell && rsiNum < 40) {
        summary = "Actualmente observo compresión de volatilidad con presión compradora absorbiendo ventas cerca de soporte clave."
      } else if (buy > sell) {
        summary = `Flujo comprador predominante (${buyerPercent}) con estructura alcista consolidando sobre soporte dinámico.`
      } else if (sell > buy) {
        summary = `Presión vendedora activa en el histograma MACD. Monitoreando soporte clave para confirmación de absorción.`
      } else {
        summary = "Actualmente observo compresión de volatilidad con equilibrio entre oferta y demanda cerca de niveles clave."
      }
    }

    return {
      buyerPercent,
      trendLabel,
      // Estado real del libro de órdenes: order_book = vinculado al libro
      // real (Coinbase/Binance); volume_proxy = estimación direccional con velas.
      orderBookLinked: !!datos?.orderBookSource && datos.orderBookSource !== "volume_proxy",
      orderBookSource: datos?.orderBookSource || null,
      diagnostic: {
        rsiValue: rsiVal,
        rsiBadge,
        rsiSubtitle,
        supportValue: s1Val,
        supportBadge: "S1 DINÁMICO",
        supportSubtitle: "Rechazo fuerte",
        adxValue: adxVal,
        adxBadge,
        adxSubtitle,
        macdValue: macdVal,
        macdBadge,
        macdSubtitle,
        summary,
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
          { key: "meta-muse", name: "Muse Glimmer 30B", provider: "Meta", free: true },
          { key: "google-diffusiongemma", name: "DiffusionGemma 26B", provider: "Google", free: true },
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

  // Al abrir el chat (o cambiar de sesión): enfocar el input, reactivar el
  // auto-scroll y posicionar la conversación siempre hasta abajo.
  useEffect(() => {
    if (isOpen && !isSidebarOpen) {
      isAutoScrollPausedRef.current = false
      setTimeout(() => {
        inputRef.current?.focus()
        scrollChatToBottom("auto")
      }, 250)
    }
  }, [isOpen, activeSessionId, isSidebarOpen])

  // Cargar sesiones previas o crear nueva
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

  // Sincronizar reactivamente el diagnóstico y el modelo en el mensaje de bienvenida
  // cuando lleguen datos nuevos de indicadores o cuando cambie el modelo / timeframe / símbolo
  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const first = prev[0]
      if (first.role === "assistant" && first.diagnostic) {
        const intervalLabel = INTERVAL_LABELS[interval] || interval
        const updatedFirst = {
          ...first,
          content: `¡Hola! ¿En qué puedo asistirte con el análisis del mercado de **${symbol}** en el timeframe de **${intervalLabel}**?`,
          model: selectedModel,
          diagnostic: marketTelemetry.diagnostic,
        }
        return [updatedFirst, ...prev.slice(1)]
      }
      return prev
    })
  }, [datos, symbol, interval, selectedModel, marketTelemetry.diagnostic])

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

  // Crear nueva sesión con el saludo inicial estilizado y datos actualizados
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
    // Velocidad adaptativa para revelar el informe completo con fluidez sin cortes
    const stepSize = words.length > 500 ? 8 : words.length > 200 ? 4 : 2
    const speed = 12

    typingRef.current = setInterval(() => {
      const chunk = words.slice(0, idx + stepSize).join("")
      idx += stepSize
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

  const sendMessage = async (customPrompt, meta = null) => {
    const textToSend = typeof customPrompt === "string" ? customPrompt : input
    const trimmed = textToSend.trim()
    if (!trimmed || loading) return

    const userMsg = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      meta: typeof meta === "object" && meta ? meta : null,
    }
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

    // Historial limpio y seguro:
    // 1. Omitir el mensaje de bienvenida sintético (asistente inicial) para evitar problemas de orden de roles
    // 2. Omitir mensajes de error
    // 3. Limitar a los últimos 6 intercambios
    // 4. Truncar respuestas muy largas de modelos anteriores para no agotar la ventana de tokens
    const cleanHistory = messages
      .filter((m, idx) => !m.isError && !(idx === 0 && m.role === "assistant"))
      .slice(-6)
      .map((m) => ({
        role: m.role,
        content: m.role === "assistant" && m.content.length > 1500
          ? m.content.slice(0, 1500) + "..."
          : m.content,
      }))

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
          indicator_data: datos,
          history: cleanHistory,
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
