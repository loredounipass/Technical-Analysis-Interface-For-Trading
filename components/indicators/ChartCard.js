"use client"

import React from "react"
import RsiOscillatorChart from "@/components/indicators/RsiOscillatorChart"
import MacdIndicatorChart from "@/components/indicators/MacdIndicatorChart"
import BollingerBandsChart from "@/components/indicators/BollingerBandsChart"
import MovingAveragesChart from "@/components/indicators/MovingAveragesChart"
import StochasticOscillatorChart from "@/components/indicators/StochasticOscillatorChart"
import StochasticRsiChart from "@/components/indicators/StochasticRsiChart"

// Dispatcher de tarjetas de indicadores: selecciona el componente de grafico
// segun `type`. Cada tipo vive en su propio modulo; la navegacion pan/zoom y los
// helpers de formato/tooltip se comparten via useChartCardNav y chartCardUtils.
const ChartCard = ({ title, type, datos = {} }) => {
  switch (type) {
    case "rsi":
      return <RsiOscillatorChart title={title} datos={datos} />
    case "macd":
      return <MacdIndicatorChart title={title} datos={datos} />
    case "bollinger":
      return <BollingerBandsChart title={title} datos={datos} />
    case "ema":
      return <MovingAveragesChart title={title} datos={datos} />
    case "stoch":
      return <StochasticOscillatorChart title={title} datos={datos} />
    case "stochRsi":
      return <StochasticRsiChart title={title} datos={datos} />
    default:
      return null
  }
}

export default React.memo(ChartCard)
