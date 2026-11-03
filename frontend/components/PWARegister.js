"use client"

import { useEffect } from "react"

/**
 * Registra el service worker (app shell offline + instalacion PWA en iOS).
 * Montado una sola vez en el layout. No renderiza nada.
 *
 * Solo en produccion: en dev el SW queda cacheado entre hot-reloads y complica
 * el desarrollo. El SW ignora /api y /socket.io (ver public/sw.js), asi que no
 * interfiere con los datos en tiempo real del backend.
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return
    if (!("serviceWorker" in navigator)) return
    if (process.env.NODE_ENV !== "production") return

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[PWA] service worker no registrado:", err))
  }, [])

  return null
}
