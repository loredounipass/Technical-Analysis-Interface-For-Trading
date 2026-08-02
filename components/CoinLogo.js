"use client"

import { useState } from "react"
import { getCoinLogo, getCoinFallbackLogo } from "@/utils/coinLogos"

// Logo de cryptologos.cc con fallback SVG (patrón del componente del usuario).
// Si se pasa `fallbackIcon` (ej. emoji), se usa como último recurso en lugar del SVG.
export default function CoinLogo({ symbol, size = 32, className = "", fallbackIcon = "" }) {
  const [src, setSrc] = useState(() => getCoinLogo(symbol))

  // Sin logo conocido en cryptologos (stocks, monedas nuevas) -> emoji si existe
  if (fallbackIcon && src.startsWith("data:")) {
    return (
      <span className={`flex items-center justify-center ${className}`} style={{ width: size, height: size, fontSize: size * 0.6, lineHeight: 1 }}>
        {fallbackIcon}
      </span>
    )
  }

  const handleError = () => {
    setSrc(getCoinFallbackLogo(symbol))
  }

  return (
    <img
      src={src}
      alt={symbol}
      width={size}
      height={size}
      className={`object-contain ${className}`}
      onError={handleError}
      draggable={false}
    />
  )
}
