"use client"

import React, { useEffect, useState } from "react"
import {
  Sparkles,
  X,
  Zap,
  BarChart2,
  Scale,
  FileText,
  TrendingUp,
  Activity,
  Crosshair,
  Radar,
  Layers,
  ChevronRight,
  PiggyBank,
  LayoutGrid,
  ArrowUpRight,
  Flame,
} from "lucide-react"

/**
 * Barra inferior con botón que abre una ventana emergente de acciones
 * rápidas divididas en dos categorías: ESTRATEGIAS y ANÁLISIS.
 * Al hacer clic en una acción, se cierra la ventana y se envía el
 * comando directamente al agente.
 */
export default function ChatQuickActions({ symbol, interval, onSendQuickAction, disabled }) {
  const [isOpen, setIsOpen] = useState(false)

  // Cerrar la ventana emergente con la tecla Escape
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen])

  const run = (prompt) => {
    setIsOpen(false)
    onSendQuickAction(prompt)
  }

  const strategies = [
    {
      icon: Zap,
      iconColor: "text-emerald-400",
      title: "Scalping MACD + RSI",
      desc: "Entradas rápidas con cruce MACD filtrado por RSI",
      prompt: `Estrategia scalping con cruce MACD y RSI en ${symbol}`,
    },
    {
      icon: Crosshair,
      iconColor: "text-cyan-400",
      title: "Breakout de consolidación",
      desc: "Ruptura de rango con confirmación de volumen",
      prompt: `Estrategia breakout de consolidación con confirmación de volumen en ${symbol} en ${interval}`,
    },
    {
      icon: TrendingUp,
      iconColor: "text-amber-400",
      title: "Swing con medias móviles",
      desc: "Cruce EMA 20/50 con gestión de riesgo",
      prompt: `Estrategia swing trading con cruce de medias móviles EMA 20/50 en ${symbol} en ${interval}`,
    },
    {
      icon: Activity,
      iconColor: "text-rose-400",
      title: "Tendencia con ADX",
      desc: "Seguimiento de tendencia con filtro ADX > 25",
      prompt: `Estrategia de seguimiento de tendencia con ADX y SAR parabólico en ${symbol}`,
    },
    {
      icon: PiggyBank,
      iconColor: "text-emerald-400",
      title: "DCA (Promediar costo)",
      desc: "Compras periódicas para promediar el costo de entrada",
      prompt: `Estrategia DCA (dollar cost averaging) para promediar el costo de ${symbol}: plan de compras periódicas y niveles`,
    },
    {
      icon: LayoutGrid,
      iconColor: "text-cyan-400",
      title: "Grid trading",
      desc: "Órdenes escalonadas de compra/venta en rango",
      prompt: `Estrategia grid trading en rango para ${symbol} en ${interval}: niveles escalonados de compra y venta`,
    },
    {
      icon: ArrowUpRight,
      iconColor: "text-amber-400",
      title: "Cruce dorado EMA 50/200",
      desc: "Cambio de tendencia con medias exponenciales",
      prompt: `Estrategia de cruce dorado y cruce de la muerte con EMA 50/200 para ${symbol} en ${interval}`,
    },
    {
      icon: Flame,
      iconColor: "text-rose-400",
      title: "Momentum con volumen",
      desc: "Rupturas con volumen y RSI confirmando",
      prompt: `Estrategia momentum con confirmación de volumen y RSI para ${symbol} en ${interval}`,
    },
  ]

  const analyses = [
    {
      icon: BarChart2,
      iconColor: "text-cyan-400",
      title: "Soporte clave",
      desc: "Niveles de soporte y zonas de reacción",
      prompt: `Analizar soporte clave y niveles de reacción de ${symbol}`,
    },
    {
      icon: Scale,
      iconColor: "text-amber-400",
      title: "Riesgo/beneficio 1:3",
      desc: "Ratio de entrada, stop y objetivos",
      prompt: `Calcular ratio riesgo/beneficio 1:3 para ${symbol} en ${interval}`,
    },
    {
      icon: Radar,
      iconColor: "text-emerald-400",
      title: "Momentum y tendencia",
      desc: "RSI, MACD y ADX evaluados en conjunto",
      prompt: `Analizar momentum y tendencia con RSI, MACD y ADX de ${symbol}`,
    },
    {
      icon: FileText,
      iconColor: "text-rose-400",
      title: "Resumen técnico completo",
      desc: "Informe cuantitativo de todos los indicadores",
      prompt: `Resumen técnico cuantitativo completo de ${symbol}`,
    },
  ]

  const renderAction = (a) => {
    const Icon = a.icon
    return (
      <button
        key={a.title}
        onClick={() => run(a.prompt)}
        disabled={disabled}
        className="group w-full text-left bg-[#09151d]/80 hover:bg-emerald-950/50 border border-slate-700/60 hover:border-emerald-500/40 rounded-xl px-3.5 py-3 transition-all cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-start gap-3 shadow-sm"
      >
        <div className="w-9 h-9 rounded-lg bg-slate-900/70 border border-slate-700/60 flex items-center justify-center flex-shrink-0 group-hover:border-emerald-500/40 transition-colors">
          <Icon className={`w-4 h-4 ${a.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono font-bold text-slate-200 group-hover:text-white transition-colors">
            {a.title}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{a.desc}</div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-2.5" />
      </button>
    )
  }

  return (
    <>
      {/* Barra inferior con acceso a la ventana emergente */}
      <div className="px-5 py-2.5 sm:px-6 bg-[#050d12]/40 backdrop-blur-sm border-t border-emerald-500/10 flex items-center gap-3 z-10">
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 font-semibold flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Acciones Rápidas:</span>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="bg-[#09151d] hover:bg-emerald-950/60 border border-emerald-500/30 hover:border-emerald-400/60 text-xs font-mono text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap shadow-sm flex items-center gap-2 active:scale-95"
        >
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>Estrategias y Análisis</span>
          <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
            {strategies.length + analyses.length}
          </span>
        </button>
      </div>

      {/* Ventana Emergente de Acciones Rápidas */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative w-full max-w-[640px] max-h-[82vh] overflow-y-auto cyber-scrollbar rounded-2xl border border-emerald-500/30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(0,255,178,0.15)] animate-in zoom-in-95 duration-200"
            style={{
              background:
                "linear-gradient(180deg, rgba(8, 18, 25, 0.90) 0%, rgba(5, 12, 17, 0.92) 100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Encabezado de la Ventana Emergente */}
            <div className="sticky top-0 z-10 px-5 py-4 bg-[#071116]/80 backdrop-blur-md border-b border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(16,185,129,0.15)]">
                  <Sparkles className="w-4 h-4 text-cyan-300" />
                </div>
                <div>
                  <div className="text-sm font-mono font-bold tracking-wider text-white">
                    ACCIONES RÁPIDAS
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    Selecciona un comando para ejecutarlo con el agente
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/40 transition-colors"
                title="Cerrar ventana"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenido: dos cuadros separados — 1) ANÁLISIS 2) ESTRATEGIAS */}
            <div className="px-5 py-4 space-y-4">
              {/* Cuadro 1: Análisis Técnico */}
              <div className="rounded-xl border border-cyan-500/25 bg-[#071218]/50 p-3.5 shadow-lg">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-cyan-950/50 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                    <BarChart2 className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-300 uppercase">
                    1 · Análisis Técnico
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-cyan-500/30 to-transparent" />
                  <span className="text-[9px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {analyses.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {analyses.map(renderAction)}
                </div>
              </div>

              {/* Cuadro 2: Estrategias de Trading */}
              <div className="rounded-xl border border-emerald-500/25 bg-[#071218]/50 p-3.5 shadow-lg">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-950/50 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-300 uppercase">
                    2 · Estrategias de Trading
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-emerald-500/30 to-transparent" />
                  <span className="text-[9px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    {strategies.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {strategies.map(renderAction)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
