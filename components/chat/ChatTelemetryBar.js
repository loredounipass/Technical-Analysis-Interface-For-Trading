"use client"

import React from "react"

/**
 * Barra de telemetría de mercado en vivo debajo del encabezado:
 * Muestra el estado REAL del libro de órdenes (depth de Binance para crypto
 * o proxy de volumen de velas para stocks) y la dominancia compradora
 * calculada con datos reales del backend.
 */
export default function ChatTelemetryBar({ buyerPercent, trendLabel, orderBookLinked, orderBookSource }) {
  const isLinked = !!orderBookLinked
  const isProxy = orderBookSource === "volume_proxy"

  const statusLabel = isLinked
    ? "ESTADO: VINCULADO AL LIBRO DE ÓRDENES"
    : isProxy
    ? "ESTADO: PROXY DE VOLUMEN — SIN LIBRO PÚBLICO"
    : "ESTADO: LIBRO DE ÓRDENES NO DISPONIBLE"

  return (
    <div className="px-5 py-2 sm:px-6 bg-[#050c10]/35 backdrop-blur-sm border-b border-emerald-500/15 flex items-center justify-between text-xs font-mono z-10 flex-wrap gap-2">
      {/* Lado Izquierdo: Estado real del libro de órdenes y dominancia compradora */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`w-2 h-2 rounded-full animate-pulse ${
            isLinked
              ? "bg-emerald-400 shadow-[0_0_8px_#10b981]"
              : "bg-amber-400 shadow-[0_0_8px_#f59e0b]"
          }`}
        />
        <span
          className={`${
            isLinked ? "text-emerald-400" : "text-amber-400"
          } font-semibold text-[10px] sm:text-[11px] tracking-wider uppercase`}
        >
          {statusLabel}
        </span>
        <span className="text-slate-600 hidden sm:inline">|</span>
        <span className="text-slate-400 text-[10px] sm:text-[11px]">
          VOLUMEN COMPRADOR: <strong className="text-white font-bold">{buyerPercent}</strong>
        </span>
      </div>
    </div>
  )
}
