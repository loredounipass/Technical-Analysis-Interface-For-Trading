"use client"

import { useState, useEffect } from "react"
import { useChatSession } from "./chat/useChatSession"
import ChatHeader from "./chat/ChatHeader"
import ChatTelemetryBar from "./chat/ChatTelemetryBar"
import ChatMessageList from "./chat/ChatMessageList"
import ChatQuickActions from "./chat/ChatQuickActions"
import ChatCommandBar from "./chat/ChatCommandBar"
import ChatSessionsDrawer from "./chat/ChatSessionsDrawer"
import ChatLauncherButton from "./chat/ChatLauncherButton"

// Clave de localStorage para recordar si el terminal estaba abierto.
const CHAT_OPEN_KEY = "trading_terminal_open"

/**
 * Componente Principal AiChat (Woody Agent Terminal):
 * Actúa como orquestador componiendo los submódulos especializados:
 * - useChatSession: Estado, API, sesiones y telemetría
 * - ChatHeader: Encabezado superior y controles
 * - ChatTelemetryBar: Telemetría de libro de órdenes y tendencia
 * - ChatMessageList: Mensajes, diagnósticos y streaming
 * - ChatQuickActions: Barra de píldoras de acción rápida
 * - ChatCommandBar: Entrada de comandos, voz y pie de página
 * - ChatSessionsDrawer: Historial deslizable de sesiones
 * - ChatLauncherButton: Botón de reapertura cuando está minimizado
 */
export default function AiChat({ symbol, datos, interval = "15m", market = "crypto", onAnalysisChange }) {
  // Estado de apertura persistido: el chat debe seguir abierto tras un refresh
  // y cerrarse SOLO cuando el usuario lo cierra desde la X. Se restaura en
  // cliente (no en el render inicial de SSR) para evitar un mismatch de
  // hidratación, ya que el subárbol cambia (lanzador flotante vs ventana).
  const [isOpen, setIsOpen] = useState(false)
  const [chatHydrated, setChatHydrated] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAT_OPEN_KEY) === "true") setIsOpen(true)
    } catch {
      // localStorage no disponible
    }
    setChatHydrated(true)
  }, [])

  useEffect(() => {
    if (!chatHydrated) return
    try {
      localStorage.setItem(CHAT_OPEN_KEY, String(isOpen))
    } catch {
      // localStorage no disponible
    }
  }, [isOpen, chatHydrated])

  const chat = useChatSession({
    symbol,
    datos,
    interval,
    market,
    onAnalysisChange,
    isOpen,
  })

  // Si el terminal está minimizado, mostrar solo el botón lanzador flotante
  if (!isOpen) {
    return (
      <ChatLauncherButton
        onOpen={() => setIsOpen(true)}
        symbol={symbol}
        interval={interval}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/35 backdrop-blur-[2px] animate-in fade-in duration-200">
      {/* Contenedor Principal de la Ventana del Chat (Translúcido / Glassmorphism) */}
      <div
        className="relative flex flex-col w-full max-w-[1080px] h-[92vh] sm:h-[86vh] max-h-[820px] rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(0,255,178,0.12)] border border-emerald-500/30 font-sans backdrop-blur-xl"
        style={{
          background: "linear-gradient(180deg, rgba(8, 18, 25, 0.52) 0%, rgba(5, 12, 17, 0.58) 100%)",
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

        {/* Panel lateral deslizable de sesiones previas */}
        <ChatSessionsDrawer
          isOpen={chat.isSidebarOpen}
          onClose={() => chat.setIsSidebarOpen(false)}
          sessions={chat.sessions}
          activeSessionId={chat.activeSessionId}
          onSwitchSession={chat.switchSession}
          onDeleteSession={chat.deleteSession}
          onCreateNewSession={chat.createNewSession}
        />

        {/* 1. Encabezado de la Ventana */}
        <ChatHeader
          symbol={symbol}
          interval={interval}
          price={datos?.precio}
          decimals={datos?.decimales}
          onOpenSidebar={() => chat.setIsSidebarOpen(true)}
          onNewChat={chat.createNewSession}
          onClearChat={chat.clearChat}
          onMinimize={() => setIsOpen(false)}
          onClose={() => setIsOpen(false)}
        />

        {/* 2. Barra de Telemetría de Mercado */}
        <ChatTelemetryBar
          buyerPercent={chat.marketTelemetry.buyerPercent}
          trendLabel={chat.marketTelemetry.trendLabel}
          orderBookLinked={chat.marketTelemetry.orderBookLinked}
          orderBookSource={chat.marketTelemetry.orderBookSource}
        />

        {/* 3. Área de Mensajes del Chat */}
        <ChatMessageList
          chatContainerRef={chat.chatContainerRef}
          onScroll={chat.handleScroll}
          messages={chat.messages}
          symbol={symbol}
          interval={interval}
          models={chat.models}
          selectedModel={chat.selectedModel}
          isTyping={chat.isTyping}
          typingText={chat.typingText}
          loading={chat.loading}
          streamingThought={chat.streamingThought}
          isThinking={chat.isThinking}
        />

        {/* 4. Barra de Acciones Rápidas */}
        <ChatQuickActions
          symbol={symbol}
          interval={interval}
          onSendQuickAction={chat.sendMessage}
          disabled={chat.loading}
          models={chat.models}
          selectedModel={chat.selectedModel}
          setSelectedModel={chat.setSelectedModel}
          currentModelName={chat.currentModelName}
          webSearchEnabled={chat.webSearchEnabled}
          onToggleWebSearch={chat.toggleWebSearch}
        />

        {/* 5. Barra de Entrada de Comandos */}
        <ChatCommandBar
          input={chat.input}
          setInput={chat.setInput}
          inputRef={chat.inputRef}
          onKeyDown={chat.handleKeyDown}
          onSend={chat.sendMessage}
          onStop={chat.stopGeneration}
          loading={chat.loading}
          isTyping={chat.isTyping}
          ttsEnabled={chat.ttsEnabled}
          onToggleTTS={chat.toggleTTS}
          symbol={symbol}
          interval={interval}
          selectedModel={chat.selectedModel}
        />
      </div>
    </div>
  )
}
