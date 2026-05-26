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
    <Card className="trading-card">
      <CardHeader>
        <CardTitle className="text-white flex items-center font-mono">
          <DollarSign className="h-5 w-5 mr-2 text-trading-green-500" />
          CURRENT PRICE
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="text-3xl font-bold text-white font-mono">${formatted}</div>
          <div className="text-xs text-trading-dark-300 font-mono">{symbol}</div>
        </div>
        {priceChartData.length > 0 && (
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={100}>
              <LineChart data={priceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
                <XAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "#a3a3a3", fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #404040", color: "#fff" }} />
                <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
