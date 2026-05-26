import IndicatorCard from "@/components/indicators/IndicatorCard"
import ChartCard from "@/components/indicators/ChartCard"
import CandleChart from "@/components/indicators/CandleChart"
import { Activity, Shield, Target, BarChart4, ArrowUpDown, CandlestickChart, Gauge, Crosshair, Percent, Waves, GitCompare, Compass } from "lucide-react"

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
        <IndicatorCard title="LIVE MARKET PRICE ACTION" icon={<CandlestickChart className="h-5 w-5 mr-2 text-emerald-400" />}>
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
          icon={<Gauge className="h-5 w-5 mr-2 text-trading-blue-500" />}
          data={rsiData}
          type="rsi"
          currentValue={datos.rsi}
          datos={datos}
        />
        <ChartCard
          title="MACD INDICATOR"
          icon={<Crosshair className="h-5 w-5 mr-2 text-trading-green-500" />}
          data={macdData}
          type="macd"
          currentValue={datos.macdValue}
          datos={datos}
        />
      </div>

      {/* Volume and ADX with detailed numbers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <IndicatorCard title="VOLUME ANALYSIS" icon={<BarChart4 className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />}>
          <div className="space-y-3">
            <div className="bg-[#05070a]/50 p-3 rounded border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">24h Vol</span>
                <span className="text-lg font-bold text-yellow-400 font-mono tabular-nums">
                  {(datos.volumen / 1000000).toFixed(2)}M
                </span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">Raw</span>
                <span className="text-[11px] text-white font-mono tabular-nums">{datos.volumen.toLocaleString()}</span>
              </div>
              <div className="w-full bg-gray-900 rounded-sm h-1.5 overflow-hidden flex">
                <div
                  className="bg-yellow-500 h-1.5 transition-all duration-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]"
                  style={{ width: `${Math.min((datos.volumen / 2000000) * 100, 100)}%` }}
                ></div>
              </div>
              <div className="text-[9px] text-gray-500 font-mono mt-1 text-right tracking-widest uppercase">
                Strength: {datos.volumen > 1000000 ? "HIGH" : datos.volumen > 500000 ? "MED" : "LOW"}
              </div>
            </div>
          </div>
        </IndicatorCard>

        <IndicatorCard title="ADX TREND STRENGTH" icon={<ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-blue-500" />}>
          <div className="space-y-3">
            <div className="bg-[#05070a]/50 p-3 rounded border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">ADX Value</span>
                <span className="text-xl font-bold text-blue-400 font-mono tabular-nums">{datos.adx.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-900 rounded-sm h-1.5 mb-2 overflow-hidden flex relative">
                {/* Scale markers */}
                <div className="absolute left-1/4 top-0 bottom-0 w-[1px] bg-white/10" />
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-white/10" />
                <div className="absolute left-3/4 top-0 bottom-0 w-[1px] bg-white/10" />
                
                <div
                  className={`h-1.5 transition-all duration-500 ${
                    datos.adx > 50 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                    datos.adx > 25 ? "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" : 
                    "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                  }`}
                  style={{ width: `${Math.min(datos.adx, 100)}%` }}
                ></div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[9px] font-mono tracking-widest uppercase">
                <div className={`text-center p-1 rounded border ${datos.adx > 50 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "text-gray-600 border-transparent"}`}>Strong</div>
                <div className={`text-center p-1 rounded border ${datos.adx > 25 && datos.adx <= 50 ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" : "text-gray-600 border-transparent"}`}>Med</div>
                <div className={`text-center p-1 rounded border ${datos.adx <= 25 ? "bg-red-500/10 text-red-400 border-red-500/30" : "text-gray-600 border-transparent"}`}>Weak</div>
              </div>
            </div>
          </div>
        </IndicatorCard>

        <IndicatorCard title="STOCHASTIC RSI" icon={<Percent className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />}>
          <div className="space-y-3">
            <div className="bg-[#05070a]/50 p-3 rounded border border-white/5">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">Value</span>
                <span className="text-xl font-bold text-emerald-400 font-mono tabular-nums">{datos.rsiStoch.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">Status</span>
                <span className={`text-[10px] font-bold font-mono uppercase tracking-widest ${
                  datos.rsiStoch > 80 ? "text-red-400" : 
                  datos.rsiStoch < 20 ? "text-emerald-400" : "text-blue-400"
                }`}>
                  {datos.rsiStoch > 80 ? "OB" : datos.rsiStoch < 20 ? "OS" : "NEUT"}
                </span>
              </div>
              <div className="w-full bg-gray-900 rounded-sm h-1.5 overflow-hidden relative flex">
                <div className="absolute left-[20%] top-0 bottom-0 w-[1px] bg-emerald-500/50" />
                <div className="absolute left-[80%] top-0 bottom-0 w-[1px] bg-red-500/50" />
                <div
                  className={`h-1.5 transition-all duration-500 ${
                    datos.rsiStoch > 80 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : 
                    datos.rsiStoch < 20 ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                    "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
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
          icon={<Waves className="h-5 w-5 mr-2 text-trading-blue-500" />}
          data={bollingerData}
          type="bollinger"
          currentValue={datos.precio}
          datos={datos}
        />
        <ChartCard
          title="MOVING AVERAGES"
          icon={<GitCompare className="h-5 w-5 mr-2 text-trading-green-500" />}
          data={emaData}
          type="ema"
          currentValue={datos.precio}
          datos={datos}
        />
      </div>

      {/* Oscillators with detailed values */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <IndicatorCard title="STOCHASTIC OSCILLATOR" icon={<Activity className="h-3.5 w-3.5 mr-1.5 text-blue-500" />}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#05070a]/50 p-3 rounded border border-white/5">
                <div className="text-[10px] text-blue-500/70 font-mono tracking-widest uppercase mb-1">%K LINE</div>
                <div className="text-xl font-bold text-blue-400 font-mono tabular-nums">{datos.stochK.toFixed(2)}</div>
                <div className="text-[9px] text-gray-500 font-mono tracking-widest uppercase">
                  {datos.stochK > 80 ? "OB" : datos.stochK < 20 ? "OS" : "NEUT"}
                </div>
              </div>
              <div className="bg-[#05070a]/50 p-3 rounded border border-white/5">
                <div className="text-[10px] text-emerald-500/70 font-mono tracking-widest uppercase mb-1">%D LINE</div>
                <div className="text-xl font-bold text-emerald-400 font-mono tabular-nums">{datos.stochD.toFixed(2)}</div>
                <div className="text-[9px] text-gray-500 font-mono tracking-widest uppercase">
                  {datos.stochD > 80 ? "OB" : datos.stochD < 20 ? "OS" : "NEUT"}
                </div>
              </div>
            </div>
            <div className="space-y-2 pt-2 border-t border-white/5">
              <div className="flex justify-between text-[10px] font-mono tracking-wider">
                <span className="text-blue-400">%K</span>
                <span className="text-white tabular-nums">{datos.stochK.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-900 rounded-sm h-1 overflow-hidden relative">
                <div className="absolute left-[20%] top-0 bottom-0 w-[1px] bg-emerald-500/50" />
                <div className="absolute left-[80%] top-0 bottom-0 w-[1px] bg-red-500/50" />
                <div className="bg-blue-500 h-1 transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" style={{ width: `${datos.stochK}%` }} />
              </div>
              <div className="flex justify-between text-[10px] font-mono tracking-wider">
                <span className="text-emerald-400">%D</span>
                <span className="text-white tabular-nums">{datos.stochD.toFixed(2)}</span>
              </div>
              <div className="w-full bg-gray-900 rounded-sm h-1 overflow-hidden relative">
                <div className="absolute left-[20%] top-0 bottom-0 w-[1px] bg-emerald-500/50" />
                <div className="absolute left-[80%] top-0 bottom-0 w-[1px] bg-red-500/50" />
                <div className="bg-emerald-500 h-1 transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" style={{ width: `${datos.stochD}%` }} />
              </div>
            </div>
          </div>
        </IndicatorCard>

        <IndicatorCard title="CCI INDICATOR" icon={<Compass className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />}>
          <div className="space-y-3">
            <div className="bg-[#05070a]/50 p-4 rounded border border-white/5 h-full">
              <div className="flex justify-between items-center mb-4">
                <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">CCI (20)</span>
                <span className={`text-2xl font-bold font-mono tabular-nums ${
                    datos.cci > 100 ? "text-red-400" : 
                    datos.cci < -100 ? "text-emerald-400" : "text-yellow-400"
                  }`}>
                  {datos.cci.toFixed(2)}
                </span>
              </div>
              
              <div className="w-full bg-gray-900 rounded-sm h-2 relative overflow-hidden flex items-center shadow-inner">
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-gray-600 z-10" />
                <div className="absolute left-[25%] top-0 bottom-0 w-[1px] bg-emerald-500/50 z-10" />
                <div className="absolute left-[75%] top-0 bottom-0 w-[1px] bg-red-500/50 z-10" />
                <div
                  className={`h-2 transition-all duration-500 ${
                    datos.cci > 100 ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" : 
                    datos.cci < -100 ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" : 
                    "bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.8)]"
                  }`}
                  style={{
                    width: `${Math.min((Math.abs(datos.cci) / 200) * 50, 50)}%`,
                    marginLeft: datos.cci < 0 ? `${Math.max(50 - Math.min((Math.abs(datos.cci) / 200) * 50, 50), 0)}%` : "50%",
                  }}
                ></div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[9px] font-mono mt-2 tracking-widest uppercase">
                <div className="text-left text-emerald-500">-200</div>
                <div className="text-center text-gray-600">0</div>
                <div className="text-right text-red-500">+200</div>
              </div>
            </div>
          </div>
        </IndicatorCard>
      </div>

      {/* Support and Resistance with detailed values */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <IndicatorCard title="SUPPORT LEVELS" icon={<Shield className="h-3.5 w-3.5 mr-1.5 text-emerald-500" />}>
          <div className="space-y-1">
            {[
              { level: "S1", value: datos.s1, strength: "STR", distance: ((datos.precio - datos.s1) / datos.precio) * 100 },
              { level: "S2", value: datos.s2, strength: "MED", distance: ((datos.precio - datos.s2) / datos.precio) * 100 },
              { level: "S3", value: datos.s3, strength: "WK",  distance: ((datos.precio - datos.s3) / datos.precio) * 100 },
            ].map((support, index) => (
              <div key={support.level} className="flex items-center justify-between bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors p-2 rounded border border-emerald-500/10">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-400 font-mono text-[10px] font-bold w-4">{support.level}</span>
                  <span className="text-[9px] text-emerald-500/60 font-mono uppercase">{support.strength}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-white font-mono tabular-nums text-sm">${support.value.toFixed(2)}</span>
                  <span className="text-[9px] text-emerald-400/80 font-mono tabular-nums">-{support.distance.toFixed(2)}%</span>
                </div>
              </div>
            ))}
          </div>
        </IndicatorCard>

        <IndicatorCard title="RESISTANCE LEVELS" icon={<Target className="h-3.5 w-3.5 mr-1.5 text-red-500" />}>
          <div className="space-y-1">
            {[
              { level: "R1", value: datos.r1, strength: "STR", distance: ((datos.r1 - datos.precio) / datos.precio) * 100 },
              { level: "R2", value: datos.r2, strength: "MED", distance: ((datos.r2 - datos.precio) / datos.precio) * 100 },
              { level: "R3", value: datos.r3, strength: "WK",  distance: ((datos.r3 - datos.precio) / datos.precio) * 100 },
            ].map((resistance, index) => (
              <div key={resistance.level} className="flex items-center justify-between bg-red-500/5 hover:bg-red-500/10 transition-colors p-2 rounded border border-red-500/10">
                <div className="flex items-center gap-3">
                  <span className="text-red-400 font-mono text-[10px] font-bold w-4">{resistance.level}</span>
                  <span className="text-[9px] text-red-500/60 font-mono uppercase">{resistance.strength}</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-white font-mono tabular-nums text-sm">${resistance.value.toFixed(2)}</span>
                  <span className="text-[9px] text-red-400/80 font-mono tabular-nums">+{resistance.distance.toFixed(2)}%</span>
                </div>
              </div>
            ))}
          </div>
        </IndicatorCard>
      </div>
    </>
  )
}
