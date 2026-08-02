"use client"

import { RefreshCw, ArrowLeft, Activity, TrendingUp, Newspaper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import CoinLogo from "@/components/CoinLogo"
import { useRouter } from "next/navigation"

export default function Header({ moneda, ultimaActualizacion, onActualizar, onCambiarMoneda }) {
  const router = useRouter()

  return (
    <Card className="mb-6 header-gradient">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <CoinLogo symbol={moneda.symbol} size={38} fallbackIcon={moneda.icon} />
              <TrendingUp className="absolute -top-1 -right-1 h-4 w-4 text-trading-green-500" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white font-mono flex items-center">
                {moneda.symbol}
                <Activity className="h-6 w-6 ml-2 text-trading-green-500 animate-pulse" />
              </h1>
              <p className="text-trading-dark-200 font-mono text-sm">Last Update: {ultimaActualizacion}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onActualizar} size="sm" className="trading-button h-8 sm:h-9 px-2.5 sm:px-3 text-[11px] sm:text-xs [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:h-4 sm:[&_svg]:w-4">
              <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Refresh Data
            </Button>
            <Button onClick={() => router.push('/news')} size="sm" className="trading-button-secondary h-8 sm:h-9 px-2.5 sm:px-3 text-[11px] sm:text-xs [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:h-4 sm:[&_svg]:w-4"
              style={{ borderColor: "rgba(16, 185, 129, 0.3)" }}
            >
              <Newspaper className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-emerald-400" />
              MARKET NEWS
            </Button>
            <Button onClick={onCambiarMoneda} size="sm" className="trading-button-secondary h-8 sm:h-9 px-2.5 sm:px-3 text-[11px] sm:text-xs [&_svg]:h-3.5 [&_svg]:w-3.5 sm:[&_svg]:h-4 sm:[&_svg]:w-4">
              <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Change Pair
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
