"use client"

import React from "react"
import { History, X, Plus, MessageSquare, Trash2 } from "lucide-react"

/**
 * Panel lateral deslizante (Drawer) con el historial de sesiones de análisis.
 */
export default function ChatSessionsDrawer({
  isOpen,
  onClose,
  sessions,
  activeSessionId,
  onSwitchSession,
  onDeleteSession,
  onCreateNewSession,
}) {
  if (!isOpen) return null

  return (
    <div
      className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm transition-all"
      onClick={onClose}
    >
      <div
        className="w-72 h-full bg-[#070e13] border-r border-emerald-500/30 flex flex-col p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <span className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-2">
            <History className="w-4 h-4" /> SESIONES DE ANÁLISIS
          </span>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={onCreateNewSession}
          className="w-full py-2 px-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-center gap-2 hover:bg-emerald-900/50 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nueva Consulta
        </button>

        <div className="flex-1 overflow-y-auto space-y-1.5 cyber-scrollbar">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onSwitchSession(s.id)}
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
                onClick={(e) => onDeleteSession(e, s.id)}
                className="text-slate-500 hover:text-rose-400 p-1"
                title="Eliminar sesión"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
