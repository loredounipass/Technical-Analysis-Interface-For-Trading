import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DollarSign } from "lucide-react"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

export default function PriceCard({ precio, decimales = 2, symbol, history = {} }) {
  const parsePrecio = (p) => {
    if (typeof p === 'number' && Number.isFinite(p)) return p
    if (typeof p !== 'string') return Number(p) || 0

    let s = p.trim()
    const hasComma = s.indexOf(',') !== -1
    const hasDot = s.indexOf('.') !== -1

    if (hasComma && hasDot) {
      const lastComma = s.lastIndexOf(',')
      const lastDot = s.lastIndexOf('.')
      if (lastComma > lastDot) {
        s = s.replace(/\./g, '')
        s = s.replace(/,/g, '.')
      } else {
        s = s.replace(/,/g, '')
      }
    } else if (hasComma) {
      const parts = s.split(',')
      if (parts.length > 1) {
        const last = parts[parts.length - 1]
        if (last.length === 3) {
          s = parts.join('')
        } else {
          const intPart = parts.slice(0, -1).join('')
          s = `${intPart}.${last}`
        }
      }
    } else if (hasDot) {
      const parts = s.split('.')
      if (parts.length > 1) {
        const last = parts[parts.length - 1]
        if (last.length === 3) {
          s = parts.join('')
        } else {
        }
      }
    }

    const n = Number(s)
    return Number.isFinite(n) ? n : 0
  }

  const formatWithDots = (n, d) => {
    const fixed = Number(n).toFixed(d)
    const [intPart, decPart] = fixed.split('.')
    const intWithDots = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${intWithDots}.${decPart}`
  }

  const value = parsePrecio(precio)
  const formatted = formatWithDots(value, decimales)

  let priceChartData = []
  try {
    if (history && Array.isArray(history.closes) && history.closes.length > 0) {
      const closes = history.closes.slice(-24)
      const times = Array.isArray(history.times) ? history.times.slice(-24) : null

      const fmtTime = (t) => {
        try {
          const ts = Number(t)
          const d = new Date(ts)
          return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } catch (e) {
          return String(t)
        }
      }

      priceChartData = closes.map((p, i) => ({
        name: times && times[i] ? fmtTime(times[i]) : `T-${closes.length - i - 1}`,
        price: Number(p)
      }))

      if (priceChartData.length > 0) {
        const lastName = times && times[times.length - 1] ? fmtTime(times[times.length - 1]) : 'T-0'
        priceChartData[priceChartData.length - 1] = { name: lastName, price: value }
      }
    }
  } catch (e) {
    priceChartData = []
  }

  return (
    <Card className="trading-card border border-white/5 bg-[#0a0e14]/80 backdrop-blur-sm relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50" />
      <CardHeader className="pb-2">
        <CardTitle className="text-gray-400 text-[10px] tracking-widest flex items-center font-mono uppercase">
          <DollarSign className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />
          CURRENT PRICE
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="space-y-1">
          <div className="text-4xl font-bold text-white tabular-nums tracking-tight">
            <span className="text-gray-500 mr-1 text-2xl">$</span>{formatted}
          </div>
          <div className="text-[10px] text-emerald-500/80 font-bold tracking-widest">{symbol}</div>
        </div>
        {priceChartData.length > 0 && (
          <div className="mt-6 h-[80px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceChartData}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#05070a", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "4px", color: "#fff", fontSize: "11px", fontFamily: "monospace" }}
                  itemStyle={{ color: "#10b981" }}
                />
                <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={1.5} dot={false} fill="url(#priceGradient)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
