"use client"

import { useState, useEffect, useRef } from "react"
import { Send, Bot, User, Trash2, ChevronDown, Cpu, Sparkles, MessageSquare, X, Loader2 } from "lucide-react"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api"

// Simple markdown renderer for ChatGPT-style formatting
function renderMarkdown(text) {
  if (!text) return null
  const lines = text.split("\n")
  const elements = []
  let listItems = []

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="my-1.5 ml-4 space-y-0.5 list-disc marker:text-gray-500">
          {listItems}
        </ul>
      )
      listItems = []
    }
  }

  const formatInline = (line, keyPrefix) => {
    // Bold **text**
    const parts = []
    const regex = /\*\*(.+?)\*\*/g
    let last = 0
    let match
    while ((match = regex.exec(line)) !== null) {
      if (match.index > last) parts.push(line.slice(last, match.index))
      parts.push(<strong key={`${keyPrefix}-b-${match.index}`} className="font-semibold text-white">{match[1]}</strong>)
      last = regex.lastIndex
    }
    if (last < line.length) parts.push(line.slice(last))
    return parts.length > 0 ? parts : line
  }

  lines.forEach((line, i) => {
    const trimmed = line.trim()

    // Headings
    if (trimmed.startsWith("### ")) {
      flushList()
      elements.push(<h4 key={i} className="font-semibold text-white text-[13px] mt-3 mb-1">{formatInline(trimmed.slice(4), i)}</h4>)
    } else if (trimmed.startsWith("## ")) {
      flushList()
      elements.push(<h3 key={i} className="font-semibold text-white text-sm mt-3 mb-1">{formatInline(trimmed.slice(3), i)}</h3>)
    } else if (trimmed.startsWith("# ")) {
      flushList()
      elements.push(<h2 key={i} className="font-bold text-white text-[15px] mt-3 mb-1">{formatInline(trimmed.slice(2), i)}</h2>)
    }
    // Bullet list items
    else if (/^[-*•]\s/.test(trimmed)) {
      listItems.push(<li key={i} className="text-gray-300">{formatInline(trimmed.replace(/^[-*•]\s/, ""), i)}</li>)
    }
    // Numbered list items
    else if (/^\d+\.\s/.test(trimmed)) {
      flushList()
      elements.push(
        <div key={i} className="my-0.5 flex gap-1.5">
          <span className="text-gray-500 flex-shrink-0">{trimmed.match(/^\d+\./)[0]}</span>
          <span className="text-gray-300">{formatInline(trimmed.replace(/^\d+\.\s/, ""), i)}</span>
        </div>
      )
    }
    // Empty line
    else if (trimmed === "") {
      flushList()
      elements.push(<div key={i} className="h-2" />)
    }
    // Regular paragraph
    else {
      flushList()
      elements.push(<p key={i} className="text-gray-300 my-0.5">{formatInline(trimmed, i)}</p>)
    }
  })
  flushList()
  return elements
}

