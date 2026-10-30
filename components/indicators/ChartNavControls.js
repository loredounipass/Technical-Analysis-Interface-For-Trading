"use client"

import React from "react"
import { ChevronsLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Radio } from "lucide-react"

/**
 * Botones compactos de navegacion (pan atras/adelante, zoom, volver al vivo)
 * compartidos por el grafico principal y las tarjetas de indicadores.
 */
export default function ChartNavControls({
  onGoStart,
  onPanLeft,
  onPanRight,
  onZoomIn,
  onZoomOut,
  isLive,
  onGoLive,
}) {
  const navBtnClass =
    "p-1 rounded-md text-slate-400 hover:text-[#00f5c4] hover:bg-[#00f5c4]/10 border border-transparent hover:border-[#00f5c4]/30 transition-colors"

  return (
    <div className="flex items-center gap-0.5 bg-[#09111b] border border-[#16283d] rounded-lg px-1 py-0.5">
      {onGoStart && (
        <button onClick={onGoStart} className={navBtnClass} title="Ir al inicio del historial">
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
      )}
      <button onClick={onPanLeft} className={navBtnClass} title="Ir atrás en el tiempo">
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button onClick={onPanRight} className={navBtnClass} title="Ir adelante en el tiempo">
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
      <span className="w-px h-3.5 bg-[#16283d] mx-0.5" />
      <button onClick={onZoomIn} className={navBtnClass} title="Acercar (zoom in)">
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
      <button onClick={onZoomOut} className={navBtnClass} title="Alejar (zoom out)">
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      {!isLive && (
        <>
          <span className="w-px h-3.5 bg-[#16283d] mx-0.5" />
          <button
            onClick={onGoLive}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[#00f5c4] hover:bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[9px] font-bold tracking-wider transition-colors"
            title="Volver al precio en vivo"
          >
            <Radio className="w-3 h-3" />
            LIVE
          </button>
        </>
      )}
    </div>
  )
}
