"use client"

import React from "react"
import { Bot, MessageSquare } from "lucide-react"

/**
 * Floating Woody Agent launcher matching the screenshot design.
 */
export default function ChatLauncherButton({ onOpen, symbol = "ETHUSDT", interval = "15m" }) {
  return (
    <button
      id="ai-chat-toggle"
      onClick={onOpen}
      className="fixed bottom-5 right-5 z-50 group flex items-center gap-3 bg-[#08121c]/95 border border-[#00f5c4]/40 rounded-xl px-3.5 py-2.5 shadow-[0_0_25px_rgba(0,245,196,0.2)] hover:border-[#00f5c4] hover:shadow-[0_0_30px_rgba(0,245,196,0.35)] hover:scale-[1.02] transition-all duration-300 backdrop-blur-md"
    >
      {/* Bot Icon Box */}
      <div className="w-8 h-8 rounded-lg bg-[#00f5c4]/15 border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] shadow-[0_0_10px_rgba(0,245,196,0.2)]">
        <Bot className="w-4 h-4" />
      </div>

      {/* Details */}
      <div className="flex flex-col text-left font-mono">
        {/* Top: WOODY AGENT + v3.0 */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white tracking-wider">
            WOODY AGENT
          </span>
          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[#00f5c4]/15 border border-[#00f5c4]/30 text-[#00f5c4] font-bold">
            v3.0
          </span>
        </div>

        {/* Bottom: Status */}
        <div className="flex items-center gap-1.5 text-[10px] text-slate-300 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00f5c4] shadow-[0_0_6px_#00f5c4] animate-pulse" />
          <span>{symbol} @ {interval}</span>
          <span className="text-slate-600">•</span>
          <span className="text-[#00f5c4]">ONLINE / READY</span>
        </div>
      </div>

      {/* Right Chat Icon */}
      <div className="pl-1 text-slate-400 group-hover:text-[#00f5c4] transition-colors">
        <MessageSquare className="w-4 h-4" />
      </div>
    </button>
  )
}
