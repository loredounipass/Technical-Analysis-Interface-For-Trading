"use client"

import React from "react"

export default function IndicatorCard({
  title,
  icon,
  badge,
  children,
  footerLeft,
  footerRight,
  className = "",
}) {
  return (
    <div
      className={`synapse-card p-3.5 flex flex-col justify-between relative overflow-hidden transition-all duration-300 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-1.5 font-bold tracking-wider text-slate-300 uppercase text-[11px]">
          {icon ? (
            icon
          ) : (
            <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] shadow-[0_0_8px_#00f5c4]" />
          )}
          <span>{title}</span>
        </div>

        {badge && (
          <div className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider">
            {badge}
          </div>
        )}
      </div>

      {/* Main Body */}
      <div className="flex-1 my-1">{children}</div>

      {/* Optional Footer */}
      {(footerLeft || footerRight) && (
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-400">
          <div>{footerLeft}</div>
          <div>{footerRight}</div>
        </div>
      )}
    </div>
  )
}
