// Helpers y estilos compartidos por los componentes de gráfico de ChartCard.
// Centralizados para que cada tipo de indicador los reutilice sin duplicarlos.

// Dark Tooltip Style matching Synapse Terminal (todo texto en blanco/cyan)
export const TOOLTIP_STYLE = {
  backgroundColor: "rgba(8, 18, 28, 0.95)",
  border: "1px solid #16283d",
  borderRadius: "6px",
  color: "#ffffff",
  backdropFilter: "blur(6px)",
  fontSize: "11px",
  fontFamily: "ui-monospace, monospace",
  boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
}

export const safeToFixed = (v, d = 2) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return (0).toFixed(d)
  return n.toFixed(d)
}

// Recharts no renderiza una linea con un solo punto; se duplica el primero.
export const ensureMinPoints = (dataArray) => {
  if (!Array.isArray(dataArray)) return dataArray
  if (dataArray.length === 1) {
    const first = { ...dataArray[0], name: `${dataArray[0].name}_dup` }
    dataArray.unshift(first)
  }
  return dataArray
}
