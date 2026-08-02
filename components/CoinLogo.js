"use client"

import { useState } from "react"
import { getAssetLogo, getCoinFallbackLogo } from "@/utils/coinLogos"

// Logo segun mercado: crypto -> cryptologos.cc, stock -> loadlogo.
// Si se pasa `fallbackIcon` (ej. emoji), se usa como último recurso.
export default function CoinLogo({ symbol, market = "crypto", size = 32, className = "", fallbackIcon = "" }) {
  const [src, setSrc] = useState(() => getAssetLogo(symbol, market))
  const [useFallback, setUseFallback] = useState(() => Boolean(fallbackIcon) && src.startsWith("data:"))

  if (useFallback) {
    return (
      <span className={`flex items-center justify-center ${className}`} style={{ width: size, height: size, fontSize: size * 0.6, lineHeight: 1 }}>
        {fallbackIcon}
      </span>
    )
  }

  const handleError = () => {
    if (fallbackIcon) {
      setUseFallback(true)
    } else {
      setSrc(getCoinFallbackLogo(symbol))
    }
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
