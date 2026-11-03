"use client"

import React from "react"
import { Check, Cpu } from "lucide-react"
import QuickActionModal from "./QuickActionModal"

/**
 * Ventana emergente del SELECTOR DE MODELO de IA. Lista los modelos
 * disponibles (name/provider/reasoning/free) y permite elegir uno. Es
 * presentación pura: recibe `models` y despacha `onSelect(key)`.
 */
export default function ModelSelectorModal({
  open,
  models = [],
  selectedModel,
  onSelect,
  onClose,
}) {
  if (!open) return null
  return (
    <QuickActionModal
      title="MODELO DE IA"
      subtitle="Selecciona el motor para las próximas respuestas"
      HeaderIcon={Cpu}
      accent="cyan"
      panelMaxWidth="max-w-[480px]"
      labelledBy="model-selector-title"
      onClose={onClose}
    >
      <div className="p-4 space-y-2.5">
        {models.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-[#09151d]/80 px-4 py-5 text-center text-xs font-mono text-slate-500">
            Cargando modelos disponibles...
          </div>
        )}
        {models.map((model) => {
          const isSelected = selectedModel === model.key
          return (
            <button
              type="button"
              key={model.key}
              onClick={() => onSelect(model.key)}
              aria-pressed={isSelected}
              className={`w-full text-left rounded-xl border px-4 py-3.5 transition-all flex items-center gap-3 ${
                isSelected
                  ? "bg-emerald-950/50 border-emerald-500/60 shadow-[0_0_18px_rgba(16,185,129,0.08)]"
                  : "bg-[#09151d]/80 border-slate-700/60 hover:border-cyan-500/50 hover:bg-cyan-950/30"
              }`}
            >
              <div className={`w-9 h-9 rounded-lg border flex items-center justify-center flex-shrink-0 ${
                isSelected
                  ? "bg-emerald-950/60 border-emerald-500/40"
                  : "bg-slate-900/70 border-slate-700/60"
              }`}>
                <Cpu className={`w-4 h-4 ${isSelected ? "text-emerald-400" : "text-cyan-400"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-mono font-bold truncate ${isSelected ? "text-emerald-300" : "text-slate-200"}`}>
                  {model.name}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                    {model.provider}
                  </span>
                  <span
                    title={model.reasoning ? "Muestra su razonamiento paso a paso" : "Responde directo, sin cadena de pensamiento"}
                    className={`text-[8.5px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${
                      model.reasoning
                        ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                        : "text-amber-300 bg-amber-500/10 border-amber-500/30"
                    }`}
                  >
                    {model.reasoning ? "Razona" : "Rapido"}
                  </span>
                </div>
              </div>
              {model.free && (
                <span className="text-[9px] font-mono font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-full flex-shrink-0">
                  GRATIS
                </span>
              )}
              {isSelected && <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
            </button>
          )
        })}
      </div>
    </QuickActionModal>
  )
}
