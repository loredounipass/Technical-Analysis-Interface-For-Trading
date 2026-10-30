"use client"

import { useState, useRef, useEffect } from "react"

// Margen aproximado reservado para ejes (para calcular el ancho util del plot)
const AXIS_MARGIN = 90

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

/**
 * Navegacion estilo exchange para cualquier grafico de series temporales:
 * pan arrastrando (mouse/touch), zoom con rueda anclado al cursor, botones
 * de pan/zoom y regreso al vivo. Compartido por CandleChart y ChartCard.
 *
 * - count: velas/puntos visibles (zoom)
 * - end: indice final de la ventana; null = siguiendo el dato en vivo
 */
export default function useChartWindow(total, { defaultCount = 60, minCount = 12 } = {}) {
  const [count, setCount] = useState(defaultCount)
  const [end, setEnd] = useState(null)
  const [width, setWidth] = useState(0)
  const containerRef = useRef(null)
  const dragRef = useRef(null)
  const wheelHandlerRef = useRef(() => {})
  const active = total > 0

  const effCount = Math.max(1, Math.min(count, total))
  const effEnd = end === null ? total : clamp(end, effCount, total)
  const start = Math.max(0, effEnd - effCount)
  const isLive = effEnd >= total

  // Ancho del contenedor para escalar tamano de barras con el zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [active])

  const plotWidth = Math.max(50, width - AXIS_MARGIN)

  // Zoom: mantiene fijo el punto bajo el cursor (ratio 0..1 dentro del plot)
  const zoomBy = (deltaY, ratio) => {
    if (total === 0) return
    const next = clamp(
      Math.round(deltaY > 0 ? effCount * 1.2 : effCount / 1.2),
      minCount,
      total
    )
    if (next === effCount) return
    const anchorIdx = start + ratio * effCount
    const newEnd = clamp(Math.round(anchorIdx + (1 - ratio) * next), next, total)
    setCount(next)
    setEnd(newEnd >= total ? null : newEnd)
  }

  wheelHandlerRef.current = (e) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    const ratio = rect ? clamp((e.clientX - rect.left) / rect.width, 0, 1) : 0.5
    zoomBy(e.deltaY, ratio)
  }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const fn = (e) => wheelHandlerRef.current(e)
    el.addEventListener("wheel", fn, { passive: false })
    return () => el.removeEventListener("wheel", fn)
  }, [active])

  // Pan arrastrando
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, end: effEnd }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const barWidth = plotWidth / effCount
    const deltaCandles = Math.round((e.clientX - d.x) / barWidth)
    if (deltaCandles === 0) return
    const newEnd = clamp(d.end - deltaCandles, effCount, total)
    setEnd(newEnd >= total ? null : newEnd)
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  const panBy = (candles) => {
    const newEnd = clamp(effEnd + candles, effCount, total)
    setEnd(newEnd >= total ? null : newEnd)
  }
  const goLive = () => setEnd(null)
  // Ir al punto mas antiguo del historial (inicio absoluto)
  const goStart = () => setEnd(effCount)

  return {
    containerRef,
    start,
    effEnd,
    effCount,
    isLive,
    plotWidth,
    zoomBy,
    panBy,
    goLive,
    goStart,
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  }
}
