"use client"

import React, { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { showAuthRequiredToast } from "@/components/global-toast"

export function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading, openLoginDialog } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      showAuthRequiredToast(
        "Acceso protegido: Se requiere iniciar sesión para acceder al terminal de trading."
      )
      openLoginDialog("Inicia sesión para ingresar al terminal.")
      router.replace("/")
    }
  }, [isAuthenticated, isLoading, router, openLoginDialog])

  if (isLoading) {
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center p-4 bg-[#070c14] font-mono">
        <div
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(#00f5c4 1px, transparent 1px), linear-gradient(90deg, #00f5c4 1px, transparent 1px)`,
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative z-10 flex flex-col items-center justify-center text-center gap-3 w-full max-w-md mx-auto">
          <div className="w-10 h-10 rounded-xl bg-[#00f5c4]/10 border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] animate-pulse shadow-[0_0_20px_rgba(0,245,196,0.3)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00f5c4] animate-ping" />
          </div>
          <p className="text-xs font-bold text-[#00f5c4] tracking-[0.2em] uppercase">
            VERIFICANDO IDENTIDAD DE OPERADOR...
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}

