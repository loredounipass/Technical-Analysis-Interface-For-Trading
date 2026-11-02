"use client"

import React from "react"
import { MessageSquare } from "lucide-react"
import WoodyAgentIcon from "./WoodyAgentIcon"

/**
 * Floating Woody Agent launcher: compact pill with the robot-trader icon,
 * the agent name and a chat glyph. No version / pair / status noise.
 */
export default function ChatLauncherButton({ onOpen }) {
  return (
    <div className="fixed bottom-8 right-5 z-50 animate-woody-bob">
      <button
        id="ai-chat-toggle"
        onClick={onOpen}
        className="group flex items-center gap-3 bg-[#08121c]/95 border border-[#00f5c4]/40 rounded-xl px-3.5 py-2.5 shadow-[0_0_25px_rgba(0,245,196,0.2)] hover:border-[#00f5c4] hover:shadow-[0_0_30px_rgba(0,245,196,0.35)] hover:scale-[1.02] transition-all duration-300 backdrop-blur-md"
      >
        {/* Bot Icon Box */}
        <div className="w-8 h-8 rounded-lg bg-[#00f5c4]/15 border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] shadow-[0_0_10px_rgba(0,245,196,0.2)]">
          <WoodyAgentIcon className="w-5 h-5 text-[#00f5c4]" />
        </div>

        {/* Label: just the agent name */}
        <span className="text-xs font-bold text-white tracking-wider font-mono">
          WOODY AGENT
        </span>

        {/* Right Chat Icon */}
        <div className="pl-1 text-slate-400 group-hover:text-[#00f5c4] transition-colors">
          <MessageSquare className="w-4 h-4" />
        </div>
      </button>
    </div>
  )
}
