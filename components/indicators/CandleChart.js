"use client"
import React from 'react'
import {
  ResponsiveContainer,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
  Cell,
  Line
} from 'recharts'

const CandleChart = ({ data, decimales = 2 }) => {
  if (!data || data.length === 0) return null

  // Calculate domain for Y axis with padding
  const allValues = data.flatMap(d => [d.high, d.low])
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const padding = (maxVal - minVal) * 0.1
  const domain = [minVal - padding, maxVal + padding]

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload
      return (
        <div className="bg-trading-dark-800 border border-trading-dark-600 p-2 rounded shadow-xl font-mono text-[10px]">
          <div className="text-gray-400 mb-1">{d.time}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-gray-500">O:</span> <span className="text-white">${d.open.toFixed(decimales)}</span>
            <span className="text-gray-500">H:</span> <span className="text-white">${d.high.toFixed(decimales)}</span>
            <span className="text-gray-500">L:</span> <span className="text-white">${d.low.toFixed(decimales)}</span>
            <span className="text-gray-500">C:</span> <span className={`${d.close >= d.open ? 'text-trading-green-400' : 'text-trading-red-400'}`}>${d.close.toFixed(decimales)}</span>
          </div>
        </div>
      )
    }
    return null
  }

  // Custom shape for the Candlestick
  const Candlestick = (props) => {
    const { x, y, width, height, open, close, high, low } = props
    const isBullish = close >= open
    const color = isBullish ? '#10b981' : '#ef4444'
    
    // x is the left position, width is the bar width
    const centerX = x + width / 2
    
    // Y positions are relative to the chart's coordinate system
    // props.y is the top of the bar, props.height is the size of the bar
    
    // We need to map the high/low values to pixel positions.
    // Recharts bars give us the y and height of the bar based on the value.
    // But for the wick, we need to know the scale.
    // A trick is to use another Bar for the wick or just a Line.
    
    return (
      <g>
        {/* Wick (Line) */}
        {/* The wick is drawn via a separate Bar in the ComposedChart for simplicity, 
            but we could also do it here if we had the scale. 
            Let's use the separate Bar approach for the wick. */}
      </g>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
        <XAxis 
          dataKey="time" 
          tick={{ fill: '#737373', fontSize: 10 }} 
          minTickGap={30}
          axisLine={false}
          tickLine={false}
        />
        <YAxis 
          domain={domain} 
          orientation="right"
          tick={{ fill: '#737373', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v > 1 ? v.toFixed(2) : v.toFixed(5)}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
        
        {/* Wick: from low to high */}
        <Bar
          dataKey="wickRange"
          barSize={1}
        >
          {data.map((entry, index) => (
             <Cell key={`wick-${index}`} fill={entry.close >= entry.open ? '#10b981' : '#ef4444'} fillOpacity={0.6} />
          ))}
        </Bar>

        {/* Body: from open to close */}
        <Bar
          dataKey="bodyRange"
          barSize={8}
        >
          {data.map((entry, index) => (
            <Cell key={`body-${index}`} fill={entry.close >= entry.open ? '#10b981' : '#ef4444'} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export default CandleChart
