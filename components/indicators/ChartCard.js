"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts"

export default function ChartCard({ title, icon, type, datos = {} }) {
  // HELPER: ESTILO COMÚN PARA TOOLTIP (REUTILIZADO EN LOS GRÁFICOS)
  const TOOLTIP_STYLE = {
    backgroundColor: "#1a1a1a",
    border: "1px solid #404040",
    borderRadius: "4px",
    color: "#fff",
  }

  // HELPER: FORMATEAR NÚMEROS DE MANERA SEGURA A STRING CON DECIMALES
  const safeToFixed = (v, d = 2) => {
    const n = Number(v)
    if (!isFinite(n)) return (0).toFixed(d)
    return n.toFixed(d)
  }

  // HELPER: OBTENER ÚLTIMOS N VALORES VÁLIDOS DE UN ARRAY
  const getLastValidValues = (arr, n) => {
    if (!Array.isArray(arr) || arr.length === 0) return []
    const validIndices = []
    for (let i = arr.length - 1; i >= 0 && validIndices.length < n; i--) {
      if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) {
        validIndices.push(i)
      }
    }
    return validIndices.reverse()
  }

  // HELPER: Asegura al menos 2 puntos en la serie duplicando el único punto existente.
  // Esto permite a Recharts dibujar una línea horizontal cuando sólo hay un valor.
  const ensureMinPoints = (dataArray) => {
    if (!Array.isArray(dataArray)) return dataArray
    if (dataArray.length === 1) {
      const first = { ...dataArray[0] }
      // ajustar el nombre para que no colisione en el eje X
      first.name = `${dataArray[0].name}_dup`
      dataArray.unshift(first)
    }
    return dataArray
  }

  // RENDERIZADOR PRINCIPAL: DEVUELVE EL BLOQUE DE JSX SEGÚN `type`
  const renderChart = () => {
    switch (type) {
      case "rsi":
        // BLOQUE RSI: MUESTRA VALORES NUMÉRICOS Y GRÁFICO DE RSI
        let rsiChartData = []
        
        if (datos.history && Array.isArray(datos.history.rsi) && datos.history.rsi.length > 0) {
          const validIndices = getLastValidValues(datos.history.rsi, 50)
          
          if (validIndices.length > 0) {
            rsiChartData = validIndices.map((idx, i) => ({
              name: `${i}`,
              rsi: datos.history.rsi[idx],
              rsiStoch: datos.history.rsiStoch?.[idx] ?? null
            }))

            // Asegurar que el último valor sea el actual
            if (datos.rsi !== null && datos.rsi !== undefined) {
              rsiChartData[rsiChartData.length - 1].rsi = datos.rsi
            }
            // Asegurar que la serie Stoch RSI tenga el último valor actual
            if (datos.rsiStoch !== null && datos.rsiStoch !== undefined) {
              rsiChartData[rsiChartData.length - 1].rsiStoch = datos.rsiStoch
            }
          }
        }
        
        // Si no hay datos históricos, usar solo el valor actual
        if (rsiChartData.length === 0 && datos.rsi !== null && datos.rsi !== undefined) {
          rsiChartData = [{ name: "0", rsi: datos.rsi }]
        }
        
        rsiChartData = ensureMinPoints(rsiChartData)
        // Adjuntar valores de Stoch RSI ya presentes en historial; si no existen,
        // la propiedad `rsiStoch` será nula excepto en el último punto donde
        // se coloca `datos.rsiStoch` si está disponible.
        try {
          // Preferimos usar la serie `rsiStoch` directamente para la línea roja
          // (rsiSignal) para que coincida exactamente con Stoch RSI. Si la
          // serie histórica `rsiStoch` no está disponible, hacemos un fallback
          // calculando una SMA sobre `rsi` (comportamiento previo).
          let rsiSignalSeries = []
          const hasStochHistory = Array.isArray(datos.history?.rsiStoch) && datos.history.rsiStoch.length > 0
          if (hasStochHistory) {
            // Mapear valores históricos de rsiStoch a la serie mostrada
            rsiSignalSeries = rsiChartData.map((_, i) => {
              // intentamos tomar el valor correspondiente del historial
              return datos.history.rsiStoch[ validIndexOrZero(i, rsiChartData.length, datos.history.rsiStoch.length) ] ?? null
            })
            // Asegurar último valor actual
            if (datos.rsiStoch !== null && datos.rsiStoch !== undefined) {
              rsiSignalSeries[rsiSignalSeries.length - 1] = datos.rsiStoch
            }
          } else {
            // Fallback: calcular SMA simple sobre RSI con ventana 9 (comportamiento anterior)
            const window = 9
            rsiSignalSeries = rsiChartData.map((_, i) => {
              const start = Math.max(0, i - (window - 1))
              const slice = rsiChartData
                .slice(start, i + 1)
                .map((x) => x.rsi)
                .filter((v) => v !== null && v !== undefined && !isNaN(v))
              if (slice.length === 0) return null
              const sum = slice.reduce((a, b) => a + Number(b), 0)
              return sum / slice.length
            })
          }
          rsiChartData.forEach((d, i) => {
            d.rsiSignal = rsiSignalSeries[i] ?? null
          })
        } catch (e) {}

        // Helper local: calcula el índice de historial correspondiente para
        // mapear la ventana reducida (p. ej. últimos N puntos) a los índices
        // originales del historial. Queremos alinear los últimos puntos.
        function validIndexOrZero(displayIndex, displayLen, histLen) {
          // displayIndex 0..displayLen-1 -> map to last histLen slice indices
          const offset = Math.max(0, histLen - displayLen)
          return Math.min(histLen - 1, offset + displayIndex)
        }
        // Debug: mostrar tamaños y primeros/últimos valores
        try {
          console.log("ChartCard RSI data:", {
            historyRsiLen: datos.history?.rsi?.length,
            rsiChartLen: rsiChartData.length,
            sample: rsiChartData.slice(0, 6)
          })
        } catch (e) {}
        return (
          <div className="space-y-4">
            {/* Numerical Values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
                <div className="text-xs text-trading-dark-300 font-mono mb-1">RSI (14)</div>
                <div
                  className={`text-xl font-bold font-mono ${
                    datos.rsi > 70
                      ? "text-trading-red-400"
                      : datos.rsi < 30
                        ? "text-trading-green-400"
                        : "text-trading-blue-400"
                  }`}
                >
                  {safeToFixed(datos.rsi, 2)}
                </div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  {datos.rsi > 70 ? "Overbought" : datos.rsi < 30 ? "Oversold" : "Neutral"}
                </div>
              </div>
              <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
                <div className="text-xs text-trading-dark-300 font-mono mb-1">Stoch RSI</div>
                <div
                  className={`text-xl font-bold font-mono ${
                    datos.rsiStoch > 80
                      ? "text-trading-red-400"
                      : datos.rsiStoch < 20
                        ? "text-trading-green-400"
                        : "text-trading-blue-400"
                  }`}
                >
                  {safeToFixed(datos.rsiStoch, 2)}
                </div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  {datos.rsiStoch > 80 ? "Overbought" : datos.rsiStoch < 20 ? "Oversold" : "Neutral"}
                </div>
              </div>
            </div>

            {/* Chart */}
            {rsiChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={rsiChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                  <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  {/* Reference lines removed per request - only the blue (rsi) and red (rsiSignal) lines remain */}
                  <Line 
                    type="monotone" 
                    dataKey="rsi" 
                    stroke="#3b82f6" 
                    strokeWidth={2} 
                    dot={false}
                    connectNulls={true}
                  />
                  <Line
                    type="monotone"
                    dataKey="rsiSignal"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-trading-dark-400 text-sm">
                No hay datos históricos disponibles
              </div>
            )}
            {/* Debug breve visible en UI */}
            <div className="mt-2 text-xs text-trading-dark-300 font-mono">
              {(() => {
                const vals = rsiChartData.map(d => d.rsi).filter(v => v !== null && v !== undefined && !isNaN(v))
                const min = vals.length ? Math.min(...vals) : 'n/a'
                const max = vals.length ? Math.max(...vals) : 'n/a'
                return `Datos RSI: ${datos.history?.rsi?.length ?? 0} historial, serie gráfica: ${rsiChartData.length} (min: ${min}, max: ${max})`
              })()}
            </div>
          </div>
        )

      case "macd":
        // BLOQUE MACD: MUESTRA LÍNEAS MACD/SIGNAL, HISTOGRAMA Y GRÁFICO
        let macdChartData = []
        
        if (datos.history && Array.isArray(datos.history.macd) && datos.history.macd.length > 0) {
          const validIndices = getLastValidValues(datos.history.macd, 50)
          
          if (validIndices.length > 0) {
            macdChartData = validIndices.map((idx, i) => ({
              name: `${i}`,
              macd: datos.history.macd[idx],
              signal: datos.history.macd_signal?.[idx] || null
            }))
            
            // Asegurar que el último valor sea el actual
            if (datos.macdValue !== null && datos.macdValue !== undefined) {
              macdChartData[macdChartData.length - 1].macd = datos.macdValue
              macdChartData[macdChartData.length - 1].signal = datos.macdSignal
            }
          }
        }
        
        // Si no hay datos históricos, usar solo valores actuales
        if (macdChartData.length === 0 && datos.macdValue !== null && datos.macdValue !== undefined) {
          macdChartData = [{ name: "0", macd: datos.macdValue, signal: datos.macdSignal }]
        }
        
        macdChartData = ensureMinPoints(macdChartData)
        try {
          console.log("ChartCard MACD data:", {
            historyMacdLen: datos.history?.macd?.length,
            macdChartLen: macdChartData.length,
            sample: macdChartData.slice(0, 6)
          })
        } catch (e) {}
        // Calcular dominio Y para mejor visualización
        const macdValues = macdChartData.flatMap(d => [d.macd, d.signal].filter(v => v !== null && v !== undefined && !isNaN(v)))
        let macdYDomain = ["auto", "auto"]
        if (macdValues.length > 0) {
          const min = Math.min(...macdValues)
          const max = Math.max(...macdValues)
          const pad = Math.max((max - min) * 0.1, Math.abs(max) * 0.05, 0.0001)
          macdYDomain = [min - pad, max + pad]
        }

        return (
          <div className="space-y-4">
            {/* Numerical Values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
                <div className="text-xs text-trading-dark-300 font-mono mb-1">MACD Line</div>
                <div
                  className={`text-xl font-bold font-mono ${
                    datos.macdValue > 0 ? "text-trading-green-400" : "text-trading-red-400"
                  }`}
                >
                  {safeToFixed(datos.macdValue, 4)}
                </div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  {datos.macdValue > 0 ? "Bullish" : "Bearish"}
                </div>
              </div>
              <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
                <div className="text-xs text-trading-dark-300 font-mono mb-1">Signal Line</div>
                <div
                  className={`text-xl font-bold font-mono ${
                    datos.macdSignal > 0 ? "text-trading-green-400" : "text-trading-red-400"
                  }`}
                >
                  {safeToFixed(datos.macdSignal, 4)}
                </div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  Histogram: {safeToFixed(datos.macdValue - datos.macdSignal, 4)}
                </div>
              </div>
            </div>

            {/* Chart */}
            {macdChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={macdChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                  <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <YAxis domain={macdYDomain} tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <ReferenceLine y={0} stroke="#525252" />
                  <Line 
                    type="monotone" 
                    dataKey="macd" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    dot={false}
                    connectNulls={true}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="signal" 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    dot={false}
                    connectNulls={true}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-trading-dark-400 text-sm">
                No hay datos históricos disponibles
              </div>
            )}
            <div className="mt-2 text-xs text-trading-dark-300 font-mono">
              {(() => {
                const vals = macdChartData.flatMap(d => [d.macd, d.signal]).filter(v => v !== null && v !== undefined && !isNaN(v))
                const min = vals.length ? Math.min(...vals) : 'n/a'
                const max = vals.length ? Math.max(...vals) : 'n/a'
                return `Datos MACD: ${datos.history?.macd?.length ?? 0} historial, serie gráfica: ${macdChartData.length} (min: ${min}, max: ${max})`
              })()}
            </div>
          </div>
        )

      case "bollinger":
        // BLOQUE BOLLINGER: MUESTRA BANDAS SUPERIOR/MEDIA/INFERIOR Y PRECIO
        let bbChartData = []
        let bbYDomain = ["auto", "auto"]
        
        if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
          const validIndices = getLastValidValues(datos.history.closes, 50)
          
          if (validIndices.length > 0) {
            bbChartData = validIndices.map((idx, i) => ({
              name: `${i}`,
              upper: datos.history.bb_upper?.[idx] || null,
              middle: datos.history.bb_middle?.[idx] || null,
              lower: datos.history.bb_lower?.[idx] || null,
              price: datos.history.closes[idx]
            }))
            
            // Asegurar que el último valor sea el actual
            if (datos.precio !== null && datos.precio !== undefined) {
              bbChartData[bbChartData.length - 1] = {
                name: `${bbChartData.length - 1}`,
                upper: datos.bbUpper,
                middle: datos.bbMiddle,
                lower: datos.bbLower,
                price: datos.precio
              }
            }
          }
        }
        
        // Si no hay datos históricos, usar solo valores actuales
        if (bbChartData.length === 0 && datos.precio !== null && datos.precio !== undefined) {
          bbChartData = [{
            name: "0",
            upper: datos.bbUpper,
            middle: datos.bbMiddle,
            lower: datos.bbLower,
            price: datos.precio
          }]
        }
        
        bbChartData = ensureMinPoints(bbChartData)
        try {
          console.log("ChartCard BB data:", {
            historyClosesLen: datos.history?.closes?.length,
            bbChartLen: bbChartData.length,
            sample: bbChartData.slice(0, 6)
          })
        } catch (e) {}
        // Calcular dominio Y (usar solo las bandas, excluir precio)
        const bbValues = bbChartData.flatMap(d => [d.upper, d.middle, d.lower].filter(v => v !== null && v !== undefined && !isNaN(v)))
        if (bbValues.length > 0) {
          const min = Math.min(...bbValues)
          const max = Math.max(...bbValues)
          const pad = Math.max((max - min) * 0.1, Math.abs(max) * 0.02, 0.01)
          bbYDomain = [min - pad, max + pad]
        }

        return (
          <div className="space-y-4">
            {/* Numerical Values */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-trading-red-600/20 p-2 rounded border border-trading-red-600/30">
                <div className="text-xs text-trading-red-300 font-mono mb-1">Upper</div>
                <div className="text-lg font-bold font-mono text-trading-red-400">
                  ${safeToFixed(datos.bbUpper, datos.decimales)}
                </div>
              </div>
              <div className="bg-trading-yellow-600/20 p-2 rounded border border-trading-yellow-600/30">
                <div className="text-xs text-trading-yellow-300 font-mono mb-1">Middle</div>
                <div className="text-lg font-bold font-mono text-trading-yellow-400">
                  ${safeToFixed(datos.bbMiddle, datos.decimales)}
                </div>
              </div>
              <div className="bg-trading-green-600/20 p-2 rounded border border-trading-green-600/30">
                <div className="text-xs text-trading-green-300 font-mono mb-1">Lower</div>
                <div className="text-lg font-bold font-mono text-trading-green-400">
                  ${safeToFixed(datos.bbLower, datos.decimales)}
                </div>
              </div>
            </div>

            <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
              <div className="flex justify-between items-center">
                <span className="text-xs text-trading-dark-300 font-mono">Current Price Position:</span>
                <span
                  className={`text-sm font-bold font-mono ${
                    datos.precio > datos.bbUpper
                      ? "text-trading-red-400"
                      : datos.precio < datos.bbLower
                        ? "text-trading-green-400"
                        : "text-trading-blue-400"
                  }`}
                >
                  {datos.precio > datos.bbUpper
                    ? "Above Upper Band"
                    : datos.precio < datos.bbLower
                      ? "Below Lower Band"
                      : "Within Bands"}
                </span>
              </div>
              <div className="mt-2 text-xs text-trading-dark-300 font-mono">
                Band Width: {safeToFixed(((datos.bbUpper - datos.bbLower) / datos.bbMiddle) * 100, 2)}%
              </div>
            </div>

            {/* Chart */}
            {bbChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={bbChartData} margin={{ left: 40, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                  <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <YAxis domain={bbYDomain} tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line
                    type="monotone"
                    dataKey="upper"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={true}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="middle" 
                    stroke="#f59e0b" 
                    strokeWidth={2} 
                    dot={false}
                    connectNulls={true}
                  />
                  <Line
                    type="monotone"
                    dataKey="lower"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={true}
                  />
                  {/* Price line removed for EMA chart per request */}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-trading-dark-400 text-sm">
                No hay datos históricos disponibles
              </div>
            )}
            <div className="mt-2 text-xs text-trading-dark-300 font-mono">
              {(() => {
                const vals = bbChartData.flatMap(d => [d.upper, d.middle, d.lower, d.price]).filter(v => v !== null && v !== undefined && !isNaN(v))
                const min = vals.length ? Math.min(...vals) : 'n/a'
                const max = vals.length ? Math.max(...vals) : 'n/a'
                return `Datos BB: ${datos.history?.closes?.length ?? 0} historial, serie gráfica: ${bbChartData.length} (min: ${min}, max: ${max})`
              })()}
            </div>
          </div>
        )

      case "ema":
        // BLOQUE EMA: MUESTRA EMAs (50/100/200), ANÁLISIS DE TENDENCIA Y GRÁFICO
        let emaChartData = []

        // Construir serie mostrada: intentar usar historial de closes y EMAs si existen.
        // Si las EMAs históricas no están disponibles o tienen muchos nulos,
        // calculamos un fallback de EMA a partir de los precios para dibujar
        // líneas continuas.
        if (datos.history && Array.isArray(datos.history.closes) && datos.history.closes.length > 0) {
          const validIndices = getLastValidValues(datos.history.closes, 50)

          if (validIndices.length > 0) {
            const closesSeries = validIndices.map((idx) => datos.history.closes[idx])

            // Helper: calcula EMA a partir de una serie de precios
            function computeEMAFromPrices(arr, period) {
              const out = []
              if (!Array.isArray(arr) || arr.length === 0) return out
              const k = 2 / (period + 1)
              // inicializar EMA con el primer valor válido
              let ema = null
              for (let i = 0; i < arr.length; i++) {
                const v = arr[i]
                if (v === null || v === undefined || isNaN(v)) {
                  out.push(null)
                  continue
                }
                if (ema === null) {
                  ema = v
                } else {
                  ema = v * k + ema * (1 - k)
                }
                out.push(ema)
              }
              return out
            }

            // calcular EMAs fallback a partir de closes
            const ema50FromPrices = computeEMAFromPrices(closesSeries, 50)
            const ema100FromPrices = computeEMAFromPrices(closesSeries, 100)
            const ema200FromPrices = computeEMAFromPrices(closesSeries, 200)

            emaChartData = validIndices.map((idx, i) => ({
              name: `${i}`,
              // Priorizar valores históricos si existen, si no usar el fallback calculado
              ema50: (Array.isArray(datos.history?.ema50) ? datos.history.ema50[idx] : null) ?? ema50FromPrices[i] ?? null,
              ema100: (Array.isArray(datos.history?.ema100) ? datos.history.ema100[idx] : null) ?? ema100FromPrices[i] ?? null,
              ema200: (Array.isArray(datos.history?.ema200) ? datos.history.ema200[idx] : null) ?? ema200FromPrices[i] ?? null,
              price: datos.history.closes[idx]
            }))

            // Asegurar que el último valor sea el actual (valores en `datos`)
            if (datos.precio !== null && datos.precio !== undefined) {
              const last = emaChartData.length - 1
              emaChartData[last] = {
                name: `${last}`,
                ema50: datos.ema50 ?? emaChartData[last].ema50,
                ema100: datos.ema100 ?? emaChartData[last].ema100,
                ema200: datos.ema200 ?? emaChartData[last].ema200,
                price: datos.precio
              }
            }
          }
        }
        
        // Si no hay datos históricos, usar solo valores actuales
        if (emaChartData.length === 0 && datos.precio !== null && datos.precio !== undefined) {
          emaChartData = [{
            name: "0",
            ema50: datos.ema50,
            ema100: datos.ema100,
            ema200: datos.ema200,
            price: datos.precio
          }]
        }
        
        emaChartData = ensureMinPoints(emaChartData)
        try {
          console.log("ChartCard EMA data:", {
            historyClosesLen: datos.history?.closes?.length,
            emaChartLen: emaChartData.length,
            sample: emaChartData.slice(0, 6)
          })
        } catch (e) {}
        // Calcular dominio Y
        const emaValues = emaChartData.flatMap(d => [d.ema50, d.ema100, d.ema200, d.price].filter(v => v !== null && v !== undefined && !isNaN(v)))
        let yDomain = ["auto", "auto"]
        if (emaValues.length > 0) {
          const min = Math.min(...emaValues)
          const max = Math.max(...emaValues)
          const pad = Math.max((max - min) * 0.1, Math.abs(max) * 0.02, 0.01)
          yDomain = [min - pad, max + pad]
        }

        return (
          <div className="space-y-4">
            {/* Numerical Values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="bg-trading-dark-700 p-2 rounded border border-trading-dark-600 flex justify-between">
                  <span className="text-xs text-trading-green-300 font-mono">EMA 50:</span>
                  <span className="text-sm font-bold font-mono text-trading-green-400">
                    ${safeToFixed(datos.ema50, datos.decimales)}
                  </span>
                </div>
                <div className="bg-trading-dark-700 p-2 rounded border border-trading-dark-600 flex justify-between">
                  <span className="text-xs text-white font-mono">EMA 100:</span>
                  <span className="text-sm font-bold font-mono text-white">
                    ${safeToFixed(datos.ema100, datos.decimales)}
                  </span>
                </div>
                <div className="bg-trading-dark-700 p-2 rounded border border-trading-dark-600 flex justify-between">
                  <span className="text-xs text-trading-red-300 font-mono">EMA 200:</span>
                  <span className="text-sm font-bold font-mono text-trading-red-400">
                    ${safeToFixed(datos.ema200, datos.decimales)}
                  </span>
                </div>
              </div>
              <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
                <div className="text-xs text-trading-dark-300 font-mono mb-1">Trend Analysis</div>
                <div
                  className={`text-lg font-bold font-mono ${
                    datos.precio > datos.ema50 && datos.ema50 > datos.ema100 && datos.ema100 > datos.ema200
                      ? "text-trading-green-400"
                      : datos.precio < datos.ema50 && datos.ema50 < datos.ema100 && datos.ema100 < datos.ema200
                        ? "text-trading-red-400"
                        : "text-trading-yellow-400"
                  }`}
                >
                  {datos.precio > datos.ema50 && datos.ema50 > datos.ema100 && datos.ema100 > datos.ema200
                    ? "BULLISH"
                    : datos.precio < datos.ema50 && datos.ema50 < datos.ema100 && datos.ema100 < datos.ema200
                      ? "BEARISH"
                      : "SIDEWAYS"}
                </div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  Price vs EMA50: {safeToFixed((datos.precio / datos.ema50 - 1) * 100, 2)}%
                </div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  EMA Distance: {safeToFixed(((datos.ema50 - datos.ema200) / datos.ema200) * 100, 2)}%
                </div>
              </div>
            </div>

            {/* Chart */}
            {emaChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={emaChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                  <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <YAxis domain={yDomain} tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line 
                    type="monotone" 
                    dataKey="ema50" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    dot={false}
                    connectNulls={true}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ema100" 
                    stroke="#ffffff" 
                    strokeWidth={2} 
                    dot={false}
                    connectNulls={true}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ema200" 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    dot={false}
                    connectNulls={true}
                  />
                  {/* Price line removed for EMA chart per request */}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center text-trading-dark-400 text-sm">
                No hay datos históricos disponibles
              </div>
            )}
            <div className="mt-2 text-xs text-trading-dark-300 font-mono">
                {(() => {
                const vals = emaChartData.flatMap(d => [d.ema50, d.ema100, d.ema200]).filter(v => v !== null && v !== undefined && !isNaN(v))
                const min = vals.length ? Math.min(...vals) : 'n/a'
                const max = vals.length ? Math.max(...vals) : 'n/a'
                return `Datos EMA: ${datos.history?.closes?.length ?? 0} historial, serie gráfica: ${emaChartData.length} (min: ${min}, max: ${max})`
              })()}
            </div>
          </div>
        )

      default:
        // TIPO NO RECONOCIDO: NO RENDERIZAR NADA
        return null
    }
  }

  return (
    <Card className="trading-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center font-mono text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="chart-container">{renderChart()}</div>
      </CardContent>
    </Card>
  )
}