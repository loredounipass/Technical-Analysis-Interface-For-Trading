/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    domains: ["localhost", "via.placeholder.com"],
    unoptimized: true,
  },
  // Configuración para optimización
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Variables de entorno públicas
  env: {
    CUSTOM_KEY: "cisco-trading-bot",
    APP_VERSION: "1.0.0",
  },
  // Headers de seguridad
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
    ]
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
