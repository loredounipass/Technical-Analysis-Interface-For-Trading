"use client"

import React, { createContext, useContext, useState, useEffect, useCallback } from "react"
import {
  getUser,
  isAuthenticated as checkIsAuthenticated,
  SESSION_CHANGE_EVENT,
  AUTH_REQUIRED_EVENT,
} from "./tokenManager"
import { loginUser, registerUser, logoutUser, fetchUserProfile } from "../api/authApi"
import { AuthContextType, User } from "@/types/auth"

export const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [authDialogMode, setAuthDialogMode] = useState<"login" | "register" | null>(null)
  const [authDialogMessage, setAuthDialogMessage] = useState<string | null>(null)

  // Sincronizar estado con localStorage
  const syncAuthState = useCallback(() => {
    const currentUser = getUser()
    const authenticated = checkIsAuthenticated()
    setUser(currentUser)
    setIsAuthenticated(authenticated)
  }, [])

  useEffect(() => {
    syncAuthState()
    setIsLoading(false)

    // Refrescar perfil en segundo plano si está autenticado
    if (checkIsAuthenticated()) {
      fetchUserProfile()
        .then((profile) => {
          if (profile && profile.id) {
            setUser((prev) => (prev ? { ...prev, ...profile } : profile))
          }
        })
        .catch(() => {
          // Si falla en background, no bloqueamos la app
        })
    }

    const handleSessionChange = () => {
      syncAuthState()
    }

    const handleAuthRequired = (event: any) => {
      syncAuthState()
      const msg = event?.detail?.message || "Se requiere iniciar sesión para continuar"
      setAuthDialogMessage(msg)
      setAuthDialogMode("login")
    }

    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
    window.addEventListener("storage", handleSessionChange) // sincronización multi-pestaña

    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired)
      window.removeEventListener("storage", handleSessionChange)
    }
  }, [syncAuthState])

  const openLoginDialog = useCallback((message: string | null = null) => {
    setAuthDialogMessage(message)
    setAuthDialogMode("login")
  }, [])

  const openRegisterDialog = useCallback(() => {
    setAuthDialogMessage(null)
    setAuthDialogMode("register")
  }, [])

  const closeAuthDialog = useCallback(() => {
    setAuthDialogMode(null)
    setAuthDialogMessage(null)
  }, [])

  const handleLogin = useCallback(
    async (credentials: { email: string; password: string }) => {
      const res = await loginUser(credentials)
      syncAuthState()
      closeAuthDialog()
      return res
    },
    [syncAuthState, closeAuthDialog]
  )

  const handleRegister = useCallback(
    async (data: { email: string; username: string; password: string }) => {
      const res = await registerUser(data)
      syncAuthState()
      closeAuthDialog()
      return res
    },
    [syncAuthState, closeAuthDialog]
  )

  const handleLogout = useCallback(async () => {
    await logoutUser()
    syncAuthState()
  }, [syncAuthState])

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    authDialogMode,
    authDialogMessage,
    openLoginDialog,
    openRegisterDialog,
    closeAuthDialog,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

