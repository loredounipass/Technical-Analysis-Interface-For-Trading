"use client"

import { useState, useRef, useCallback } from "react"
import { Mic, MicOff } from "lucide-react"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api"

export function MicIcon({ active }) {
  return (
    <div className="relative inline-flex items-center justify-center">
      {active ? (
        <>
          <Mic className="w-3 h-3 text-white" />
          <span
            className="absolute inset-0 rounded-full opacity-40 animate-ping"
            style={{ background: "rgba(255,255,255,0.2)", animationDuration: "2s" }}
          />
          <span
            className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-200"
            style={{ clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }}
          />
        </>
      ) : (
        <MicOff className="w-3.5 h-3.5 text-white opacity-50" />
      )}
    </div>
  )
}

export function useVoiceTTS() {
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const audioRef = useRef(null)

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
  }, [])

  const playResponse = useCallback(async (text) => {
    if (!ttsEnabled || !text) return
    stopAudio()
    try {
      const resp = await fetch(`${API_BASE_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!resp.ok) {
        console.warn("[VoiceTTS] TTS API error:", resp.status)
        return
      }
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      audio.onerror = () => {
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      await audio.play()
    } catch (e) {
      console.warn("[VoiceTTS] playback failed:", e)
    }
  }, [ttsEnabled, stopAudio])

  const toggle = useCallback(() => {
    setTtsEnabled((prev) => {
      if (prev) stopAudio()
      return !prev
    })
  }, [stopAudio])

  return { ttsEnabled, toggle, playResponse }
}