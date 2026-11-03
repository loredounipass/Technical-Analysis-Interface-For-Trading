/* Service worker de SYNAPSE TERMINAL (PWA).
 *
 * Objetivo: habilitar la instalacion como app y dar un "app shell" offline para
 * que la interfaz cargue sin red. NO cachea NUNCA datos del backend: las
 * peticiones a /api y /socket.io (o a cualquier origen distinto del frontend)
 * se dejan pasar a la red sin tocarlas, porque son datos de mercado en tiempo
 * real y cachearlos serviria precios viejos/falsos. Sin conexion la app abre el
 * shell y muestra "NO DATA", que es el comportamiento honesto esperado.
 *
 * Estrategia:
 *  - Assets versionados (/_next/static, /icons): cache-first.
 *  - Navegacion (HTML): network-first con respaldo al shell cacheado.
 *  - Resto same-origin: red con respaldo a cache.
 */

const CACHE = "synapse-shell-v1"
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function isBackendRequest(url) {
  return (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/socket.io")
  )
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)

  // Datos en tiempo real: nunca interceptar ni cachear el backend.
  if (isBackendRequest(url)) return

  // Solo mismo origen (frontend).
  if (url.origin !== self.location.origin) return

  const cachePut = (res) => {
    if (res && res.ok) {
      const copy = res.clone()
      caches.open(CACHE).then((cache) => cache.put(req, copy))
    }
    return res
  }

  // Assets estaticos versionados: cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then(cachePut))
    )
    return
  }

  // Navegacion: network-first para servir siempre la ultima build; si no hay
  // red, caer al shell cacheado.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(cachePut)
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/")))
    )
    return
  }

  // Resto de recursos same-origin: red con respaldo a cache.
  event.respondWith(
    fetch(req)
      .then(cachePut)
      .catch(() => caches.match(req))
  )
})
