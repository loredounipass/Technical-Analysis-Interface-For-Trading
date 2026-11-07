"use client"

import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuth } from "@/hooks/useAuth"
import { showSuccessToast, showErrorToast } from "@/components/global-toast"
import { PasswordStrengthIndicator, validatePasswordRules } from "./PasswordStrengthIndicator"
import { Activity, Eye, EyeOff, Lock, Mail, User, Loader2 } from "lucide-react"

export function RegisterDialog() {
  const { authDialogMode, closeAuthDialog, openLoginDialog, register } = useAuth()
  const isOpen = authDialogMode === "register"

  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Validación preliminar en cliente
    if (!username || !email || !password) {
      showErrorToast("Todos los campos son obligatorios")
      return
    }

    const rules = validatePasswordRules(password)
    const isPasswordValid = rules.every((r) => r.valid)
    if (!isPasswordValid) {
      showErrorToast("La contraseña no cumple con todas las políticas de seguridad")
      return
    }

    setLoading(true)
    try {
      const res = await register({
        username: username.trim(),
        email: email.trim(),
        password,
      })
      showSuccessToast(
        `Cuenta registrada con éxito. Bienvenido, ${res?.user?.username || username}`,
        "REGISTRO COMPLETADO"
      )
      setUsername("")
      setEmail("")
      setPassword("")
    } catch (err) {
      // Mostrar exactamente el error del backend (ej: "Email already registered.", "Username already taken.")
      showErrorToast(err.message || "Error al registrar la cuenta")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeAuthDialog()}>
      <DialogContent
        className="w-[92vw] max-w-md bg-[#0c1420] border-[#16283d] text-slate-100 p-6 sm:p-8 font-mono shadow-[0_20px_60px_-15px_rgba(0,0,0,0.9),0_0_30px_rgba(0,245,196,0.12)] rounded-2xl max-h-[90vh] overflow-y-auto custom-scrollbar"
      >
        <DialogHeader className="space-y-2 text-center items-center">
          <div className="w-12 h-12 rounded-2xl bg-[#09111b] border border-[#00f5c4]/40 flex items-center justify-center text-[#00f5c4] shadow-[0_0_20px_rgba(0,245,196,0.25)] mb-1">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-wider text-white">
            NUEVO OPERADOR
          </DialogTitle>
          <p className="text-xs text-slate-400 tracking-widest uppercase">
            Crear Credenciales de Acceso a SYNAPSE
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 mt-2">
          {/* Username */}
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#00f5c4]" />
              Nombre de Usuario
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="trader_pro"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111b] border border-[#16283d] text-white text-xs outline-none focus:border-[#00f5c4] focus:ring-1 focus:ring-[#00f5c4] transition-all placeholder:text-slate-600"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-[#00f5c4]" />
              Correo Electrónico
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="trader@synapse.io"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111b] border border-[#16283d] text-white text-xs outline-none focus:border-[#00f5c4] focus:ring-1 focus:ring-[#00f5c4] transition-all placeholder:text-slate-600"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5 text-left">
            <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#00f5c4]" />
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 pr-10 rounded-xl bg-[#09111b] border border-[#16283d] text-white text-xs outline-none focus:border-[#00f5c4] focus:ring-1 focus:ring-[#00f5c4] transition-all placeholder:text-slate-600"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Requisitos de Contraseña en tiempo real */}
          <PasswordStrengthIndicator password={password} />

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-widest text-[#070c14] bg-[#00f5c4] hover:bg-[#33f7d0] transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,245,196,0.3)] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>REGISTRANDO EN LA RED...</span>
              </>
            ) : (
              <span>CREAR CUENTA</span>
            )}
          </button>
        </form>

        {/* Switch to Login */}
        <div className="pt-2 text-center text-xs text-slate-400">
          ¿Ya tienes una cuenta registrada?{" "}
          <button
            type="button"
            onClick={() => openLoginDialog()}
            className="text-[#00f5c4] hover:underline font-bold transition-all ml-1"
          >
            INICIA SESIÓN AQUÍ
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

