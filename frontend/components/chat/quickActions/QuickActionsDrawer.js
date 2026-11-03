"use client"

import React from "react"
import { Bot, CandlestickChart, Cpu } from "lucide-react"
import QuickActionModal from "./QuickActionModal"
import QuickActionItem from "./QuickActionItem"

/**
 * Ventana emergente de ACCIONES RÁPIDAS: muestra dos secciones (Análisis
 * Técnico y Estrategias de Trading) como cajas temáticas con su propio acento
 * cromático. Es una presentación pura — no tiene estado de apertura ni conoce
 * los prompts; recibe los presets ya construidos y despacha onSelect.
 */

// Tokens visuales por acento de sección (clases literales para Tailwind JIT)
const SECTION_THEMES = {
  cyan: {
    box: "border-cyan-500/25",
    chip: "bg-cyan-950/50 border-cyan-500/30",
    label: "text-cyan-300",
    icon: "text-cyan-400",
    rule: "from-cyan-500/30",
  },
  emerald: {
    box: "border-emerald-500/25",
    chip: "bg-emerald-950/50 border-emerald-500/30",
    label: "text-emerald-300",
    icon: "text-emerald-400",
    rule: "from-emerald-500/30",
  },
}

function ActionSection({ index, label, category, SectionIcon, theme, count, actions, onSelect, disabled }) {
  const t = SECTION_THEMES[theme]
  return (
    <div className={`rounded-xl ${t.box} bg-[#071218]/50 p-3.5 shadow-lg`}>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${t.chip}`}>
          <SectionIcon className={`w-3.5 h-3.5 ${t.icon}`} />
        </div>
        <span className={`text-[10px] font-mono font-bold tracking-widest uppercase ${t.label}`}>
          {index} · {label}
        </span>
        <div className={`flex-1 h-px bg-gradient-to-r ${t.rule} to-transparent`} />
        <span className="text-[9px] font-mono text-slate-500 bg-slate-900/60 border border-slate-800 px-1.5 py-0.5 rounded-full flex-shrink-0">
          {count}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {actions.map((a) => (
          <QuickActionItem
            key={a.title}
            action={a}
            onSelect={(action) => onSelect(action, category)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  )
}

export default function QuickActionsDrawer({ open, categories, onClose, onSelect, disabled }) {
  if (!open) return null
  return (
    <QuickActionModal
      title="WOODY AGENT • ACCIONES RÁPIDAS"
      subtitle="Selecciona un comando para ejecutarlo con el agente"
      HeaderIcon={Bot}
      accent="emerald"
      panelMaxWidth="max-w-[640px]"
      labelledBy="quick-actions-title"
      onClose={onClose}
    >
      {/* Contenido: cajas por categoría (1) Análisis, (2) Estrategias */}
      <div className="px-5 py-4 space-y-4">
        {categories.map((cat, i) => (
          <ActionSection
            key={cat.id}
            index={i + 1}
            label={cat.label}
            category={cat.category}
            SectionIcon={cat.icon || Cpu}
            theme={cat.theme}
            count={cat.items.length}
            actions={cat.items}
            onSelect={onSelect}
            disabled={disabled}
          />
        ))}
      </div>
    </QuickActionModal>
  )
}
