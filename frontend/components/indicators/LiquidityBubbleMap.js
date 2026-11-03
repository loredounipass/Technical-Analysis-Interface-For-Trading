"use client"

import React, { useMemo } from "react"
import { Droplets } from "lucide-react"

/**
 * LIQUIDITY BUBBLE MAP
 * Visualiza la profundidad del order book como burbujas de liquidez.
 * Cada burbuja representa un nivel de precio; su tamaño es proporcional
 * al volumen (price × qty) en ese nivel. Bids = cyan (compradores),
 * Asks = rosa (vendedores). El precio actual está al centro.
 *
 * La dominancia (BID DOM / ASK DOM) NO se recalcula aquí: se usa la que calcula
 * el backend, que agrega el notional dentro de una banda de precio alrededor del
 * mid. Sumar "los N niveles más cercanos" cubre ~0,01% del precio, donde una sola
 * orden decide el porcentaje (medido: ese número recorría 76 puntos en 100 s,
 * frente a 20 de la banda). Recalcularlo localmente sería una segunda definición
 * distinta del mismo concepto, y el panel no coincidiría con lo que lee el modelo.
 *
 * Y las burbujas ya no son "los 40 niveles más cercanos": el backend manda los
 * niveles AGRUPADOS DE ESA MISMA BANDA, conservando el notional (precio del balde
 * = notional/cantidad). Antes el mapa pintaba 0,021% del precio y el porcentaje
 * venía de 0,10%, así que la misma tarjeta mostraba 47,8% por un camino y 44,1%
 * por el otro. Si `orderBookSource` no es el libro real, el mapa es un perfil de
 * volumen de velas y se dice: no son órdenes reposando.
 *
 * El libro es un snapshot REST que se renueva cada ~12 s, así que se muestra su
 * edad real junto al mapa en vez de sugerir una lectura del instante.
 */
