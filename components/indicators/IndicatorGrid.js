import IndicatorCard from "@/components/indicators/IndicatorCard"
import ChartCard from "@/components/indicators/ChartCard"
import CandleChart from "@/components/indicators/CandleChart"
import { Activity, Shield, Target, BarChart3, TrendingUp, Zap, Presentation } from "lucide-react"

export default function IndicatorGrid({ datos }) {
  // Prepare chart data
  const rsiData = [{ name: "RSI", value: datos.rsi, threshold: 70, oversold: 30 }]

  const macdData = [{ name: "MACD", macd: datos.macdValue, signal: datos.macdSignal }]

  const bollingerData = [
    { name: "BB", upper: datos.bbUpper, middle: datos.bbMiddle, lower: datos.bbLower, price: datos.precio },
  ]

  const emaData = [
    { name: "EMA50", value: datos.ema50 },
    { name: "EMA100", value: datos.ema100 },
    { name: "EMA200", value: datos.ema200 },
  ]

  const candleData = []
  if (datos.history && datos.history.opens) {
    const len = datos.history.closes.length
    const startIdx = Math.max(0, len - 40)
    for (let i = startIdx; i < len; i++) {
      const o = datos.history.opens[i]
      const h = datos.history.highs[i]
      const l = datos.history.lows[i]
      const c = datos.history.closes[i]
      // Binance times are ms
      const t = new Date(datos.history.times[i]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      candleData.push({
        time: t,
        open: o,
        high: h,
        low: l,
        close: c,
        wickRange: [l, h],
        bodyRange: [o, c]
      })
    }
  }

  return (
    <>
      {/* Professional Candlestick Chart */}
      <div className="mb-6">
        <IndicatorCard title="LIVE MARKET PRICE ACTION" icon={<Presentation className="h-5 w-5 mr-2 text-emerald-400" />}>
           <div className="bg-trading-dark-900/50 rounded-xl p-2 border border-white/5">
             {candleData.length > 0 ? (
               <CandleChart data={candleData} decimales={datos.decimales} />
             ) : (
               <div className="h-[300px] flex items-center justify-center text-gray-500 font-mono italic">
                 Awaiting real-time price action data...
               </div>
             )}
           </div>
        </IndicatorCard>
      </div>

      {/* Main Indicators with Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard
          title="RSI OSCILLATOR"
          icon={<Activity className="h-5 w-5 mr-2 text-trading-blue-500" />}
          data={rsiData}
          type="rsi"
          currentValue={datos.rsi}
          datos={datos}
        />
        <ChartCard
          title="MACD INDICATOR"
          icon={<TrendingUp className="h-5 w-5 mr-2 text-trading-green-500" />}
          data={macdData}
          type="macd"
          currentValue={datos.macdValue}
          datos={datos}
        />
      </div>

      {/* Volume and ADX with detailed numbers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <IndicatorCard title="VOLUME ANALYSIS" icon={<BarChart3 className="h-5 w-5 mr-2 text-trading-yellow-500" />}>
          <div className="space-y-3">
            <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-trading-dark-300 font-mono">24h Volume:</span>
                <span className="text-lg font-bold text-trading-yellow-400 font-mono">
                  {(datos.volumen / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-trading-dark-300 font-mono">Raw Volume:</span>
                <span className="text-sm text-white font-mono">{datos.volumen.toLocaleString()}</span>
              </div>
              <div className="w-full bg-trading-dark-600 rounded-full h-2">
                <div
                  className="bg-trading-yellow-500 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((datos.volumen / 2000000) * 100, 100)}%` }}
                ></div>
              </div>
              <div className="text-xs text-trading-dark-300 font-mono mt-1">
                Volume Strength: {datos.volumen > 1000000 ? "High" : datos.volumen > 500000 ? "Medium" : "Low"}
              </div>
            </div>
          </div>
        </IndicatorCard>

        <IndicatorCard title="ADX TREND STRENGTH" icon={<Zap className="h-5 w-5 mr-2 text-trading-blue-500" />}>
          <div className="space-y-3">
            <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-trading-dark-300 font-mono">ADX Value:</span>
                <span className="text-xl font-bold text-trading-blue-400 font-mono">{datos.adx.toFixed(2)}</span>
              </div>
              <div className="w-full bg-trading-dark-600 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    datos.adx > 50
                      ? "bg-trading-green-500"
                      : datos.adx > 25
                        ? "bg-trading-yellow-500"
                        : "bg-trading-red-500"
                  }`}
                  style={{ width: `${Math.min(datos.adx, 100)}%` }}
                ></div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs font-mono">
                <div
                  className={`text-center p-1 rounded ${datos.adx > 50 ? "bg-trading-green-600/20 text-trading-green-400" : "text-trading-dark-400"}`}
                >
                  Strong
                </div>
                <div
                  className={`text-center p-1 rounded ${datos.adx > 25 && datos.adx <= 50 ? "bg-trading-yellow-600/20 text-trading-yellow-400" : "text-trading-dark-400"}`}
                >
                  Moderate
                </div>
                <div
                  className={`text-center p-1 rounded ${datos.adx <= 25 ? "bg-trading-red-600/20 text-trading-red-400" : "text-trading-dark-400"}`}
                >
                  Weak
                </div>
              </div>
            </div>
          </div>
        </IndicatorCard>

        <IndicatorCard title="STOCHASTIC RSI" icon={<Activity className="h-5 w-5 mr-2 text-trading-green-500" />}>
          <div className="space-y-3">
            <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-trading-dark-300 font-mono">Stoch RSI:</span>
                <span className="text-xl font-bold text-trading-green-400 font-mono">{datos.rsiStoch.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-trading-dark-300 font-mono">Status:</span>
                <span
                  className={`text-sm font-bold font-mono ${
                    datos.rsiStoch > 80
                      ? "text-trading-red-400"
                      : datos.rsiStoch < 20
                        ? "text-trading-green-400"
                        : "text-trading-blue-400"
                  }`}
                >
                  {datos.rsiStoch > 80 ? "Overbought" : datos.rsiStoch < 20 ? "Oversold" : "Neutral"}
                </span>
              </div>
              <div className="w-full bg-trading-dark-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    datos.rsiStoch > 80
                      ? "bg-trading-red-500"
                      : datos.rsiStoch < 20
                        ? "bg-trading-green-500"
                        : "bg-trading-blue-500"
                  }`}
                  style={{ width: `${datos.rsiStoch}%` }}
                ></div>
              </div>
            </div>
          </div>
        </IndicatorCard>
      </div>

      {/* Bollinger Bands and EMAs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <ChartCard
          title="BOLLINGER BANDS"
          icon={<BarChart3 className="h-5 w-5 mr-2 text-trading-blue-500" />}
          data={bollingerData}
          type="bollinger"
          currentValue={datos.precio}
          datos={datos}
        />
        <ChartCard
          title="MOVING AVERAGES"
          icon={<TrendingUp className="h-5 w-5 mr-2 text-trading-green-500" />}
          data={emaData}
          type="ema"
          currentValue={datos.precio}
          datos={datos}
        />
      </div>

      {/* Oscillators with detailed values */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <IndicatorCard title="STOCHASTIC OSCILLATOR" icon={<Activity className="h-5 w-5 mr-2 text-trading-blue-500" />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
                <div className="text-xs text-trading-blue-300 font-mono mb-1">%K Line</div>
                <div className="text-xl font-bold text-trading-blue-400 font-mono">{datos.stochK.toFixed(2)}</div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  {datos.stochK > 80 ? "Overbought" : datos.stochK < 20 ? "Oversold" : "Normal"}
                </div>
              </div>
              <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
                <div className="text-xs text-trading-green-300 font-mono mb-1">%D Line</div>
                <div className="text-xl font-bold text-trading-green-400 font-mono">{datos.stochD.toFixed(2)}</div>
                <div className="text-xs text-trading-dark-300 font-mono">
                  {datos.stochD > 80 ? "Overbought" : datos.stochD < 20 ? "Oversold" : "Normal"}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-trading-blue-300">%K:</span>
                <span className="text-white">{datos.stochK.toFixed(2)}%</span>
              </div>
              <div className="w-full bg-trading-dark-600 rounded-full h-1">
                <div
                  className="bg-trading-blue-500 h-1 rounded-full transition-all duration-500"
                  style={{ width: `${datos.stochK}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs font-mono">
                <span className="text-trading-green-300">%D:</span>
                <span className="text-white">{datos.stochD.toFixed(2)}%</span>
              </div>
              <div className="w-full bg-trading-dark-600 rounded-full h-1">
                <div
                  className="bg-trading-green-500 h-1 rounded-full transition-all duration-500"
                  style={{ width: `${datos.stochD}%` }}
                ></div>
              </div>
            </div>
          </div>
        </IndicatorCard>

        <IndicatorCard title="CCI INDICATOR" icon={<Zap className="h-5 w-5 mr-2 text-trading-yellow-500" />}>
          <div className="space-y-3">
            <div className="bg-trading-dark-700 p-3 rounded border border-trading-dark-600">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-trading-dark-300 font-mono">CCI (20):</span>
                <span
                  className={`text-xl font-bold font-mono ${
                    datos.cci > 100
                      ? "text-trading-red-400"
                      : datos.cci < -100
                        ? "text-trading-green-400"
                        : "text-trading-yellow-400"
                  }`}
                >
                  {datos.cci.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-trading-dark-300 font-mono">Signal:</span>
                <span
                  className={`text-sm font-bold font-mono ${
                    datos.cci > 100
                      ? "text-trading-red-400"
                      : datos.cci < -100
                        ? "text-trading-green-400"
                        : "text-trading-yellow-400"
                  }`}
                >
                  {datos.cci > 100 ? "Overbought" : datos.cci < -100 ? "Oversold" : "Normal Range"}
                </span>
              </div>
              <div className="w-full bg-trading-dark-600 rounded-full h-2 relative overflow-hidden">
                <div className="absolute left-1/2 top-0 w-0.5 h-2 bg-trading-dark-400"></div>
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    datos.cci > 100
                      ? "bg-trading-red-500"
                      : datos.cci < -100
                        ? "bg-trading-green-500"
                        : "bg-trading-yellow-500"
                  }`}
                  style={{
                    width: `${Math.min((Math.abs(datos.cci) / 200) * 50, 50)}%`,
                    marginLeft:
                      datos.cci < 0 ? `${Math.max(50 - Math.min((Math.abs(datos.cci) / 200) * 50, 50), 0)}%` : "50%",
                  }}
                ></div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-xs font-mono mt-2">
                <div className="text-center text-trading-green-300">-200</div>
                <div className="text-center text-trading-dark-300">0</div>
                <div className="text-center text-trading-red-300">+200</div>
              </div>
            </div>
          </div>
        </IndicatorCard>
      </div>

      {/* Support and Resistance with detailed values */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IndicatorCard title="SUPPORT LEVELS" icon={<Shield className="h-5 w-5 mr-2 text-trading-green-500" />}>
          <div className="space-y-3">
            {[
              {
                level: "S1",
                value: datos.s1,
                strength: "Strong",
                distance: ((datos.precio - datos.s1) / datos.precio) * 100,
              },
              {
                level: "S2",
                value: datos.s2,
                strength: "Medium",
                distance: ((datos.precio - datos.s2) / datos.precio) * 100,
              },
              {
                level: "S3",
                value: datos.s3,
                strength: "Weak",
                distance: ((datos.precio - datos.s3) / datos.precio) * 100,
              },
            ].map((support, index) => (
              <div
                key={support.level}
                className="bg-trading-green-600/10 p-3 rounded border border-trading-green-600/20"
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center">
                    <span className="text-trading-green-400 font-mono font-bold mr-2">{support.level}</span>
                    <span className="text-xs text-trading-green-300">{support.strength}</span>
                  </div>
                  <span className="text-white font-mono font-bold">${support.value.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-trading-dark-300 font-mono">Distance:</span>
                  <span className="text-trading-green-300 font-mono">{support.distance.toFixed(2)}% below</span>
                </div>
              </div>
            ))}
          </div>
        </IndicatorCard>

        <IndicatorCard title="RESISTANCE LEVELS" icon={<Target className="h-5 w-5 mr-2 text-trading-red-500" />}>
          <div className="space-y-3">
            {[
              {
                level: "R1",
                value: datos.r1,
                strength: "Strong",
                distance: ((datos.r1 - datos.precio) / datos.precio) * 100,
              },
              {
                level: "R2",
                value: datos.r2,
                strength: "Medium",
                distance: ((datos.r2 - datos.precio) / datos.precio) * 100,
              },
              {
                level: "R3",
                value: datos.r3,
                strength: "Weak",
                distance: ((datos.r3 - datos.precio) / datos.precio) * 100,
              },
            ].map((resistance, index) => (
              <div
                key={resistance.level}
                className="bg-trading-red-600/10 p-3 rounded border border-trading-red-600/20"
              >
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center">
                    <span className="text-trading-red-400 font-mono font-bold mr-2">{resistance.level}</span>
                    <span className="text-xs text-trading-red-300">{resistance.strength}</span>
                  </div>
                  <span className="text-white font-mono font-bold">${resistance.value.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-trading-dark-300 font-mono">Distance:</span>
                  <span className="text-trading-red-300 font-mono">{resistance.distance.toFixed(2)}% above</span>
                </div>
              </div>
            ))}
          </div>
        </IndicatorCard>
      </div>
    </>
  )
}
