import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react"

export default function RecommendationCard({ recomendacion, buySignals, sellSignals, neutralSignals }) {
  const totalSignals = (buySignals || 0) + (sellSignals || 0) + (neutralSignals || 0)
  const buyPct = totalSignals > 0 ? ((buySignals || 0) / totalSignals) * 100 : 0
  const sellPct = totalSignals > 0 ? ((sellSignals || 0) / totalSignals) * 100 : 0
  const neutralPct = totalSignals > 0 ? ((neutralSignals || 0) / totalSignals) * 100 : 0

  const getRecommendationIcon = (rec) => {
    switch (rec) {
      case "COMPRA":
        return <TrendingUp className="h-4 w-4 mr-2" />
      case "VENTA":
        return <TrendingDown className="h-4 w-4 mr-2" />
      default:
        return <Minus className="h-4 w-4 mr-2" />
    }
  }

  const getRecommendationStyle = (rec) => {
    switch (rec) {
      case "COMPRA":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
      case "VENTA":
        return "text-red-400 bg-red-500/10 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
      default:
        return "text-gray-400 bg-gray-500/10 border-gray-500/30"
    }
  }

  return (
    <Card className="trading-card border border-white/5 bg-[#0a0e14]/80 backdrop-blur-sm relative overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-gray-400 text-[10px] tracking-widest flex items-center font-mono uppercase">
          <BarChart3 className="h-3.5 w-3.5 mr-1.5 text-cyan-500" />
          MARKET SIGNAL
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className={`px-4 py-2 rounded text-lg font-bold font-mono flex items-center border ${getRecommendationStyle(recomendacion)}`}>
              {getRecommendationIcon(recomendacion)}
              {recomendacion}
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500 font-mono tracking-widest uppercase mb-1">Total Signals</div>
              <div className="text-xl font-bold text-white font-mono tabular-nums">{totalSignals}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-mono tracking-wider">
              <span className="text-emerald-400">{buySignals} BUY</span>
              <span className="text-gray-400">{neutralSignals} HOLD</span>
              <span className="text-red-400">{sellSignals} SELL</span>
            </div>
            {/* Sleek Progress Bar Gauge */}
            <div className="flex h-1.5 w-full bg-gray-900 rounded-full overflow-hidden shadow-inner">
              <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${buyPct}%` }} />
              <div className="bg-gray-500 transition-all duration-500" style={{ width: `${neutralPct}%` }} />
              <div className="bg-red-500 transition-all duration-500" style={{ width: `${sellPct}%` }} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
