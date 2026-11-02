"use client"

import React from "react"
import { Shield, Target } from "lucide-react"
import IndicatorCard from "@/components/indicators/IndicatorCard"
import { formatLevel, levelDistance } from "@/components/indicators/indicatorFormatters"

// Fila de niveles pivote: soportes (S1-S3) y resistencias (R1-R3) con su
// fuerza estimada y distancia porcentual al precio actual.
const SupportResistancePanel = ({ datos = {}, dec = 2 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Support */}
      <IndicatorCard
        title="SUPPORT LEVELS"
        icon={<Shield className="w-3.5 h-3.5 text-[#ff3b69]" />}
      >
        <div className="space-y-1.5 font-mono">
          {[
            { level: "S1", value: datos.s1, strength: "STR", distance: levelDistance(datos.precio, datos.s1) },
            { level: "S2", value: datos.s2, strength: "MED", distance: levelDistance(datos.precio, datos.s2) },
            { level: "S3", value: datos.s3, strength: "WK", distance: levelDistance(datos.precio, datos.s3) },
          ].map((support) => (
            <div
              key={support.level}
              className="flex items-center justify-between bg-[#ff3b69]/5 hover:bg-[#ff3b69]/10 transition-colors p-2 rounded-md border border-[#ff3b69]/15"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#ff3b69] font-bold text-xs">{support.level}</span>
                <span className="text-[9px] text-slate-300 uppercase">[{support.strength}]</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-medium text-xs tabular-nums">
                  {formatLevel(support.value, dec)}
                </span>
                <span className="text-[10px] text-[#ff3b69] tabular-nums">
                  -{support.distance}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </IndicatorCard>

      {/* Resistance */}
      <IndicatorCard
        title="RESISTANCE LEVELS"
        icon={<Target className="w-3.5 h-3.5 text-[#00f5c4]" />}
      >
        <div className="space-y-1.5 font-mono">
          {[
            { level: "R1", value: datos.r1, strength: "STR", distance: levelDistance(datos.r1, datos.precio) },
            { level: "R2", value: datos.r2, strength: "MED", distance: levelDistance(datos.r2, datos.precio) },
            { level: "R3", value: datos.r3, strength: "WK", distance: levelDistance(datos.r3, datos.precio) },
          ].map((resistance) => (
            <div
              key={resistance.level}
              className="flex items-center justify-between bg-[#00f5c4]/5 hover:bg-[#00f5c4]/10 transition-colors p-2 rounded-md border border-[#00f5c4]/15"
            >
              <div className="flex items-center gap-2">
                <span className="text-[#00f5c4] font-bold text-xs">{resistance.level}</span>
                <span className="text-[9px] text-slate-300 uppercase">[{resistance.strength}]</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white font-medium text-xs tabular-nums">
                  {formatLevel(resistance.value, dec)}
                </span>
                <span className="text-[10px] text-[#00f5c4] tabular-nums">
                  +{resistance.distance}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </IndicatorCard>
    </div>
  )
}

export default React.memo(SupportResistancePanel)
