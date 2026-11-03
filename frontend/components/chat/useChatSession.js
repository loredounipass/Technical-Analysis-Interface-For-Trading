"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useVoiceTTS } from "../VoiceTTS"
import {
  createChatSession,
  deleteChatSession,
  fetchChatModels,
  fetchChatState,
  importLegacyChatState,
  openChatStream,
  saveChatMessage,
  updateChatPreferences,
  updateChatWelcomeMessage,
} from "@/services/api/chatApi"

export const INTERVAL_LABELS = {
  "1m": "1 minuto",
  "5m": "5 minutos",
  "15m": "15 minutos",
  "1h": "1 hora",
  "6h": "6 horas",
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
  // NOTA: el texto del campo de entrada vive LOCALMENTE en ChatCommandBar (no
  // aqui) para que cada tecla NO re-renderice toda la ventana del chat. Solo se
  // recibe ya el texto completo cuando sendMessage es invocado al enviar.
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModelState] = useState("nvidia-nemotron")
  const [chatReady, setChatReady] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  // Habilidad de busqueda web (DuckDuckGo). Persistente entre sesiones; solo
  // afecta el payload y el estado del boton (no la estructura renderizada).
  const [webSearchEnabled, setWebSearchEnabledState] = useState(false)
  const [typingText, setTypingText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [streamingThought, setStreamingThought] = useState("")
  const [isThinking, setIsThinking] = useState(false)

  const typingRef = useRef(null)
  const abortRef = useRef(null)
  const activeModelRef = useRef(null)
  const inputRef = useRef(null)
  const chatContainerRef = useRef(null)
  const isAutoScrollPausedRef = useRef(false)
  const { ttsEnabled, toggle: toggleTTS, playResponse } = useVoiceTTS()

  // Telemetría en vivo del libro de órdenes y diagnóstico cuantitativo
  // Se alimenta directamente de los indicadores de `datos`
  const marketTelemetry = useMemo(() => {
    const buy = datos?.buySignals || 0
    const sell = datos?.sellSignals || 0
    const neutral = datos?.neutralSignals || 0
    const emDash = "\u2014"
    const num = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null)

    // VOLUMEN COMPRADOR REAL: proviene del backend (profundidad del libro de
    // ordenes de Coinbase/Binance, o proxy de volumen de velas). Si no llega un
    // numero real se muestra "---"; nunca se inventa un porcentaje ni se vende
    // un conteo de senales como si fuera volumen.
    const realBuyerPercent = datos?.buyerPercent
    const hasBuyerPercent = realBuyerPercent != null && Number.isFinite(Number(realBuyerPercent))
    const buyerPercent = hasBuyerPercent
      ? Number(realBuyerPercent).toFixed(1) + "%"
      : emDash

    // Tendencia derivada honestamente del conteo de senales reales del backend.
    let trendLabel = "RANGO NEUTRAL"
    if (buy > sell + 2) {
      trendLabel = "ALCISTA FUERTE"
    } else if (buy > sell) {
      trendLabel = "ALCISTA LEVE"
    } else if (sell > buy + 2) {
      trendLabel = "BAJISTA FUERTE"
    } else if (sell > buy) {
      trendLabel = "BAJISTA LEVE"
    }

    // RSI (14): solo valor real. Sin dato no se inventa numero ni se clasifica.
    const rsiNum = num(datos?.rsi)
    const rsiVal = rsiNum != null ? rsiNum.toFixed(2) : emDash
    let rsiBadge = "SIN DATO"
    let rsiSubtitle = "\u25CF Sin RSI"
    if (rsiNum != null) {
      if (rsiNum < 30) {
        rsiBadge = "SOBREVENTA"
        rsiSubtitle = "\u25B2 Sobreventa"
      } else if (rsiNum < 40) {
        rsiBadge = "ZONA BAJA"
        rsiSubtitle = "\u25CF Zona baja"
      } else if (rsiNum > 70) {
        rsiBadge = "SOBRECOMPRA"
        rsiSubtitle = "\u25BC Sobrecompra"
      } else if (rsiNum > 60) {
        rsiBadge = "ZONA ALTA"
        rsiSubtitle = "\u25CF Zona alta"
      } else {
        rsiBadge = "EQUILIBRIO"
        rsiSubtitle = "\u25CF Neutral"
      }
    }

    // SOPORTE CLAVE: usa el nivel pivote S1 REAL del backend. No se fabrica un
    // soporte restando un porcentaje al precio (eso era un valor inventado).
    const s1Num = num(datos?.s1)
    const supportValue = s1Num != null
      ? "$" + (s1Num < 1
        ? s1Num.toFixed(4)
        : s1Num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
      : emDash
    const supportBadge = s1Num != null ? "S1 PIVOTE" : "SIN DATO"
    const supportSubtitle = s1Num != null ? "Nivel pivote real" : emDash

    // ADX: solo valor real; la fortaleza se clasifica a partir de el.
    const adxNum = num(datos?.adx)
    const adxVal = adxNum != null ? adxNum.toFixed(2) : emDash
    const adxBadge = adxNum == null ? "SIN DATO" : adxNum >= 25 ? "DEFINIDA" : "CONSOLIDACIÓN"
    const adxSubtitle = adxNum == null ? emDash : adxNum >= 25 ? "Tendencia definida" : "Lateral"

    // MACD histograma: solo valor real; el signo define expansion/contraccion.
    const macdNum = num(datos?.macdHistogram)
    const macdVal = macdNum != null ? macdNum.toFixed(2) : emDash
    const macdBadge = macdNum == null ? "SIN DATO" : macdNum < 0 ? "CONTRACCIÓN" : "EXPANSIÓN"
    const macdSubtitle = macdNum == null ? emDash : "Histograma"

    // Resumen: narracion acotada a lo que los datos realmente muestran. Sin
    // datos suficientes se declara la ausencia en lugar de inventar una tesis.
    let summary
    if (!datos || (rsiNum == null && !hasBuyerPercent && buy + sell + neutral === 0)) {
      summary = "Sin datos de mercado suficientes para un diagnóstico."
    } else if (buy > sell) {
      summary = `Flujo comprador predominante entre las señales activas${hasBuyerPercent ? ` (volumen comprador ${buyerPercent})` : ""}. RSI ${rsiVal}, ADX ${adxVal}.`
    } else if (sell > buy) {
      summary = `Presión vendedora predominante entre las señales activas. RSI ${rsiVal}, histograma MACD ${macdVal}.`
    } else {
      summary = `Equilibrio entre oferta y demanda en las señales. RSI ${rsiVal}, ADX ${adxVal}.`
    }

    return {
      buyerPercent,
      trendLabel,
      // Estado real del libro de órdenes: solo 'order_book' = vinculado al libro
      // real (Coinbase/Binance). volume_proxy/volume_profile/synthetic_profile
      // son proxies de volumen de velas, NO el libro real.
      orderBookLinked: datos?.orderBookSource === "order_book",
      orderBookSource: datos?.orderBookSource || null,
      diagnostic: {
        rsiValue: rsiVal,
        rsiBadge,
        rsiSubtitle,
        supportValue,
        supportBadge,
        supportSubtitle,
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
        const data = await fetchChatModels()
        if (data) {
          setModels(data)
          if (!data.some((m) => m.key === selectedModel)) {
            setSelectedModelState("nvidia-nemotron")
          }
        }
      } catch (e) {
        setModels([
          { key: "nvidia-nemotron", name: "Nemotron 3 Nano Omni", provider: "NVIDIA", free: true, reasoning: true },
          { key: "nvidia-nemotron-bolt", name: "Nemotron 3.5 Bolt E4B", provider: "NVIDIA", free: true, reasoning: false },
          { key: "nvidia-nemotron-ultra", name: "Nemotron 3 Ultra 550B", provider: "NVIDIA", free: true, reasoning: true },
          { key: "meta-muse", name: "Muse Glimmer 30B", provider: "Meta", free: true, reasoning: true },
          { key: "google-diffusiongemma", name: "DiffusionGemma 26B", provider: "Google", free: true, reasoning: false },
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
  }, [messages, typingText, streamingThought])

  useEffect(() => {
    return () => {
      if (typingRef.current) clearInterval(typingRef.current)
      // Aborta el stream SSE en vuelo al desmontar (navegar fuera del chat,
      // cerrar el terminal): sin esto el fetch sigue corriendo hasta terminar,
      // gastando cuota de NVIDIA/SerpApi y dejando lecturas sobre un componente
      // ya desmontado. El catch de sendMessage trata AbortError de forma limpia.
      abortRef.current?.abort()
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

  // Devolver el foco al input cuando termina la respuesta: el usuario debe
  // poder escribir el siguiente mensaje sin volver a clicar en el campo. Se
  // dispara solo en la transición loading true -> false, para no robarle el
  // foco a un diálogo o a la barra lateral que estén abiertos en ese momento.
  const wasLoadingRef = useRef(false)
  useEffect(() => {
    const justFinished = wasLoadingRef.current && !loading
    wasLoadingRef.current = loading
    if (justFinished && isOpen && !isSidebarOpen) {
      inputRef.current?.focus()
    }
  }, [loading, isOpen, isSidebarOpen])

  // Load persisted chat state, importing legacy browser data once when present.
  useEffect(() => {
    let cancelled = false
    async function loadChatState() {
      try {
        let state = await fetchChatState()
        const savedSessions = localStorage.getItem("trading_terminal_sessions")
        const savedModel = localStorage.getItem("trading_terminal_model")
        const savedWebSearch = localStorage.getItem("trading_terminal_web_search")
        if (savedSessions || savedModel || savedWebSearch) {
          let legacySessions = []
          if (savedSessions) {
            try {
              const parsed = JSON.parse(savedSessions)
              if (Array.isArray(parsed)) legacySessions = parsed
            } catch (error) {
              console.error("Could not parse legacy chat history.", error)
            }
          }
          state = await importLegacyChatState({
            sessions: legacySessions,
            selected_model: savedModel,
            web_search_enabled: savedWebSearch === null ? undefined : savedWebSearch === "true",
          })
          localStorage.removeItem("trading_terminal_sessions")
          localStorage.removeItem("trading_terminal_model")
          localStorage.removeItem("trading_terminal_web_search")
        }

        if (state.sessions.length === 0) {
          const intervalLabel = INTERVAL_LABELS[interval] || interval
          const welcomeMessage = {
            role: "assistant",
            content: `¡Hola! ¿En qué puedo asistirte con el análisis del mercado de **${symbol}** en el timeframe de **${intervalLabel}**?`,
            timestamp: Date.now(),
            model: state.selected_model,
            diagnostic: marketTelemetry.diagnostic,
          }
          await createChatSession({
            symbol,
            market,
            interval,
            initial_message: welcomeMessage,
            only_if_empty: true,
          })
          state = await fetchChatState()
        }

        if (cancelled) return
        setSelectedModelState(state.selected_model || "nvidia-nemotron")
        setWebSearchEnabledState(Boolean(state.web_search_enabled))
        setSessions(state.sessions)
        setActiveSessionId(state.sessions[0].id)
        setMessages(state.sessions[0].messages || [])
        setChatReady(true)
      } catch (error) {
        console.error("Failed to load chat state from the API.", error)
        if (!cancelled) {
          setMessages([{
            role: "assistant",
            content: `! ERROR: No se pudo cargar el historial del chat desde el servidor. ${error.message}`,
            timestamp: Date.now(),
            isError: true,
          }])
        }
      }
    }
    loadChatState()
    return () => { cancelled = true }
  }, [])

  // Sincronizar el diagnostico y el modelo en el mensaje de bienvenida cuando
  // cambian el simbolo / timeframe / modelo. Deliberadamente NO depende de
  // `datos`: el socket emite cada ~1.5s y cada emision crearia un array nuevo
  // de `messages`, lo que (a) invalida la memoizacion de ChatMessageList y
  // re-parsea el markdown de TODA la conversacion y (b) reserializa la sesión.
  // Esa cascada de fondo es la que hace que tipear se
  // "pegue". El greeting muestra el diagnostico real del ultimo cambio de
  // contexto (snapshot valido, no un dato inventado).
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
    if (activeSessionId) {
      const welcome = messages[0]
      if (welcome?.role === "assistant" && welcome.diagnostic) {
        updateChatWelcomeMessage(activeSessionId, {
          ...welcome,
          content: `¡Hola! ¿En qué puedo asistirte con el análisis del mercado de **${symbol}** en el timeframe de **${INTERVAL_LABELS[interval] || interval}**?`,
          model: selectedModel,
          diagnostic: marketTelemetry.diagnostic,
        }).catch((error) => {
          console.error("Could not save updated chat welcome message.", error)
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `! ERROR: No se pudo guardar el contexto de bienvenida. ${error.message}`,
            timestamp: Date.now(),
            isError: true,
          }])
        })
      }
    }
  }, [symbol, interval, selectedModel])

  useEffect(() => {
    if (activeSessionId) {
      setSessions((prev) =>
        prev.map((s) => (s.id === activeSessionId ? { ...s, messages: messages } : s))
      )
    }
  }, [messages])

  useEffect(() => {
    onAnalysisChange?.(loading || isTyping)
  }, [loading, isTyping, onAnalysisChange])

  // Cancela cualquier stream en vuelo y limpia el estado de generación, para que
  // al crear/cambiar de sesión la respuesta pendiente no se anexee a la nueva
  // (sendMessage agrega el mensaje final al estado actual al terminar) y no
  // siga consumiendo cuota. El catch de AbortError no agrega nada si no hubo stall.
  const cancelInFlight = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
    setIsThinking(false)
    setIsTyping(false)
    setTypingText("")
    setStreamingThought("")
  }

  // Crear nueva sesión con el saludo inicial estilizado y datos actualizados
  const createNewSession = async () => {
    if (!chatReady) return
    cancelInFlight()
    const intervalLabel = INTERVAL_LABELS[interval] || interval

    const initialWelcomeMessage = {
      role: "assistant",
      content: `¡Hola! ¿En qué puedo asistirte con el análisis del mercado de **${symbol}** en el timeframe de **${intervalLabel}**?`,
      timestamp: Date.now(),
      model: selectedModel,
      diagnostic: marketTelemetry.diagnostic,
    }

    let created
    try {
      created = await createChatSession({
        title: `${symbol} Analysis`,
        symbol,
        market,
        interval,
        initial_message: initialWelcomeMessage,
      })
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `! ERROR: No se pudo crear la sesión. ${error.message}`,
        timestamp: Date.now(),
        isError: true,
      }])
      return
    }
    const newSession = {
      id: created.id,
      title: `${symbol} Analysis`,
      messages: [initialWelcomeMessage],
      symbol,
      timestamp: Date.now(),
    }
    setSessions((prev) => [newSession, ...prev])
    setActiveSessionId(created.id)
    setMessages([initialWelcomeMessage])
    setIsSidebarOpen(false)
  }

  const switchSession = (id) => {
    cancelInFlight()
    const session = sessions.find((s) => s.id === id)
    if (session) {
      setActiveSessionId(id)
      setMessages(session.messages || [])
      setIsSidebarOpen(false)
    }
  }

  const deleteSession = async (e, id) => {
    e.stopPropagation()
    try {
      await deleteChatSession(id)
    } catch (error) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `! ERROR: No se pudo eliminar la sesión. ${error.message}`,
        timestamp: Date.now(),
        isError: true,
      }])
      return
    }
    const filtered = sessions.filter((s) => s.id !== id)
    setSessions(filtered)
    if (activeSessionId === id) {
      if (filtered.length > 0) {
        switchSession(filtered[0].id)
      } else {
        await createNewSession()
      }
      // switchSession/createNewSession cierran el panel, pero al eliminar desde
      // el drawer el usuario espera seguir viendo la lista: lo reabrimos.
      setIsSidebarOpen(true)
    }
  }

  const setSelectedModel = (model) => {
    const previousModel = selectedModel
    setSelectedModelState(model)
    updateChatPreferences({ selected_model: model }).catch((error) => {
      setSelectedModelState(previousModel)
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `! ERROR: No se pudo guardar el modelo seleccionado. ${error.message}`,
        timestamp: Date.now(),
        isError: true,
      }])
    })
  }

  const sendMessage = async (customPrompt, meta = null) => {
    const textToSend = typeof customPrompt === "string" ? customPrompt : ""
    const trimmed = textToSend.trim()
    if (!trimmed || loading || !chatReady || !activeSessionId) return

    const userMsg = {
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
      meta: typeof meta === "object" && meta ? meta : null,
    }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)
    // Marca el modelo de la respuesta en curso: si el usuario interrumpe el
    // stream (stopGeneration), el mensaje parcial queda etiquetado correctamente.
    activeModelRef.current = selectedModel
    isAutoScrollPausedRef.current = false
    setTimeout(() => scrollChatToBottom(), 50)

    const controller = new AbortController()
    abortRef.current = controller

    // Watchdog de estancamiento: si el stream SSE deja de emitir bytes durante
    // STALL_MS (backend colgado o busqueda muy lenta), abortamos y avisamos en
    // lugar de dejar el spinner girando indefinidamente.
    let stalled = false
    let stallTimer = null
    const STALL_MS = 90000
    const resetStall = () => {
      if (stallTimer) clearTimeout(stallTimer)
      stallTimer = setTimeout(() => {
        stalled = true
        controller.abort()
      }, STALL_MS)
    }
    const clearStall = () => {
      if (stallTimer) {
        clearTimeout(stallTimer)
        stallTimer = null
      }
    }

    setStreamingThought("")
    setIsThinking(true)

    try {
      // Armamos el watchdog ANTES del fetch: sin esto, un backend colgado que
      // nunca devuelve cabeceras dejaría el `await` trabado indefinidamente
      // (el reader y su resetStall solo existen una vez recibida la Response).
      resetStall()
      await saveChatMessage(activeSessionId, userMsg)
      const res = await openChatStream(
        {
          prompt: trimmed,
          session_id: activeSessionId,
          model: selectedModel,
          symbol: symbol,
          interval: interval,
          market: market,
          indicator_data: datos,
          stream: true,
        },
        controller.signal
      )

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        const errMsg = errJson.error || `Error ${res.status}`
        const errorMessage = {
          role: "assistant",
          content: `! ERROR: ${errMsg}`,
          timestamp: Date.now(),
          isError: true,
        }
        await saveChatMessage(activeSessionId, errorMessage)
        setMessages((prev) => [...prev, errorMessage])
        setLoading(false)
        setIsThinking(false)
        return
      }

      // Procesar flujo Server-Sent Events (SSE) en tiempo real
      const reader = res.body.getReader()
      const decoder = new TextDecoder("utf-8")
      let buffer = ""
      let accumulatedThought = ""
      let accumulatedContent = ""
      let memoryMeta = []

      // Throttle del pintado en vivo: los tokens llegan a decenas por segundo.
      // Coalescemos el setState a UN paint por animation frame (requestAnimation
      // Frame, ~60fps max, alineado al refresco real del navegador). El pintado ya
      // es barato (StreamingMarkdown solo re-parsea el bloque activo), asi que un
      // flush por frame da un goteo suave sin el 'de golpe' de un parseo costoso.
      // El resultado final se fija exacto al cerrar el stream (la respuesta pasa a
      // messages). El scroll lo gobierna un unico efecto (ver useEffect de autoscroll).
      let streamEnded = false
      let rafId = null
      const doFlush = () => {
        rafId = null
        if (streamEnded) return
        setStreamingThought(accumulatedThought)
        setTypingText(accumulatedContent)
      }
      const scheduleFlush = () => {
        if (streamEnded || rafId != null) return
        rafId = requestAnimationFrame(doFlush)
      }

      resetStall()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        resetStall()
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const evt of events) {
          const lines = evt.split("\n")
          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine.startsWith("data: ")) continue
            const jsonStr = trimmedLine.slice(6).trim()
            if (!jsonStr || jsonStr === "[DONE]") continue
            let parsed
            try {
              parsed = JSON.parse(jsonStr)
            } catch {
              continue
            }
            if (parsed.type === "thought" && parsed.chunk) {
              accumulatedThought += parsed.chunk
              scheduleFlush()
            } else if (parsed.type === "content" && parsed.chunk) {
              if (isThinking) setIsThinking(false)
              setIsTyping(true)
              accumulatedContent += parsed.chunk
              scheduleFlush()
            } else if (parsed.type === "tool") {
              memoryMeta.push(parsed)
            } else if (parsed.type === "session_renamed") {
              setSessions((prev) => prev.map((session) =>
                session.id === parsed.session_id
                  ? { ...session, title: parsed.title }
                  : session
              ))
            } else if (parsed.type === "done") {
              if (parsed.memory_accessed) {
                memoryMeta = parsed.memory_accessed
              }
            } else if (parsed.type === "error") {
              throw new Error(parsed.error || "Error en streaming")
            }
          }
        }
      }

      // Detenemos el batching y cancelamos cualquier flush pendiente antes de
      // fijar el estado final (la respuesta ya se pasa a messages debajo).
      streamEnded = true
      if (rafId != null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }

      // Finalizar mensaje con el pensamiento y respuesta completas
      const hasMeta = Array.isArray(memoryMeta) && memoryMeta.length > 0
      if (accumulatedContent) {
        const responseMessage = {
          role: "assistant",
          content: accumulatedContent,
          thought: accumulatedThought || null,
          timestamp: Date.now(),
          model: selectedModel,
          memoryAccessed: hasMeta ? memoryMeta : null,
        }
        await saveChatMessage(activeSessionId, responseMessage)
        setMessages((prev) => [
          ...prev,
          responseMessage,
        ])
        playResponse(accumulatedContent)
      } else if (hasMeta || accumulatedThought) {
        // El stream termino sin una respuesta final (p. ej. se agotaron las
        // rondas de herramientas o la busqueda no devolvio nada). Mostramos un
        // aviso amigable en vez de dejar la conversacion sin respuesta.
        const webUsed = memoryMeta.some((m) => m.tool === "web_search")
        const fallback = webUsed
          ? "Busqué información actualizada pero no obtuve resultados concluyentes en este momento. Probá reformular la pregunta o intentá de nuevo en unos segundos."
          : "No pude generar una respuesta en esta ocasión. Intentá nuevamente."
        const responseMessage = {
          role: "assistant",
          content: fallback,
          thought: accumulatedThought || null,
          timestamp: Date.now(),
          model: selectedModel,
          memoryAccessed: hasMeta ? memoryMeta : null,
        }
        await saveChatMessage(activeSessionId, responseMessage)
        setMessages((prev) => [
          ...prev,
          responseMessage,
        ])
      }
      setTypingText("")
      setIsTyping(false)
      setStreamingThought("")
      setIsThinking(false)
    } catch (err) {
      if (err?.name === "AbortError") {
        if (stalled) {
          const errorMessage = {
            role: "assistant",
            content: "La búsqueda tardó demasiado y se interrumpió. Intentá de nuevo en unos segundos.",
            timestamp: Date.now(),
            isError: true,
          }
          saveChatMessage(activeSessionId, errorMessage).catch((saveError) => {
            console.error("Could not save chat timeout message.", saveError)
          })
          setMessages((prev) => [...prev, errorMessage])
        }
        return
      }
      const errorMessage = {
        role: "assistant",
        content: `! ERROR DE CONEXIÓN: ${err?.message || "Servicio AI offline o no disponible."}`,
        timestamp: Date.now(),
        isError: true,
      }
      saveChatMessage(activeSessionId, errorMessage).catch((saveError) => {
        console.error("Could not save chat error message.", saveError)
      })
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      clearStall()
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
      setIsThinking(false)
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
      const partialMessage = {
        role: "assistant",
        content: partial,
        timestamp: Date.now(),
        model: activeModelRef.current,
        interrupted: true,
      }
      setMessages((prev) => [...prev, partialMessage])
      if (activeSessionId) {
        saveChatMessage(activeSessionId, partialMessage).catch((error) => {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `! ERROR: No se pudo guardar la respuesta interrumpida. ${error.message}`,
            timestamp: Date.now(),
            isError: true,
          }])
        })
      }
    }
  }

  const currentModelName =
    models.find((m) => m.key === selectedModel)?.name || "Nemotron 3 Nano Omni"

  const toggleWebSearch = () => {
    const nextValue = !webSearchEnabled
    setWebSearchEnabledState(nextValue)
    updateChatPreferences({ web_search_enabled: nextValue }).catch((error) => {
      setWebSearchEnabledState(!nextValue)
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `! ERROR: No se pudo guardar la preferencia de búsqueda web. ${error.message}`,
        timestamp: Date.now(),
        isError: true,
      }])
    })
  }

  return {
    sessions,
    activeSessionId,
    messages,
    chatReady,
    loading,
    models,
    selectedModel,
    setSelectedModel,
    currentModelName,
    isSidebarOpen,
    setIsSidebarOpen,
    typingText,
    isTyping,
    streamingThought,
    isThinking,
    marketTelemetry,
    inputRef,
    chatContainerRef,
    ttsEnabled,
    toggleTTS,
    webSearchEnabled,
    toggleWebSearch,
    createNewSession,
    switchSession,
    deleteSession,
    clearChat: createNewSession,
    sendMessage,
    stopGeneration,
    handleScroll,
  }
}
