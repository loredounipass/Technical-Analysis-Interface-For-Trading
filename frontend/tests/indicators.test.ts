import { describe, it, expect } from "vitest"
import {
  formatVolume,
  formatLevel,
  levelDistance,
  fmt,
  formatMetric,
  formatZoneTime,
} from "@/components/indicators/indicatorFormatters"
import { safeToFixed, ensureMinPoints, TOOLTIP_STYLE } from "@/components/indicators/chartCardUtils"
import { buildCandleAndVolumeSeries } from "@/components/indicators/indicatorSeries"
import {
  getRecommendation,
  getRecommendationColor,
  formatDisplaySymbol,
} from "@/utils/dataUtils"

describe("Technical Indicator Formatters & Utilities", () => {
  describe("formatVolume", () => {
    it("formats billions with 'B' suffix", () => {
      expect(formatVolume(1_500_000_000)).toBe("1.50B")
      expect(formatVolume(25_450_000_000)).toBe("25.45B")
    })

    it("formats millions with 'M' suffix", () => {
      expect(formatVolume(350_000_000)).toBe("350.00M")
      expect(formatVolume(1_250_000)).toBe("1.25M")
    })

    it("formats thousands with 'K' suffix", () => {
      expect(formatVolume(45_000)).toBe("45.00K")
      expect(formatVolume(1_500)).toBe("1.50K")
    })

    it("formats small numbers with 2 decimals", () => {
      expect(formatVolume(520.456)).toBe("520.46")
      expect(formatVolume(0)).toBe("0.00")
    })

    it("handles non-finite and null values gracefully", () => {
      expect(formatVolume(null)).toBe("0.00")
      expect(formatVolume(undefined)).toBe("0.00")
      expect(formatVolume("not-a-number")).toBe("0.00")
    })
  })

  describe("formatLevel & levelDistance", () => {
    it("formats price levels with dollar sign and precision", () => {
      expect(formatLevel(65432.1)).toBe("$65432.10")
      expect(formatLevel(1.23456, 4)).toBe("$1.2346")
      expect(formatLevel(null)).toBe("—")
      expect(formatLevel(undefined)).toBe("—")
    })

    it("calculates percentage distance between two price levels", () => {
      // 110 vs 100 -> +10.00%
      expect(levelDistance(110, 100)).toBe("10.00")
      // 90 vs 100 -> -10.00%
      expect(levelDistance(90, 100)).toBe("-10.00")
      // Zero division guard
      expect(levelDistance(100, 0)).toBe("0.00")
      expect(levelDistance("bad", 100)).toBe("0.00")
    })
  })

  describe("fmt and formatMetric", () => {
    it("formats numbers or returns em-dash for non-numeric values", () => {
      expect(fmt(45.678, 2)).toBe("45.68")
      expect(fmt(undefined)).toBe("\u2014")
      expect(fmt(NaN)).toBe("\u2014")
    })

    it("formats metrics with custom suffix", () => {
      expect(formatMetric(85.4, "%")).toBe("85.40%")
      expect(formatMetric(120, " USD", 0)).toBe("120 USD")
      expect(formatMetric(undefined, "%")).toBe("—")
      expect(formatMetric(NaN, "%")).toBe("—")
    })

    it("formats timestamps into readable date strings", () => {
      expect(formatZoneTime(null)).toBe("—")
      expect(formatZoneTime(0)).toBe("—")
      const ts = new Date("2026-01-15T12:30:00Z").getTime()
      const formatted = formatZoneTime(ts)
      expect(formatted).not.toBe("—")
      expect(typeof formatted).toBe("string")
    })
  })

  describe("chartCardUtils", () => {
    it("safeToFixed formats numbers or returns fallback", () => {
      expect(safeToFixed(12.3456, 2)).toBe("12.35")
      expect(safeToFixed(null, 2)).toBe("0.00")
      expect(safeToFixed("invalid", 3)).toBe("0.000")
    })

    it("ensureMinPoints duplicates first point when single point array is given", () => {
      const singlePoint = [{ name: "point1", value: 100 }]
      const result = ensureMinPoints(singlePoint)
      expect(result.length).toBe(2)
      expect(result[0].name).toBe("point1_dup")
      expect(result[1].name).toBe("point1")
    })

    it("ensureMinPoints leaves multi-point arrays untouched", () => {
      const multi = [{ name: "p1" }, { name: "p2" }]
      const result = ensureMinPoints(multi)
      expect(result.length).toBe(2)
    })

    it("TOOLTIP_STYLE matches Synapse dark terminal aesthetics", () => {
      expect(TOOLTIP_STYLE.backgroundColor).toContain("rgba(8, 18, 28")
      expect(TOOLTIP_STYLE.border).toBe("1px solid #16283d")
      expect(TOOLTIP_STYLE.color).toBe("#ffffff")
    })
  })

  describe("Candle and Volume Series Construction", () => {
    it("transforms raw backend OHLC history into candleData and volumeChartData", () => {
      const mockBackendData = {
        history: {
          opens: [100, 105, 102],
          highs: [110, 108, 107],
          lows: [98, 101, 99],
          closes: [105, 102, 106],
          volumes: [1000, 1500, 2000],
          times: [
            "2026-01-01T10:00:00Z",
            "2026-01-01T10:15:00Z",
            "2026-01-01T10:30:00Z",
          ],
          ema50: [101, 102, 103],
          ema100: [99, 100, 101],
          ema200: [95, 96, 97],
        },
      }

      const { candleData, volumeChartData } = buildCandleAndVolumeSeries(mockBackendData)

      expect(candleData.length).toBe(3)
      expect(volumeChartData.length).toBe(3)

      // Candle 0 check (100 -> 105 is Bullish)
      expect(candleData[0].open).toBe(100)
      expect(candleData[0].close).toBe(105)
      expect(candleData[0].high).toBe(110)
      expect(candleData[0].low).toBe(98)
      expect(candleData[0].wickRange).toEqual([98, 110])
      expect(candleData[0].bodyRange).toEqual([100, 105])
      expect(candleData[0].ema50).toBe(101)

      // Volume 0 check
      expect(volumeChartData[0].volume).toBe(1000)
      expect(volumeChartData[0].isBull).toBe(true)

      // Candle 1 check (105 -> 102 is Bearish)
      expect(volumeChartData[1].isBull).toBe(false)
    })

    it("handles missing history gracefully without throwing", () => {
      const { candleData, volumeChartData } = buildCandleAndVolumeSeries({})
      expect(candleData).toEqual([])
      expect(volumeChartData).toEqual([])
    })
  })

  describe("Market Signal Recommendations & Formatter", () => {
    it("returns COMPRA when buySignals > sellSignals", () => {
      expect(getRecommendation({ buySignals: 12, sellSignals: 4 })).toBe("COMPRA")
      expect(getRecommendationColor("COMPRA")).toBe("bg-trading-green-600")
    })

    it("returns VENTA when sellSignals > buySignals", () => {
      expect(getRecommendation({ buySignals: 3, sellSignals: 9 })).toBe("VENTA")
      expect(getRecommendationColor("VENTA")).toBe("bg-trading-red-600")
    })

    it("returns NEUTRAL when buySignals equals sellSignals", () => {
      expect(getRecommendation({ buySignals: 5, sellSignals: 5 })).toBe("NEUTRAL")
      expect(getRecommendationColor("NEUTRAL")).toBe("bg-trading-dark-600")
    })

    it("formats display symbols by removing Yahoo exchange suffixes and formatting forex", () => {
      expect(formatDisplaySymbol("EURUSD=X")).toBe("EUR/USD")
      expect(formatDisplaySymbol("GBPUSD=X")).toBe("GBP/USD")
      expect(formatDisplaySymbol("GC=F")).toBe("GC")
      expect(formatDisplaySymbol("BTCUSDT")).toBe("BTCUSDT")
      expect(formatDisplaySymbol("")).toBe("")
      expect(formatDisplaySymbol(null)).toBe("")
    })
  })
})
