"use client"

import React from "react"
import { Compass, CircleDollarSign } from "lucide-react"
import IndicatorCard from "@/components/indicators/IndicatorCard"
import { fmt } from "@/components/indicators/indicatorFormatters"

// Fila de osciladores de momentum/flujo: CCI (20) + MFI (14) con sus
// badges de estado y barras de rango.
const MomentumOscillatorsPanel = ({ datos = {} }) => {
  // MFI: oscilador direccional de flujo de dinero (usa quote-volume real).
  // Convencion global: alto (>=50, inflow/overbought) = verde, bajo (<50,
  // outflow/oversold) = rojo. Sin amarillo. >80 = Acumulacion (OB),
  // <20 = Distribucion (OS).
  const mfiVal = Number(datos.mfi ?? 50)
  const mfiGreen = mfiVal >= 50
  const mfiBadgeCls = mfiGreen
    ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
    : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
  const mfiLabel =
    mfiVal > 80 ? "Accumulation (OB)" : mfiVal < 20 ? "Distribution (OS)" : mfiGreen ? "Net Inflow" : "Net Outflow"
  const mfiTextCls = mfiGreen ? "text-[#00f5c4]" : "text-[#ff3b69]"
  const mfiBarCls = mfiGreen ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]" : "bg-[#ff3b69] shadow-[0_0_8px_#ff3b69]"

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* CCI Indicator */}
      <IndicatorCard
        title="CCI (20)"
        icon={<Compass className="w-3.5 h-3.5 text-amber-400" />}
        badge={
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${datos.cci > 100
                ? "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
                : datos.cci < -100
                  ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
                  : "bg-amber-500/15 border border-amber-500/40 text-amber-400"
              }`}
          >
            {datos.cci > 100 ? "OB (+100)" : datos.cci < -100 ? "OS (-100)" : "Range"}
          </span>
        }
      >
        <div className="space-y-2.5 font-mono">
          <div className="flex justify-between items-center bg-[#09111b] p-2.5 rounded-md border border-[#16283d]">
            <span className="text-[10px] text-slate-300 uppercase tracking-wider">Commodity Channel Index</span>
            <span
              className={`text-lg font-bold tabular-nums ${datos.cci > 100
                  ? "text-[#ff3b69]"
                  : datos.cci < -100
                    ? "text-[#00f5c4]"
                    : "text-amber-400"
                }`}
            >
              {fmt(datos.cci)}
            </span>
          </div>
          <div className="w-full bg-[#08111a] rounded-full h-1.5 relative overflow-hidden flex items-center">
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-slate-500 z-10" />
            <div
              className={`h-full transition-all duration-300 ${datos.cci > 100
                  ? "bg-[#ff3b69] shadow-[0_0_8px_#ff3b69]"
                  : datos.cci < -100
                    ? "bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]"
                    : "bg-amber-400"
                }`}
              style={{
                width: `${Math.min((Math.abs(datos.cci || 0) / 200) * 50, 50)}%`,
                marginLeft:
                  (datos.cci || 0) < 0
                    ? `${Math.max(50 - Math.min((Math.abs(datos.cci || 0) / 200) * 50, 50), 0)}%`
                    : "50%",
              }}
            />
          </div>
        </div>
      </IndicatorCard>

      {/* MFI (14) Money Flow Index Indicator */}
      <IndicatorCard
        title="MFI (14) MONEY FLOW"
        icon={<CircleDollarSign className="w-3.5 h-3.5 text-[#00f5c4]" />}
        badge={
          <span
            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${mfiBadgeCls}`}
          >
            {mfiLabel}
          </span>
        }
      >
        <div className="space-y-2.5 font-mono">
          <div className="flex justify-between items-center bg-[#09111b] p-2.5 rounded-md border border-[#16283d]">
            <span className="text-[10px] text-slate-300 uppercase tracking-wider">Institutional Flow Index</span>
            <span className={`text-lg font-bold tabular-nums ${mfiTextCls}`}>
              {fmt(datos.mfi ?? 50.0)}
            </span>
          </div>
          <div className="w-full bg-[#08111a] rounded-full h-1.5 relative overflow-hidden flex items-center">
            {/* Reference markers at 20% and 80% */}
            <div className="absolute left-[20%] top-0 bottom-0 w-[1px] bg-slate-600 z-10" />
            <div className="absolute left-[80%] top-0 bottom-0 w-[1px] bg-slate-600 z-10" />
            <div
              className={`h-full transition-all duration-300 ${mfiBarCls}`}
              style={{
                width: `${Math.min(100, Math.max(0, datos.mfi ?? 50))}%`,
              }}
            />
          </div>
        </div>
      </IndicatorCard>
    </div>
  )
}

export default React.memo(MomentumOscillatorsPanel)
