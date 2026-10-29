"use client"

import { useState } from "react"
import { useChatSession } from "./chat/useChatSession"
import ChatHeader from "./chat/ChatHeader"
import ChatTelemetryBar from "./chat/ChatTelemetryBar"
import ChatMessageList from "./chat/ChatMessageList"
import ChatQuickActions from "./chat/ChatQuickActions"
import ChatCommandBar from "./chat/ChatCommandBar"
import ChatSessionsDrawer from "./chat/ChatSessionsDrawer"
import ChatLauncherButton from "./chat/ChatLauncherButton"

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
  const [isOpen, setIsOpen] = useState(true)

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
        className="relative flex flex-col w-full max-w-[940px] h-[92vh] sm:h-[86vh] max-h-[820px] rounded-2xl overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85),0_0_35px_rgba(0,255,178,0.12)] border border-emerald-500/30 font-sans backdrop-blur-xl"
        style={{
          background: "linear-gradient(180deg, rgba(8, 18, 25, 0.76) 0%, rgba(5, 12, 17, 0.80) 100%)",
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
          currentModelName={chat.currentModelName}
          selectedModel={chat.selectedModel}
          setSelectedModel={chat.setSelectedModel}
          models={chat.models}
          showModelSelect={chat.showModelSelect}
          setShowModelSelect={chat.setShowModelSelect}
          onOpenSidebar={() => chat.setIsSidebarOpen(true)}
          onClearChat={chat.clearChat}
          onMinimize={() => setIsOpen(false)}
          onClose={() => setIsOpen(false)}
        />

        {/* 2. Barra de Telemetría de Mercado */}
        <ChatTelemetryBar
          buyerPercent={chat.marketTelemetry.buyerPercent}
          trendLabel={chat.marketTelemetry.trendLabel}
        />

        {/* 3. Área de Mensajes del Chat */}
        <ChatMessageList
          chatContainerRef={chat.chatContainerRef}
          onScroll={chat.handleScroll}
          sessionTime={chat.sessionTime}
          messages={chat.messages}
          symbol={symbol}
          interval={interval}
          models={chat.models}
          isTyping={chat.isTyping}
          typingText={chat.typingText}
          loading={chat.loading}
        />

        {/* 4. Barra de Acciones Rápidas */}
        <ChatQuickActions
          symbol={symbol}
          interval={interval}
          onSendQuickAction={chat.sendMessage}
          disabled={chat.loading}
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
