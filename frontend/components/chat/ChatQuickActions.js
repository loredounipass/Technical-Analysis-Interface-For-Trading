"use client"

import React, { useEffect, useMemo, useState } from "react"
import { CandlestickChart, Cpu } from "lucide-react"
import QuickActionsToolbar from "./quickActions/QuickActionsToolbar"
import QuickActionsDrawer from "./quickActions/QuickActionsDrawer"
import ModelSelectorModal from "./quickActions/ModelSelectorModal"
import { buildTradingStrategyPresets } from "./quickActions/tradingStrategyPresets"
import { buildTechnicalAnalysisPresets } from "./quickActions/technicalAnalysisPresets"

/**
 * Orquestador de la barra inferior del chat. Mantiene el estado de apertura de
 * las dos ventanas emergentes (acciones rápidas y selector de modelo) y la
 * Escape-to-close, y compone tres piezas extraídas a ./quickActions/*:
 *   - QuickActionsToolbar:   la barra con los tres botones de acceso.
 *   - QuickActionsDrawer:    ventana de Estrategias + Análisis.
 *   - ModelSelectorModal:    ventana del modelo de IA.
 * Los prompts viven en los módulos de presets (puras derivaciones de symbol e
 * interval) y se memoizan aquí para NO reconstruir ~20KB de strings en cada
 * render: AiChat re-renderiza con cada tick del socket (~1.5s).
 */
export default function ChatQuickActions({
  symbol,
  interval,
  onSendQuickAction,
  disabled,
  models = [],
  selectedModel,
  setSelectedModel,
  currentModelName = "Nemotron 3 Nano Omni",
  webSearchEnabled = false,
  onToggleWebSearch,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [isModelOpen, setIsModelOpen] = useState(false)

  // Cerrar cualquier ventana emergente con la tecla Escape
  useEffect(() => {
    if (!isOpen && !isModelOpen) return
    const onKey = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false)
        setIsModelOpen(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isOpen, isModelOpen])

  // Las listas son derivaciones puras de symbol e interval. Se memoizan para
  // no reconstruir los prompts largos en cada render del chat.
  const strategies = useMemo(
    () => buildTradingStrategyPresets(symbol, interval),
    [symbol, interval]
  )
  const analyses = useMemo(
    () => buildTechnicalAnalysisPresets(symbol, interval),
    [symbol, interval]
  )

  // Definir las categorías en el orden de exhibición (1 Análisis, 2 Estrategias)
  const categories = useMemo(
    () => [
      {
        id: "analysis",
        label: "Análisis Técnico",
        category: "Análisis Técnico",
        icon: CandlestickChart,
        theme: "cyan",
        items: analyses,
      },
      {
        id: "strategy",
        label: "Estrategias de Trading",
        category: "Estrategia",
        icon: Cpu,
        theme: "emerald",
        items: strategies,
      },
    ],
    [analyses, strategies]
  )

  const run = (action, category) => {
    setIsOpen(false)
    onSendQuickAction(action.prompt, {
      title: action.title,
      category,
      desc: action.desc,
      steps: action.steps,
    })
  }

  return (
    <>
      <QuickActionsToolbar
        actionCount={strategies.length + analyses.length}
        onOpenActions={() => {
          setIsModelOpen(false)
          setIsOpen(true)
        }}
        webSearchEnabled={webSearchEnabled}
        onToggleWebSearch={onToggleWebSearch}
        currentModelName={currentModelName}
        onOpenModels={() => {
          setIsOpen(false)
          setIsModelOpen(true)
        }}
      />

      <QuickActionsDrawer
        open={isOpen}
        categories={categories}
        onClose={() => setIsOpen(false)}
        onSelect={run}
        disabled={disabled}
      />

      <ModelSelectorModal
        open={isModelOpen}
        models={models}
        selectedModel={selectedModel}
        onSelect={(key) => {
          setSelectedModel(key)
          setIsModelOpen(false)
        }}
        onClose={() => setIsModelOpen(false)}
      />
    </>
  )
}
