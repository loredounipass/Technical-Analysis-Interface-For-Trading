"use client"

import { toast as sonnerToast, Toaster } from "sonner"
import React from "react"
import { AlertCircle, CheckCircle2, AlertTriangle, Info, Lock } from "lucide-react"

/**
 * Global Toast System para SYNAPSE.
 * Centraliza todos los mensajes de notificación de la aplicación con los
 * colores, fuentes y bordes del Design System cyberpunk/futurista.
 */

const baseToastStyle: React.CSSProperties = {
  background: "#0c1420",
  border: "1px solid #16283d",
  color: "#e2e8f0",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.8125rem",
  boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.8), 0 0 15px rgba(0, 245, 196, 0.08)",
}

export function showSuccessToast(message: string, title: string = "OPERACIÓN EXITOSA") {
  sonnerToast.success(message, {
    description: title !== "OPERACIÓN EXITOSA" ? title : undefined,
    icon: <CheckCircle2 className="w-4 h-4 text-[#00f5c4]" />,
    style: {
      ...baseToastStyle,
      borderColor: "rgba(0, 245, 196, 0.4)",
      boxShadow: "0 8px 30px -5px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 245, 196, 0.15)",
    },
  })
}

export function showErrorToast(message: any, title: string = "ERROR") {
  let displayMessage = message
  if (typeof message === "object" && message !== null) {
    if (message.error) {
      displayMessage = message.error
    } else if (message.message) {
      displayMessage = message.message
    } else {
      displayMessage = JSON.stringify(message)
    }
  }

  sonnerToast.error(displayMessage || "Ocurrió un error inesperado", {
    description: title !== "ERROR" ? title : undefined,
    icon: <AlertCircle className="w-4 h-4 text-[#ff3b69]" />,
    style: {
      ...baseToastStyle,
      borderColor: "rgba(255, 59, 105, 0.4)",
      boxShadow: "0 8px 30px -5px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 59, 105, 0.2)",
    },
  })
}

export function showWarningToast(message: string, title: string = "ADVERTENCIA") {
  sonnerToast.warning(message, {
    description: title !== "ADVERTENCIA" ? title : undefined,
    icon: <AlertTriangle className="w-4 h-4 text-[#f59e0b]" />,
    style: {
      ...baseToastStyle,
      borderColor: "rgba(245, 158, 11, 0.4)",
      boxShadow: "0 8px 30px -5px rgba(0, 0, 0, 0.8), 0 0 20px rgba(245, 158, 11, 0.15)",
    },
  })
}

export function showInfoToast(message: string, title: string = "INFORMACIÓN") {
  sonnerToast.info(message, {
    description: title !== "INFORMACIÓN" ? title : undefined,
    icon: <Info className="w-4 h-4 text-cyan-400" />,
    style: {
      ...baseToastStyle,
      borderColor: "rgba(6, 182, 212, 0.4)",
      boxShadow: "0 8px 30px -5px rgba(0, 0, 0, 0.8), 0 0 20px rgba(6, 182, 212, 0.15)",
    },
  })
}

/**
 * Toast especializado para cuando se requiere sesión activa
 * (ej: al hacer clic en un activo sin haber iniciado sesión).
 */
export function showAuthRequiredToast(
  message: string = "Se requiere iniciar sesión para seleccionar un activo y acceder al terminal.",
  onLoginClick?: (() => void) | null
) {
  sonnerToast.error(message, {
    icon: <Lock className="w-4 h-4 text-[#00f5c4]" />,
    action: onLoginClick
      ? {
          label: "INICIAR SESIÓN",
          onClick: onLoginClick,
        }
      : undefined,
    style: {
      ...baseToastStyle,
      borderColor: "rgba(0, 245, 196, 0.5)",
      boxShadow: "0 8px 30px -5px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 245, 196, 0.25)",
    },
    duration: 5000,
  })
}

/**
 * Contenedor del Toast Global que se monta en el RootLayout.
 */
export function GlobalToastContainer() {
  return (
    <Toaster
      position="top-right"
      theme="dark"
      toastOptions={{
        className: "font-mono",
        style: baseToastStyle,
      }}
    />
  )
}