export default function AiChat({ symbol, datos }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState("nvidia-llama")
  const [isOpen, setIsOpen] = useState(false)
  const [showModelSelect, setShowModelSelect] = useState(false)
  const [typingText, setTypingText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const typingRef = useRef(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  // Fetch available models
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
        // Fallback models
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

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, typingText])

  // Cleanup typing interval on unmount
  useEffect(() => {
    return () => { if (typingRef.current) clearInterval(typingRef.current) }
  }, [])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  // Typewriter effect: reveal text word by word
  const startTypingEffect = (fullText, model) => {
    setIsTyping(true)
    setTypingText("")
    const words = fullText.split(/( )/)
    let idx = 0
    const speed = 18 // ms per word chunk

    typingRef.current = setInterval(() => {
      // Reveal a few characters at a time for natural speed
      const chunk = words.slice(0, idx + 2).join("")
      idx += 2
      setTypingText(chunk)

      if (idx >= words.length) {
        clearInterval(typingRef.current)
        typingRef.current = null
        setIsTyping(false)
        setTypingText("")
        // Add the completed message
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

    // Build history for the API (only role + content)
    const history = messages.map((m) => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          model: selectedModel,
          symbol: symbol,
          history: history,
          temperature: 0.3,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        const errMsg = data.error || `Error ${res.status}`
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `⚠️ ${errMsg}`, timestamp: Date.now(), isError: true },
        ])
      } else {
        // Start typing effect instead of showing all at once
        startTypingEffect(data.response, data.model)
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Connection error. Make sure the backend is running.",
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

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        id="ai-chat-toggle"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 group"
      >
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full blur-lg opacity-60 group-hover:opacity-100 transition-opacity duration-300 animate-pulse" />
          <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-br from-emerald-500 via-emerald-600 to-cyan-600 rounded-full shadow-2xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-300 hover:scale-110">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-cyan-500" />
          </span>
        </div>
      </button>
    )
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col w-[420px] max-w-[calc(100vw-2rem)] h-[620px] max-h-[calc(100vh-3rem)] rounded-2xl overflow-hidden shadow-2xl shadow-black/50"
      style={{
        background: "linear-gradient(135deg, #0c0f14 0%, #111827 50%, #0c1220 100%)",
        border: "1px solid rgba(16, 185, 129, 0.15)",
        fontFamily: "var(--font-inter), 'Segoe UI', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-900/30"
        style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(6, 182, 212, 0.05))" }}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-gray-900" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              Trading Agent
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </h3>
            <p className="text-[10px] text-emerald-400/70">{symbol} • Live Data</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            id="ai-chat-clear"
            onClick={clearChat}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all duration-200"
            title="Clear chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            id="ai-chat-close"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div className="px-4 py-2 border-b border-gray-800/50">
        <button
          id="ai-chat-model-toggle"
          onClick={() => setShowModelSelect(!showModelSelect)}
          className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs transition-all duration-200"
          style={{
            background: "rgba(16, 185, 129, 0.06)",
            border: "1px solid rgba(16, 185, 129, 0.12)",
          }}
        >
          <span className="flex items-center gap-2 text-gray-300">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" />
            {currentModelName}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${showModelSelect ? "rotate-180" : ""}`}
          />
        </button>
        {showModelSelect && (
          <div
            className="mt-2 rounded-xl overflow-hidden"
            style={{
              background: "rgba(17, 24, 39, 0.95)",
              border: "1px solid rgba(16, 185, 129, 0.1)",
              backdropFilter: "blur(20px)",
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
                className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-xs transition-all duration-150 ${
                  selectedModel === model.key
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
              >
                <div>
                  <div className="font-medium">{model.name}</div>
                  <div className="text-[10px] opacity-50 mt-0.5">{model.provider}</div>
                </div>
                {model.free && (
                  <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded text-[10px] font-semibold">
                    FREE
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 custom-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center mb-4 border border-emerald-500/10">
              <Bot className="w-8 h-8 text-emerald-400" />
            </div>
            <h4 className="text-sm font-semibold text-white mb-2">Senior Trading Agent</h4>
            <p className="text-xs text-gray-500 leading-relaxed max-w-[260px]">
              Crypto trader expert specialized in technical analysis & algorithms. Real-time data from your indicators.
            </p>
            <div className="mt-4 space-y-2 w-full">
              {[
                `Analyze ${symbol} current trend`,
                "Should I buy or sell now?",
                "Explain the RSI signal",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion)
                    inputRef.current?.focus()
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-emerald-300 transition-all duration-200"
                  style={{
                    background: "rgba(16, 185, 129, 0.04)",
                    border: "1px solid rgba(16, 185, 129, 0.08)",
                  }}
                >
                  <span className="text-emerald-500 mr-1.5">→</span>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center mt-0.5">
                <Bot className="w-3.5 h-3.5 text-white" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-[1.6] ${
                msg.role === "user"
                  ? "bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-br-md"
                  : msg.isError
                  ? "bg-red-500/10 border border-red-500/20 text-red-300 rounded-bl-md"
                  : "bg-transparent text-gray-200 rounded-bl-md"
              }`}
            >
              {msg.role === "assistant" && !msg.isError ? (
                <div className="break-words">{renderMarkdown(msg.content)}</div>
              ) : (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              )}
              {msg.model && (
                <div className="mt-2 pt-1.5 border-t border-gray-800/50 text-[10px] text-gray-500 flex items-center gap-1">
                  <Cpu className="w-2.5 h-2.5" /> {models.find((m) => m.key === msg.model)?.name || msg.model}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mt-0.5">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </div>
        ))}

        {/* Typing effect message */}
        {isTyping && typingText && (
          <div className="flex gap-2.5 justify-start animate-fade-in">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center mt-0.5">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="max-w-[85%] rounded-2xl px-4 py-3 text-[13px] leading-[1.6] bg-transparent text-gray-200 rounded-bl-md">
              <div className="break-words">
                {renderMarkdown(typingText)}
                <span className="typing-cursor" />
              </div>
            </div>
          </div>
        )}

        {/* Loading spinner (waiting for API) */}
        {loading && !isTyping && (
          <div className="flex gap-2.5 justify-start animate-fade-in">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-gray-800/60 border border-gray-700/30 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-800/50"
        style={{ background: "rgba(17, 24, 39, 0.5)" }}
      >
        <div
          className="flex items-end gap-2 rounded-xl px-3 py-2"
          style={{
            background: "rgba(31, 41, 55, 0.5)",
            border: "1px solid rgba(16, 185, 129, 0.1)",
          }}
        >
          <textarea
            ref={inputRef}
            id="ai-chat-input"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the market..."
            disabled={loading}
            className="flex-1 bg-transparent text-[13px] text-white placeholder-gray-600 resize-none outline-none min-h-[20px] max-h-[80px] py-1"
            style={{ lineHeight: "1.5" }}
          />
          <button
            id="ai-chat-send"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: input.trim() && !loading
                ? "linear-gradient(135deg, #10b981, #06b6d4)"
                : "rgba(55, 65, 81, 0.5)",
            }}
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
        <p className="text-[10px] text-gray-600 text-center mt-2">
          AI can make mistakes • Not financial advice
        </p>
      </div>

      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(16, 185, 129, 0.2);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(16, 185, 129, 0.4);
        }
        .typing-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: #10b981;
          margin-left: 2px;
          vertical-align: text-bottom;
          animation: blink-cursor 0.8s step-end infinite;
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
