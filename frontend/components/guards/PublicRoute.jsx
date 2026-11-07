"use client"

import React from "react"

/**
 * Wrapper para rutas públicas (ej: landing page de selección de activo).
 * Permite renderizado abierto a todos los visitantes.
 */
export function PublicRoute({ children }) {
  return <>{children}</>
}

