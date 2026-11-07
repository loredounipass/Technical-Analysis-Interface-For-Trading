"use client"

import React, { useState, useEffect } from "react"
import { useAuth } from "@/hooks/useAuth"
import { Activity, Radio, LogIn, UserPlus, LogOut, User } from "lucide-react"
import Link from "next/link"

export function AuthNavbar({ showLogo = true }) {
  const { user, isAuthenticated, openLoginDialog, openRegisterDialog, logout } = useAuth()
  const [time, setTime] = useState("")

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString("en-US", { hour12: false, timeZone: "UTC" }))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <nav className="w-full bg-[#070c14]/90 border-b border-[#142335] sticky top-0 z-50 backdrop-blur-md px-3 sm:px-6 py-2.5 font-mono text-xs">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-y-2.5 gap-x-4">
        {/* Left: Brand SYNAPSE */}
        {showLogo ? (
          <Link
            href="/"
            className="flex items-center gap-2.5 cursor-pointer group flex-shrink-0"
          >
            <div className="w-8 h-8 rounded-lg bg-[#00f5c4]/10 border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] shadow-[0_0_12px_rgba(0,245,196,0.3)] group-hover:scale-105 transition-transform">
              <Activity className="w-4 h-4 animate-pulse" />
            </div>
            <span className="font-extrabold tracking-wider text-white text-base sm:text-lg whitespace-nowrap group-hover:text-[#00f5c4] transition-colors">
              SYNAPSE
            </span>
          </Link>
        ) : (
          <div />
        )}

        {/* Center: System Status & UTC Time */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* Telemetry pill */}
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#0c1420] border border-[#16283d]">
            <div className="w-2 h-2 rounded-full bg-[#00f5c4] shadow-[0_0_8px_#00f5c4] animate-pulse" />
            <span className="text-[10px] text-[#00f5c4] uppercase tracking-widest font-bold hidden xs:inline">
              SYS.ON • DATA FEED ACTIVE
            </span>
            <span className="text-[10px] text-[#00f5c4] uppercase tracking-widest font-bold xs:hidden">
              SYS.ON
            </span>
          </div>

          {/* Clock UTC */}
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <span>UTC {time || "00:00:00"}</span>
          </div>

          {/* LIVE badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#0c1420] border border-[#16283d]">
            <Radio className="w-3 h-3 text-[#00f5c4]" />
            <span className="text-[10px] text-slate-300 font-bold tracking-wider">LIVE</span>
          </div>
        </div>

        {/* Right: Auth buttons / User Profile */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {!isAuthenticated ? (
            <>
              {/* Login Button */}
              <button
                type="button"
                onClick={() => openLoginDialog()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0c1420] border border-[#16283d] hover:border-[#00f5c4]/50 hover:bg-[#111d2e] text-slate-200 transition-all text-xs font-semibold tracking-wider uppercase shadow-sm"
              >
                <LogIn className="w-3.5 h-3.5 text-[#00f5c4]" />
                <span>LOGIN</span>
              </button>

              {/* Register Button */}
              <button
                type="button"
                onClick={() => openRegisterDialog()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#00f5c4] hover:bg-[#33f7d0] text-[#070c14] transition-all text-xs font-bold tracking-wider uppercase shadow-[0_0_15px_rgba(0,245,196,0.3)]"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>REGISTRO</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              {/* User Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0c1420] border border-[#00f5c4]/30 text-white shadow-[0_0_10px_rgba(0,245,196,0.1)]">
                <div className="w-5 h-5 rounded-full bg-[#00f5c4]/15 border border-[#00f5c4]/50 flex items-center justify-center text-[#00f5c4]">
                  <User className="w-3 h-3" />
                </div>
                <span className="font-bold text-xs text-slate-100 max-w-[120px] truncate">
                  {user?.username || user?.email?.split("@")[0] || "Trader"}
                </span>
              </div>

              {/* Logout Button */}
              <button
                type="button"
                onClick={() => logout()}
                title="Cerrar Sesión"
                className="p-1.5 rounded-full bg-[#0c1420] border border-[#16283d] hover:border-[#ff3b69]/50 hover:bg-[#ff3b69]/10 text-slate-400 hover:text-[#ff3b69] transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}

