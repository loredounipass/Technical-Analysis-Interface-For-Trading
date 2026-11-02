import type { MetadataRoute } from "next"

/**
 * Web App Manifest (Next lo sirve automaticamente en /manifest.webmanifest y
 * lo enlaza en el <head>). Convierte la terminal en una PWA instalable: el
 * navegador ofrece "Instalar/Descargar app" y la abre en ventana propia
 * (display: standalone) con su icono.
 *
 * start_url lleva ?source=pwa para poder distinguir aperturas instaladas, pero
 * el scope "/" lo cubre. background/theme color = el fondo real de la app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SYNAPSE TERMINAL",
    short_name: "Synapse",
    description:
      "Terminal profesional de analisis tecnico para crypto y acciones, con datos reales de mercado en tiempo real.",
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#070c14",
    theme_color: "#070c14",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
