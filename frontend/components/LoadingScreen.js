import { Card } from "@/components/ui/card"
import { Activity, TrendingUp } from "lucide-react"

export default function LoadingScreen({ moneda }) {
  return (
    <div className="min-h-screen trading-gradient flex items-center justify-center">
      <Card className="trading-card p-8">
        <div className="text-center text-white">
          <div className="relative mb-6">
            <Activity className="h-16 w-16 animate-pulse mx-auto text-trading-green-500" />
            <TrendingUp className="h-8 w-8 absolute top-0 right-0 animate-bounce text-trading-blue-500" />
          </div>
          <h2 className="text-2xl font-bold mb-2 font-mono">ANALYZING MARKET DATA</h2>
          <p className="text-trading-dark-200 font-mono mb-4">Processing {moneda.nombre} indicators...</p>
          <div className="flex items-center justify-center space-x-2">
            <div className="w-2 h-2 bg-trading-green-500 rounded-full animate-pulse"></div>
            <div
              className="w-2 h-2 bg-trading-green-500 rounded-full animate-pulse"
              style={{ animationDelay: "0.2s" }}
            ></div>
            <div
              className="w-2 h-2 bg-trading-green-500 rounded-full animate-pulse"
              style={{ animationDelay: "0.4s" }}
            ></div>
          </div>
        </div>
      </Card>
    </div>
  )
}