export default function LiquidityBubbleMap({
  depthRaw,
  precio,
  decimales = 2,
  buyerPercent = null,
  bookAgeSeconds = null,
  orderBookBandPercent = null,
  orderBookSource = null,
}) {
  const hasBids = depthRaw?.bids?.length > 0
  const hasAsks = depthRaw?.asks?.length > 0
  const hasData = hasBids || hasAsks

  const { bids, asks, maxVol, totalBid, totalAsk } = useMemo(() => {
    if (!hasData) return { bids: [], asks: [], maxVol: 1, totalBid: 0, totalAsk: 0 }

    // Agrupar niveles cercanos solo para que el mapa sea legible. La suma de
    // los baldes conserva el notional, así que totalBid/totalAsk siguen siendo
    // el bidVolume/askVolume del backend.
    const groupLevels = (levels, bucketCount = 12) => {
      if (levels.length === 0) return []
      const minP = levels[levels.length - 1][0]
      const maxP = levels[0][0]
      const range = maxP - minP || 1
      const bucketSize = range / bucketCount

      const buckets = []
      for (let i = 0; i < bucketCount; i++) {
        buckets.push({ priceSum: 0, vol: 0, count: 0, pmin: Infinity, pmax: -Infinity })
      }

      levels.forEach(([p, q]) => {
        const idx = Math.min(Math.floor((p - minP) / bucketSize), bucketCount - 1)
        buckets[idx].priceSum += p
        buckets[idx].vol += p * q
        buckets[idx].count += 1
        buckets[idx].pmin = Math.min(buckets[idx].pmin, p)
        buckets[idx].pmax = Math.max(buckets[idx].pmax, p)
      })

      return buckets
        .filter((b) => b.count > 0)
        .map((b) => ({
          price: b.priceSum / b.count,
          vol: b.vol,
          count: b.count,
          pmin: b.pmin,
          pmax: b.pmax,
        }))
    }

    const rawBids = (depthRaw.bids || []).map(([p, q]) => [Number(p), Number(q)])
    const rawAsks = (depthRaw.asks || []).map(([p, q]) => [Number(p), Number(q)])

    const groupedBids = groupLevels(rawBids, 12)
    const groupedAsks = groupLevels(rawAsks, 12)

    const allVols = [...groupedBids, ...groupedAsks].map((b) => b.vol)
    const mv = allVols.length > 0 ? Math.max(...allVols) : 1

    const tb = groupedBids.reduce((s, b) => s + b.vol, 0)
    const ta = groupedAsks.reduce((s, b) => s + b.vol, 0)

    return { bids: groupedBids, asks: groupedAsks, maxVol: mv, totalBid: tb, totalAsk: ta }
  }, [depthRaw, hasData])

  const fmt = (v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return "0.00"
    return n.toLocaleString("en-US", {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    })
  }

  const fmtVol = (v) => {
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M"
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K"
    return v.toFixed(0)
  }

  const buyerFromBackend = buyerPercent != null ? Number(buyerPercent) : null
  const bidDominance =
    buyerFromBackend != null && Number.isFinite(buyerFromBackend)
      ? buyerFromBackend.toFixed(1)
      : totalBid + totalAsk > 0
        ? ((totalBid / (totalBid + totalAsk)) * 100).toFixed(1)
        : "50.0"
  const bidShare = Number(bidDominance)
  const isBidDominant = bidShare >= 50
  // El badge nombra el lado dominante y muestra el porcentaje DE ESE LADO. Con
  // 44,1% comprador decía "ASK DOM: 44.1%": elegía la palabra por el umbral pero
  // imprimía el número del bid sin complementarlo, contradiciendo a su propia
  // barra (que pinta 44,1% de cyan). ASK DOM solo puede decir 55,9% aquí.
  const domBadge = isBidDominant
    ? `BID DOM: ${bidShare.toFixed(1)}%`
    : `ASK DOM: ${(100 - bidShare).toFixed(1)}%`

  // Origen real de lo pintado: el libro (órdenes reposando) o el perfil de
  // volumen de las velas (volumen NEGOCIADO, no interest waiting).
  const obSource = depthRaw?.source || orderBookSource || null
  const isProxy =
    obSource === "volume_profile" ||
    obSource === "synthetic_profile" ||
    obSource === "volume_proxy"
  const bandPct = isProxy ? null : depthRaw?.bandPct ?? orderBookBandPercent
  const bandLabel = bandPct != null
    ? `BAND ±${(Number(bandPct) / 2).toFixed(3)}% OF MID`
    : null
  const levelsLabel = depthRaw?.levels != null ? `${depthRaw.levels} LEVELS` : null
  const ageLabel = !isProxy && bookAgeSeconds != null
    ? `BOOK ${Math.round(Number(bookAgeSeconds))}s OLD`
    : null

  // Renderizar una burbuja individual
  const renderBubble = (item, idx, side) => {
    const ratio = item.vol / maxVol
    // Tamaño mínimo 16px, máximo 56px
    const size = Math.max(16, Math.min(56, 16 + ratio * 40))
    const opacity = 0.35 + ratio * 0.55

    const isBid = side === "bid"
    const color = isBid ? "#00f5c4" : "#ff3b69"
    const bgColor = isBid ? "rgba(0, 245, 196," : "rgba(255, 59, 105,"
    const shadowColor = isBid ? "rgba(0, 245, 196, 0.4)" : "rgba(255, 59, 105, 0.4)"

    return (
      <div
        key={`${side}-${idx}`}
        className="group relative flex items-center justify-center cursor-default transition-transform duration-200 hover:scale-125 hover:z-20"
        style={{ width: size, height: size }}
      >
        {/* Glow layer */}
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: `${bgColor} ${opacity * 0.15})`,
            boxShadow: `0 0 ${size * 0.4}px ${shadowColor}`,
          }}
        />
        {/* Main bubble */}
        <div
          className="absolute inset-[2px] rounded-full border transition-all duration-200"
          style={{
            background: `radial-gradient(circle at 35% 35%, ${bgColor} ${opacity * 0.9}), ${bgColor} ${opacity * 0.4}))`,
            borderColor: `${bgColor} ${opacity * 0.7})`,
            boxShadow: `inset 0 0 ${size * 0.3}px ${bgColor} ${opacity * 0.3})`,
          }}
        />
        {/* Volume label inside big bubbles */}
        {size >= 32 && (
          <span
            className="relative z-10 text-[8px] font-mono font-bold tracking-wider"
            style={{ color }}
          >
            {fmtVol(item.vol)}
          </span>
        )}

        {/* Tooltip on hover */}
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 z-30">
          <div className="bg-[#08121c]/95 border border-[#16283d] p-2 rounded-lg shadow-2xl font-mono text-[10px] whitespace-nowrap backdrop-blur-md">
            <div className="text-white font-bold mb-0.5">${fmt(item.price)}</div>
            <div style={{ color }}>
              {isBid ? "BID" : "ASK"}: ${fmtVol(item.vol)}
            </div>
            <div className="text-slate-400">{fmt(item.pmin)} – {fmt(item.pmax)}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="synapse-card p-3.5 flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#142335] text-xs font-mono">
        <div className="flex items-center gap-2 font-bold tracking-wider text-white uppercase text-[11px]">
          <div className="w-6 h-6 rounded-md bg-[#38bdf8]/10 border border-[#38bdf8]/30 flex items-center justify-center text-[#38bdf8] shadow-[0_0_8px_rgba(56,189,248,0.25)] flex-shrink-0">
            <Droplets className="w-3.5 h-3.5" />
          </div>
          <span>LIQUIDITY BUBBLE MAP</span>
        </div>
        <div
          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider ${!hasData
              ? "bg-slate-500/15 border border-slate-500/40 text-slate-400"
              : isBidDominant
              ? "bg-[#00f5c4]/15 border border-[#00f5c4]/40 text-[#00f5c4]"
              : "bg-[#ff3b69]/15 border border-[#ff3b69]/40 text-[#ff3b69]"
            }`}
        >
          {hasData ? domBadge : "NO BOOK DATA"}
        </div>
      </div>

      {/* Bubble Map */}
      {hasData ? (
        <div className="my-2">
          {/* Legend */}
          <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-2 px-1">
            <span className="text-[#00f5c4] font-bold tracking-wider">◄ BIDS (BUYERS)</span>
            <span className="text-white font-bold text-[10px]">${fmt(precio)}</span>
            <span className="text-[#ff3b69] font-bold tracking-wider">ASKS (SELLERS) ►</span>
          </div>

          {/* Como se agrego el libro: banda de precio y edad del snapshot */}
          {(bandLabel || ageLabel) && (
            <div className="flex items-center justify-center gap-2 text-[8px] font-mono text-slate-500 -mt-1 mb-1 tracking-wider">
              {bandLabel && <span>{bandLabel}</span>}
              {bandLabel && ageLabel && <span className="text-slate-600">·</span>}
              {ageLabel && <span>{ageLabel}</span>}
            </div>
          )}

          {/* Bubble container */}
          <div className="relative w-full h-[140px] bg-[#08111a]/60 rounded-lg border border-[#142335] overflow-hidden">
            {/* Center price line */}
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent z-10" />

            {/* Bids (left side) */}
            <div className="absolute left-0 top-0 bottom-0 w-1/2 flex items-center justify-end gap-1 px-2 flex-wrap-reverse">
              {bids.map((b, i) => renderBubble(b, i, "bid"))}
            </div>

            {/* Asks (right side) */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 flex items-center justify-start gap-1 px-2 flex-wrap">
              {asks.map((a, i) => renderBubble(a, i, "ask"))}
            </div>

            {/* Center price badge */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
              <div className="px-2 py-1 rounded-md bg-[#0b1c26] border border-white/20 text-white font-mono font-bold text-[9px] shadow-[0_0_12px_rgba(255,255,255,0.1)] whitespace-nowrap">
                ${fmt(precio)}
              </div>
            </div>
          </div>

          {/* Dominance bar */}
          <div className="mt-2.5 space-y-1.5">
            <div className="w-full h-2 rounded-full bg-[#08111a] border border-[#16283d] overflow-hidden flex p-0.5">
              <div
                className="h-full bg-[#00f5c4] rounded-l-full transition-all duration-500 shadow-[0_0_8px_rgba(0,245,196,0.5)]"
                style={{ width: `${Math.max(4, Math.min(96, Number(bidDominance)))}%` }}
              />
              <div
                className="h-full bg-[#ff3b69] rounded-r-full transition-all duration-500 shadow-[0_0_8px_rgba(255,59,105,0.5)]"
                style={{ width: `${Math.max(4, Math.min(96, 100 - Number(bidDominance)))}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[140px] flex items-center justify-center text-slate-400 font-mono text-xs">
          No order book data available
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-[#142335] text-[10px] font-mono tracking-wider text-slate-300">
        <span>
          Bid Vol:{" "}
          <span className="text-[#00f5c4] font-medium">{hasData ? fmtVol(totalBid) : "\u2014"}</span>
        </span>
        <span className="text-slate-500">
          {hasData
            ? isProxy
              ? "VOLUME PROFILE · NOT RESTING ORDERS"
              : [
                  levelsLabel || "DEPTH",
                  bandLabel,
                  ageLabel ? `${Math.round(Number(bookAgeSeconds))}s` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
            : "\u2014"}
        </span>
        <span>
          Ask Vol:{" "}
          <span className="text-[#ff3b69] font-medium">{hasData ? fmtVol(totalAsk) : "\u2014"}</span>
        </span>
      </div>
    </div>
  )
}

