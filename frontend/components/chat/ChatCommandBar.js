"use client"

import React, { useEffect, useState } from "react"
import { ArrowRight, Square } from "lucide-react"
import { MicIcon } from "../VoiceTTS"

// Altura máxima del campo en multilinea (~4 líneas de 1.4 de interlineado).
// Mas alla de ese limite el texto rueda dentro del propio campo.
const MAX_INPUT_HEIGHT = 84

/**
 * Barra de comandos inferior:
 * Símbolo de prompt verde '>', campo de entrada de texto, botón de micrófono/TTS,
 * y botón de envío o detención de respuesta.
 *
 * El texto del campo es ESTADO LOCAL: vive aqui y no en useChatSession para que
 * cada pulsacion re-renderice SOLO esta hoja, en lugar de toda la ventana del
 * chat (header + mensajes + quick actions + drawer). El texto se sube al padre
 * unicamente al enviar, via onSend(text).
 */
export default function ChatCommandBar({
  inputRef,
  onSend,
  onStop,
  loading,
  disabled = false,
  isTyping,
  ttsEnabled,
  onToggleTTS,
}) {
  const [value, setValue] = useState("")
  const busy = loading || isTyping

  // El campo crece hacia arriba a medida que se escribe (la barra está anclada
  // al final del chat, así que gana altura hacia arriba y la lista de mensajes
  // se reduce) y vuelve a su altura mínima al enviar o borrar el comando.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [value, inputRef])

  const submit = () => {
    const text = value.trim()
    if (!text || busy || disabled) return
    onSend(text)
    setValue("")
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="px-5 py-3 sm:px-6 bg-[#050c10]/45 backdrop-blur-md border-t border-emerald-500/15 z-10">
      <div className="relative bg-[#040a0e]/60 border border-emerald-500/30 focus-within:border-emerald-400/80 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-[0_0_20px_rgba(0,255,178,0.06)] transition-all">
        {/* Símbolo de prompt verde `>` */}
        <span className="text-emerald-400 font-mono font-bold text-base select-none">&gt;</span>

        {/* Campo de texto */}
        <textarea
          ref={inputRef}
          id="ai-chat-input"
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="type a command, indicator setup, or question..."
          className="flex-1 bg-transparent text-emerald-100 placeholder-slate-500 font-mono text-xs sm:text-sm outline-none resize-none py-1 min-h-[22px] max-h-[84px] overflow-y-auto overscroll-contain scrollbar-hidden"
          style={{ lineHeight: "1.4" }}
        />

        {/* Botón de Micrófono / TTS */}
        <button
          type="button"
          onClick={onToggleTTS}
          title={ttsEnabled ? "Voz activada (TTS ON)" : "Voz desactivada (TTS OFF)"}
          className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/30 rounded-lg transition-colors flex-shrink-0"
        >
          <MicIcon active={ttsEnabled} />
        </button>

        {/* Botón de Enviar o Detener */}
        {busy ? (
          <button
            id="ai-chat-stop"
            onClick={onStop}
            title="Detener respuesta"
            className="w-8 h-8 rounded-lg bg-rose-500 hover:bg-rose-400 text-white flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_10px_rgba(244,63,94,0.3)]"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        ) : (
          <button
            id="ai-chat-send"
            onClick={submit}
            disabled={!value.trim() || loading || disabled}
            title="Enviar comando"
            className="w-8 h-8 rounded-lg bg-emerald-400 hover:bg-emerald-300 active:scale-95 text-slate-950 font-bold flex items-center justify-center flex-shrink-0 transition-all shadow-[0_0_12px_rgba(52,211,153,0.35)] disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        )}
      </div>
    </div>
  )
}
