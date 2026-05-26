"use client"

import { useState, useEffect, useRef } from "react"
import { Send, Bot, User, Trash2, ChevronDown, Cpu, Sparkles, MessageSquare, X, Loader2, Plus, History, Menu, Terminal } from "lucide-react"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api"

function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split("\n")
  const elements = []
  let listItems = []
  let tableRows = []
  let inTable = false

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-2 ml-5 space-y-1.5 list-disc marker:text-emerald-500/70 text-[14px]">
          {listItems}
        </ul>
      )
      listItems = []
    }
  }

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${elements.length}`} className="my-3 overflow-x-auto border border-emerald-900/30 rounded-lg">
          <table className="w-full text-left border-collapse text-[13px]">
            <tbody>
              {tableRows.map((row, rIdx) => {
                const isHeader = rIdx === 0
                const isSeparator = row.every(cell => cell.includes('---'))
                if (isSeparator) return null
                return (
                  <tr key={rIdx} className={isHeader ? "bg-emerald-900/20 border-b border-emerald-900/40" : "border-b border-emerald-900/10 last:border-0"}>
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className={`px-3 py-2 ${isHeader ? "font-semibold text-emerald-200" : "text-gray-300"}`}>
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
    let current = line
    let keyIdx = 0

    // Bold (**text**)
    const partsBold = current.split(/(\*\*.*?\*\*)/)
    partsBold.forEach(part => {
      if (part.startsWith('**') && part.endsWith('**')) {
        result.push(<strong key={`${keyPrefix}-b-${keyIdx++}`} className="font-semibold text-emerald-300">{part.slice(2, -2)}</strong>)
      } else {
        // Italics (*text*) inside the non-bold parts
        const partsItalic = part.split(/(\*.*?\*)/)
        partsItalic.forEach(subPart => {
          if (subPart.startsWith('*') && subPart.endsWith('*') && subPart.length > 2) {
            result.push(<em key={`${keyPrefix}-i-${keyIdx++}`} className="italic text-emerald-100/70">{subPart.slice(1, -1)}</em>)
          } else if (subPart) {
            result.push(subPart)
          }
        })
      }
    })
    return result.length > 0 ? result : line
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()

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
      elements.push(<h4 key={i} className="font-semibold text-emerald-200 text-[16px] mt-5 mb-2 flex items-center gap-2">{formatInline(trimmed.slice(4), i)}</h4>)
    } else if (trimmed.startsWith("## ")) {
      flushList()
      elements.push(<h3 key={i} className="font-bold text-emerald-100 text-[18px] mt-6 mb-3 border-b border-emerald-900/30 pb-2">{formatInline(trimmed.slice(3), i)}</h3>)
    } else if (trimmed.startsWith("# ")) {
      flushList()
      elements.push(<h2 key={i} className="font-bold text-white text-[20px] mt-6 mb-3 uppercase tracking-wide">{formatInline(trimmed.slice(2), i)}</h2>)
    }
    else if (/^[-*•]\s/.test(trimmed)) {
      listItems.push(<li key={i} className="text-gray-300">{formatInline(trimmed.replace(/^[-*•]\s/, ""), i)}</li>)
    }
    else if (/^\d+\.\s/.test(trimmed)) {
      flushList()
      elements.push(
        <div key={i} className="my-1.5 flex gap-2">
          <span className="text-emerald-500 font-mono font-medium flex-shrink-0 mt-0.5">{trimmed.match(/^\d+\./)[0]}</span>
          <span className="text-gray-300">{formatInline(trimmed.replace(/^\d+\.\s/, ""), i)}</span>
        </div>
      )
    }
    else if (trimmed.startsWith("> ")) {
      flushList()
      elements.push(
        <blockquote key={i} className="pl-3 border-l-2 border-emerald-500/50 my-2 text-emerald-100/70 italic bg-emerald-900/10 py-1.5 pr-2 rounded-r">
          {formatInline(trimmed.slice(2), i)}
        </blockquote>
      )
    }
    else if (trimmed === "") {
      flushList()
      elements.push(<div key={i} className="h-3" />)
    }
    else {
      flushList()
      elements.push(<p key={i} className="text-gray-200 my-1.5 leading-[1.6]">{formatInline(trimmed, i)}</p>)
    }
  })
  flushList()
  flushTable()
  return elements
}

export default function AiChat({ symbol, datos, interval = "15m", onAnalysisChange }) {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState("nvidia-llama")
  const [isOpen, setIsOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [showModelSelect, setShowModelSelect] = useState(false)
  const [typingText, setTypingText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const typingRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const chatContainerRef = useRef(null)

  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch(`${API_BASE_URL}/models`)
        if (res.ok) {
          const data = await res.json()
          setModels(data)
        }
      } catch (e) {
        console.error("Failed to fetch models:", e)
        setModels([
          { key: "nvidia-llama", name: "Llama 3.1 8B", provider: "Meta", free: true },
          { key: "nvidia-nemotron", name: "Nemotron 3 Nano Omni", provider: "NVIDIA", free: true },
          { key: "nvidia-kimi", name: "Kimi K2.6", provider: "Moonshot AI", free: true },
          { key: "nvidia-gpt-oss", name: "GPT-OSS 20B", provider: "OpenAI", free: true },
          { key: "nvidia-gpt-oss-120b", name: "GPT-OSS 120B", provider: "OpenAI", free: true },
          { key: "nvidia-glm", name: "GLM-5.1", provider: "Z-ai", free: true },
          { key: "nvidia-mistral", name: "Mistral Small 4 119B", provider: "Mistral AI", free: true },
        ])
      }
    }
    fetchModels()
  }, [])

  useEffect(() => {
    const container = chatContainerRef.current
    if (!container) return

    // If the user has manually scrolled up (more than 150px from the bottom), don't force auto-scroll
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150

    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, typingText])

  useEffect(() => {
    return () => { if (typingRef.current) clearInterval(typingRef.current) }
  }, [])

  useEffect(() => {
    if (isOpen && !isSidebarOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen, activeSessionId, isSidebarOpen])

  useEffect(() => {
    const saved = localStorage.getItem("trading_terminal_sessions")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed)
          setActiveSessionId(parsed[0].id)
          setMessages(parsed[0].messages || [])
        } else {
          createNewSession()
        }
      } catch (e) {
        createNewSession()
      }
    } else {
      createNewSession()
    }
  }, [])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto"
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 80)}px`
    }
  }, [input])

  useEffect(() => {
    if (activeSessionId) {
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, messages: messages } : s
      ))
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

  const createNewSession = () => {
    const newId = Date.now().toString()
    const newSession = {
      id: newId,
      title: "New Analysis",
      messages: [],
      symbol: symbol,
      timestamp: Date.now()
    }
    setSessions(prev => [newSession, ...prev])
    setActiveSessionId(newId)
    setMessages([])
    setIsSidebarOpen(false)
  }

  const switchSession = (id) => {
    const session = sessions.find(s => s.id === id)
    if (session) {
      setActiveSessionId(id)
      setMessages(session.messages || [])
      setIsSidebarOpen(false)
    }
  }

  const deleteSession = (e, id) => {
    e.stopPropagation()
    const filtered = sessions.filter(s => s.id !== id)
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
    setIsTyping(true)
    setTypingText("")
    const words = fullText.split(/( )/)
    let idx = 0
    const speed = 18

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
      }
    }, speed)
  }

  const sendMessage = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMsg = { role: "user", content: trimmed, timestamp: Date.now() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    const otherSessions = sessions.filter(s => s.id !== activeSessionId)
    const globalContext = otherSessions.map(s => {
      const summary = s.messages.length > 0 ? s.messages[0].content.slice(0, 50) + "..." : "Empty"
      return `Session [${s.symbol}]: ${summary}`
    }).join(" | ")

    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          model: selectedModel,
          symbol: symbol,
          interval: interval,
          history: history,
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
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "! CONNECTION ERROR — Backend offline",
          timestamp: Date.now(),
          isError: true,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  const currentModelName = models.find((m) => m.key === selectedModel)?.name || selectedModel

  if (!isOpen) {
    return (
      <button
        id="ai-chat-toggle"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 group"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-cyan-400 rounded-full blur-xl opacity-70 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center justify-center w-16 h-16 rounded-full shadow-2xl shadow-emerald-500/40"
            style={{
              background: "linear-gradient(135deg, #059669, #0d9488, #0891b2)",
              border: "1px solid rgba(52, 211, 153, 0.3)",
            }}
          >
            <Terminal className="w-7 h-7 text-white" />
          </div>
          <div className="absolute -inset-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{
              background: "linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.3))",
              filter: "blur(4px)",
              zIndex: -1,
            }}
          />
        </div>
      </button>
    )
  }

  return (
    <div className="fixed top-0 right-0 bottom-0 z-50 flex flex-col w-[480px] max-w-[100vw] h-screen overflow-hidden"
      style={{
        background: "#080b11",
        border: "1px solid rgba(16, 185, 129, 0.2)",
        boxShadow: "0 0 30px rgba(16, 185, 129, 0.08), 0 0 60px rgba(6, 182, 212, 0.04), inset 0 0 80px rgba(16, 185, 129, 0.02)",
        fontFamily: "var(--font-inter), 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none z-50 opacity-[0.04]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.5) 2px, rgba(0, 0, 0, 0.5) 4px)",
        }}
      />

      {/* Grid background */}
      <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(16, 185, 129, 0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 185, 129, 0.3) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Corner decorations */}
      <div className="absolute top-0 left-0 w-4 h-4 z-50 pointer-events-none"
        style={{ borderTop: "2px solid rgba(16, 185, 129, 0.3)", borderLeft: "2px solid rgba(16, 185, 129, 0.3)" }}
      />
      <div className="absolute top-0 right-0 w-4 h-4 z-50 pointer-events-none"
        style={{ borderTop: "2px solid rgba(16, 185, 129, 0.3)", borderRight: "2px solid rgba(16, 185, 129, 0.3)" }}
      />
      <div className="absolute bottom-0 left-0 w-4 h-4 z-50 pointer-events-none"
        style={{ borderBottom: "2px solid rgba(16, 185, 129, 0.3)", borderLeft: "2px solid rgba(16, 185, 129, 0.3)" }}
      />
      <div className="absolute bottom-0 right-0 w-4 h-4 z-50 pointer-events-none"
        style={{ borderBottom: "2px solid rgba(16, 185, 129, 0.3)", borderRight: "2px solid rgba(16, 185, 129, 0.3)" }}
      />

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm transition-all duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`absolute top-0 left-0 bottom-0 z-50 w-72 transition-transform duration-300 ease-out flex flex-col border-r ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          background: "#080b11",
          borderColor: "rgba(16, 185, 129, 0.15)",
        }}
      >
        <div className="p-4 flex items-center justify-between border-b" style={{ borderColor: "rgba(16, 185, 129, 0.1)" }}>
          <h4 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
            <History className="w-3.5 h-3.5" /> SESSIONS
          </h4>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="p-1 rounded text-gray-600 hover:text-emerald-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium uppercase tracking-wider"
            style={{
              color: "rgba(16, 185, 129, 0.8)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              background: "rgba(16, 185, 129, 0.04)",
            }}
          >
            <Plus className="w-4 h-4" /> New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1 cyber-scrollbar">
          {sessions.map(s => (
            <div
              key={s.id}
              onClick={() => switchSession(s.id)}
              className={`group flex items-center justify-between px-3 py-3 cursor-pointer transition-all duration-150 ${
                activeSessionId === s.id
                  ? "border-l-2"
                  : "hover:bg-white/[0.03] border-l-2 border-transparent"
              }`}
              style={{
                borderLeftColor: activeSessionId === s.id ? "rgba(16, 185, 129, 0.6)" : "transparent",
                background: activeSessionId === s.id ? "rgba(16, 185, 129, 0.06)" : "transparent",
              }}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${activeSessionId === s.id ? 'text-emerald-400' : 'text-gray-600'}`} />
                <div className="truncate">
                  <div className={`text-[12px] truncate ${activeSessionId === s.id ? 'text-emerald-300' : 'text-gray-400'}`}>
                    {s.messages.length > 0 ? s.messages[0].content.slice(0, 30) : "New Analysis"}
                  </div>
                  <div className="text-[9px] text-gray-600 mt-0.5 font-mono">{new Date(s.timestamp).toLocaleDateString()}</div>
                </div>
              </div>
              <button
                onClick={(e) => deleteSession(e, s.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-2.5 z-10"
        style={{
          borderBottom: "1px solid rgba(16, 185, 129, 0.12)",
          background: "linear-gradient(180deg, rgba(16, 185, 129, 0.06) 0%, transparent 100%)",
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 text-gray-500 hover:text-emerald-400 transition-colors"
          >
            <Menu className="w-4.5 h-4.5" />
          </button>
          <div className="flex items-center gap-2.5">
            {/* Cyberpunk avatar */}
            <div className="relative">
              <div className="w-9 h-9 flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #059669, #0d9488)",
                  clipPath: "polygon(0 0, 100% 0, 85% 100%, 0% 100%)",
                }}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400"
                style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-400 tracking-[0.15em] glitch-text" data-text="WOODY AGENT">WOODY</span>
                <span className="text-[8px] text-emerald-500/60 font-mono tracking-wider">AGENT v3.0</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-400 inline-block"
                    style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", animation: "cyberPulse 2s ease-in-out infinite" }}
                  />
                  <span className="text-[9px] font-mono text-emerald-600/80">{symbol}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            id="ai-chat-clear"
            onClick={clearChat}
            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
            title="Clear terminal"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            id="ai-chat-close"
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-gray-600 hover:text-emerald-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="px-4 py-1.5 z-10" style={{ borderBottom: "1px solid rgba(16, 185, 129, 0.06)" }}>
        <button
          id="ai-chat-model-toggle"
          onClick={() => setShowModelSelect(!showModelSelect)}
          className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-mono transition-all duration-200"
          style={{
            background: "rgba(16, 185, 129, 0.03)",
            border: "1px solid rgba(16, 185, 129, 0.08)",
          }}
        >
          <span className="flex items-center gap-2 text-gray-500">
            <Cpu className="w-3 h-3 text-emerald-500" />
            <span className="text-emerald-600/60">&gt;</span> {currentModelName}
          </span>
          <ChevronDown
            className={`w-3 h-3 text-gray-600 transition-transform duration-200 ${showModelSelect ? "rotate-180" : ""}`}
          />
        </button>
        {showModelSelect && (
          <div
            className="mt-1 overflow-hidden"
            style={{
              background: "#0a0e15",
              border: "1px solid rgba(16, 185, 129, 0.1)",
            }}
          >
            {models.map((model) => (
              <button
                key={model.key}
                id={`ai-model-${model.key}`}
                onClick={() => {
                  setSelectedModel(model.key)
                  setShowModelSelect(false)
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left text-[11px] font-mono transition-all duration-150 ${
                  selectedModel === model.key
                    ? "text-emerald-400 border-l-2"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.02] border-l-2 border-transparent"
                }`}
                style={{
                  borderLeftColor: selectedModel === model.key ? "rgba(16, 185, 129, 0.6)" : "transparent",
                  background: selectedModel === model.key ? "rgba(16, 185, 129, 0.04)" : "transparent",
                }}
              >
                <div>
                  <div className="text-[11px]">{model.name}</div>
                  <div className="text-[9px] text-gray-600 mt-0.5">{model.provider}</div>
                </div>
                {model.free && (
                  <span className="px-1.5 py-0.5 text-emerald-600 text-[9px] font-mono"
                    style={{ border: "1px solid rgba(16, 185, 129, 0.15)" }}
                  >
                    FREE
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 cyber-scrollbar relative z-10"
        style={{ background: "rgba(0, 0, 0, 0.3)" }}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            {/* Cyberpunk boot logo */}
            <div className="relative mb-6">
              <div className="w-20 h-20 flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 182, 212, 0.05))",
                  border: "1px solid rgba(16, 185, 129, 0.15)",
                  clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                }}
              >
                <Terminal className="w-9 h-9 text-emerald-500" />
              </div>
              <div className="absolute -inset-2 opacity-30"
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.2), transparent)",
                  filter: "blur(12px)",
                  zIndex: -1,
                }}
              />
            </div>

            {/* Animated boot sequence */}
            <div className="mb-4 font-mono">
              <p className="text-emerald-400 text-xs font-bold tracking-[0.2em] mb-1">WOODY AGENT</p>
              <p className="text-emerald-600/50 text-[10px] tracking-widest">v3.0 — AI TRADING TERMINAL</p>
              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-emerald-700/50 font-mono">
                <span className="inline-block w-2 h-2 bg-emerald-500/30 animate-pulse" />
                <span>SYSTEM INITIALIZED</span>
                <span className="inline-block w-2 h-2 bg-emerald-500/30 animate-pulse" />
              </div>
            </div>

            <div className="mt-2 space-y-2 w-full">
              {[
                `> analyze ${symbol} current trend`,
                "> should I buy or sell now",
                "> explain the RSI signal",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion)
                    inputRef.current?.focus()
                  }}
                  className="w-full text-left px-3 py-2 text-[11px] font-mono transition-all duration-200"
                  style={{
                    color: "rgba(16, 185, 129, 0.5)",
                    background: "rgba(16, 185, 129, 0.03)",
                    border: "1px solid rgba(16, 185, 129, 0.06)",
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #059669, #0d9488)",
                  clipPath: "polygon(0 0, 100% 0, 80% 100%, 0% 100%)",
                }}
              >
                <Bot className="w-3 h-3 text-white" />
              </div>
            )}
            <div
              className={`text-[14px] font-sans tracking-wide leading-relaxed ${
                msg.role === "user"
                  ? "max-w-[80%] px-4 py-2.5 shadow-lg shadow-emerald-500/5"
                  : msg.isError
                  ? "max-w-[85%] px-4 py-3"
                  : "max-w-[90%] px-4 py-2"
              }`}
              style={
                msg.role === "user"
                  ? {
                      background: "rgba(16, 185, 129, 0.08)",
                      border: "1px solid rgba(16, 185, 129, 0.12)",
                      clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)",
                    }
                  : msg.isError
                  ? {
                      background: "rgba(239, 68, 68, 0.06)",
                      border: "1px solid rgba(239, 68, 68, 0.15)",
                      color: "#f87171",
                    }
                  : {
                      color: "#e2e8f0",
                    }
              }
            >
              {msg.role === "assistant" && !msg.isError ? (
                <div className="break-words">{renderMarkdown(msg.content)}</div>
              ) : (
                <div className="whitespace-pre-wrap break-words font-mono text-[12px]">{msg.content}</div>
              )}
              {msg.model && (
                <div className="mt-2 pt-1.5 border-t border-emerald-900/20 text-[9px] font-mono text-emerald-700/60 flex items-center gap-1">
                  <Cpu className="w-2 h-2" /> {models.find((m) => m.key === msg.model)?.name || msg.model}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center"
                style={{
                  background: "#1a1a2e",
                  border: "1px solid rgba(16, 185, 129, 0.15)",
                  clipPath: "polygon(20% 0%, 100% 0, 100% 100%, 0% 100%)",
                }}
              >
                <User className="w-3 h-3 text-emerald-500" />
              </div>
            )}
          </div>
        ))}

        {/* Typing effect message */}
        {isTyping && typingText && (
          <div className="flex gap-2.5 justify-start">
            <div className="flex-shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #059669, #0d9488)",
                clipPath: "polygon(0 0, 100% 0, 80% 100%, 0% 100%)",
              }}
            >
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="max-w-[90%] font-sans text-[14px] tracking-wide leading-relaxed px-4 py-2" style={{ color: "#e2e8f0" }}>
              <div className="break-words">
                {renderMarkdown(typingText)}
                <span className="typing-cursor" />
              </div>
            </div>
          </div>
        )}

        {/* Loading spinner */}
        {loading && !isTyping && (
          <div className="flex gap-2.5 justify-start">
            <div className="flex-shrink-0 w-6 h-6 mt-0.5 flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #059669, #0d9488)",
                clipPath: "polygon(0 0, 100% 0, 80% 100%, 0% 100%)",
              }}
            >
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="px-3 py-1">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-emerald-500 inline-block animate-bounce" style={{ animationDelay: '0ms', clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                  <span className="w-2 h-2 bg-emerald-500 inline-block animate-bounce" style={{ animationDelay: '150ms', clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                  <span className="w-2 h-2 bg-emerald-500 inline-block animate-bounce" style={{ animationDelay: '300ms', clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-2.5 z-10" style={{ borderTop: "1px solid rgba(16, 185, 129, 0.08)", background: "rgba(0, 0, 0, 0.5)" }}>
        <div
          className="flex items-end gap-2 px-3 py-2"
          style={{
            background: "rgba(16, 185, 129, 0.03)",
            border: "1px solid rgba(16, 185, 129, 0.08)",
          }}
        >
          <span className="text-emerald-600 font-mono text-[13px] pb-1 flex-shrink-0">&gt;</span>
          <textarea
            ref={inputRef}
            id="ai-chat-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="type a command..."
            disabled={loading}
            className="flex-1 bg-transparent text-[13px] font-mono text-emerald-200 placeholder-emerald-800 resize-none outline-none min-h-[20px] max-h-[80px] py-1 overflow-y-auto hide-scrollbar"
            style={{ lineHeight: "1.5" }}
          />
          <button
            id="ai-chat-send"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"
            style={{
              background: input.trim() && !loading
                ? "linear-gradient(135deg, #059669, #0d9488)"
                : "rgba(16, 185, 129, 0.06)",
              clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%)",
            }}
          >
            <Send className="w-3 h-3 text-white" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-1.5 px-1">
          <p className="text-[9px] font-mono text-emerald-900/50 tracking-wider">WOODY AGENT — {symbol} @ {interval}</p>
          <p className="text-[9px] font-mono text-emerald-900/50 tracking-wider">NOT FINANCIAL ADVICE</p>
        </div>
      </div>

      <style jsx>{`
        .cyber-scrollbar::-webkit-scrollbar {
          width: 3px;
        }
        .cyber-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .cyber-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.15);
        }
        .cyber-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.3);
        }
        .typing-cursor {
          display: inline-block;
          width: 6px;
          height: 14px;
          background: #10b981;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: blink-cursor 0.8s step-end infinite;
          clip-path: polygon(0 0, 100% 0, 80% 100%, 0% 100%);
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes cyberPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .glitch-text {
          position: relative;
        }
        .glitch-text::before,
        .glitch-text::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
        }
        .glitch-text::before {
          color: #06b6d4;
          z-index: -1;
        }
        .glitch-text::after {
          color: #f43f5e;
          z-index: -2;
        }
        .glitch-text:hover::before {
          animation: glitch1 0.4s ease-in-out;
          opacity: 0.8;
        }
        .glitch-text:hover::after {
          animation: glitch2 0.4s ease-in-out;
          opacity: 0.8;
        }
        @keyframes glitch1 {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 1px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, 2px); }
          80% { transform: translate(1px, -2px); }
          100% { transform: translate(0); }
        }
        @keyframes glitch2 {
          0% { transform: translate(0); }
          20% { transform: translate(2px, -1px); }
          40% { transform: translate(-2px, 1px); }
          60% { transform: translate(1px, -2px); }
          80% { transform: translate(-1px, 2px); }
          100% { transform: translate(0); }
        }
      `}</style>
    </div>
  )
}
