"use client"

import React from "react"
import { X } from "lucide-react"

/**
 * Shell de modal a pantalla completa (overlay + panel centrado con header,
 * cuerpo y botón de cierre). Reutilizado por el drawer de acciones rápidas y
 * el selector de modelos, para que ambos compartan el mismo patrón de cierre
 * (clic en el overlay o tecla X) y el mismo esqueleto visual.
 */
export default function QuickActionModal({
  title,
  subtitle,
  HeaderIcon,
  accent = "emerald",
  panelMaxWidth = "max-w-[640px]",
  labelledBy,
  onClose,
  children,
}) {
  const accents = {
    emerald: {
      panel: "border-emerald-500/30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(0,255,178,0.15)]",
      header: "border-emerald-500/20",
      badge: "bg-emerald-950/40 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]",
      icon: "text-cyan-300",
    },
    cyan: {
      panel: "border-cyan-500/30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(34,211,238,0.12)]",
      header: "border-cyan-500/20",
      badge: "bg-cyan-950/40 border-cyan-500/40",
      icon: "text-cyan-300",
    },
  }
  const a = accents[accent] || accents.emerald

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative w-full ${panelMaxWidth} max-h-[82vh] overflow-y-auto overscroll-contain cyber-scrollbar rounded-2xl ${a.panel} animate-in zoom-in-95 duration-200`}
        style={{
          background:
            "linear-gradient(180deg, rgba(8, 18, 25, 0.90) 0%, rgba(5, 12, 17, 0.92) 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado del modal */}
        <div className={`sticky top-0 z-10 px-5 py-4 bg-[#071116]/80 backdrop-blur-md border-b ${a.header} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${a.badge}`}>
              <HeaderIcon className={`w-4 h-4 ${a.icon}`} />
            </div>
            <div>
              <div id={labelledBy} className="text-sm font-mono font-bold tracking-wider text-white">
                {title}
              </div>
              <div className="text-[10px] font-mono text-slate-500">{subtitle}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/40 transition-colors"
            title="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
