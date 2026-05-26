"use client"

import { useState, useEffect, useRef } from "react"
import { Newspaper, ExternalLink, Loader2, Globe, Clock, TrendingUp, Zap, ArrowUpRight } from "lucide-react"
import Link from "next/link"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:5000/api"

const COINS = [
  { symbol: "BTCUSDT", name: "Bitcoin", short: "BTC", color: "#f7931a", gradient: "from-amber-500/20 to-orange-600/5" },
  { symbol: "ETHUSDT", name: "Ethereum", short: "ETH", color: "#627eea", gradient: "from-indigo-500/20 to-blue-600/5" },
  { symbol: "SOLUSDT", name: "Solana", short: "SOL", color: "#9945ff", gradient: "from-purple-500/20 to-violet-600/5" },
  { symbol: "PEPEUSDT", name: "Pepe", short: "PEPE", color: "#3cc68a", gradient: "from-emerald-500/20 to-green-600/5" },
]

export default function NewsPage() {
  const [newsByCoin, setNewsByCoin] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeCoin, setActiveCoin] = useState("ALL")
  const [imgErrors, setImgErrors] = useState({})
  const [visibleCards, setVisibleCards] = useState(new Set())
  const gridRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    Promise.all(
      COINS.map(coin =>
        fetch(`${API_BASE_URL}/news/${coin.symbol}`)
          .then(r => r.json())
          .then(articles => ({ symbol: coin.symbol, articles: Array.isArray(articles) ? articles : [] }))
          .catch(() => ({ symbol: coin.symbol, articles: [] }))
      )
    ).then(results => {
      if (!cancelled) {
        const grouped = {}
        results.forEach(r => { grouped[r.symbol] = r.articles })
        setNewsByCoin(grouped)
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [])

  // Intersection observer for card reveal animations
  useEffect(() => {
    if (loading) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setVisibleCards(prev => new Set([...prev, entry.target.dataset.idx]))
          }
        })
      },
      { threshold: 0.1, rootMargin: "50px" }
    )

    const cards = document.querySelectorAll("[data-news-card]")
    cards.forEach(card => observer.observe(card))
    return () => observer.disconnect()
  }, [loading, activeCoin])

  const allNews = COINS.flatMap(coin =>
    (newsByCoin[coin.symbol] || []).map(a => ({ ...a, coin: coin.symbol }))
  ).sort((a, b) => (b.published || 0) - (a.published || 0))

  const filteredNews = activeCoin === "ALL"
    ? allNews
    : (newsByCoin[activeCoin] || []).map(a => ({ ...a, coin: activeCoin }))

  const formatTime = (ts) => {
    if (!ts) return ""
    const d = new Date(ts * 1000)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    if (diff < 172800) return "Yesterday"
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const featured = filteredNews[0]
  const rest = filteredNews.slice(1)

  const getCoinMeta = (symbol) => COINS.find(c => c.symbol === symbol)

  return (
    <div className="min-h-screen" style={{ background: "#05070a" }}>
      {/* Animated grid background */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `linear-gradient(rgba(16, 185, 129, 0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.5) 1px, transparent 1px)`,
        backgroundSize: "60px 60px",
      }} />

      {/* Radial glow */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)" }} />

      {/* Corner accents */}
      <div className="fixed top-0 left-0 w-32 h-32 opacity-20 pointer-events-none z-50"
        style={{ borderTop: "1px solid #10b981", borderLeft: "1px solid #10b981" }} />
      <div className="fixed bottom-0 right-0 w-32 h-32 opacity-20 pointer-events-none z-50"
        style={{ borderBottom: "1px solid #10b981", borderRight: "1px solid #10b981" }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-8">
        {/* === Header === */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-4">
            <Link href="/"
              className="group flex items-center gap-2 text-xs font-mono text-gray-600 hover:text-emerald-400 transition-all duration-300 px-3 py-1.5 rounded-lg hover:bg-emerald-400/5"
            >
              <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
            <div className="h-5 w-px bg-gray-800" />
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 flex items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 182, 212, 0.08))",
                  border: "1px solid rgba(16, 185, 129, 0.15)",
                  boxShadow: "0 0 20px rgba(16, 185, 129, 0.08)",
                }}
              >
                <Zap className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-100 tracking-tight">Market News</h1>
                <p className="text-[10px] font-mono text-gray-600 tracking-wider">REAL-TIME CRYPTO FEED</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                background: "rgba(16, 185, 129, 0.04)",
                border: "1px solid rgba(16, 185, 129, 0.08)",
                backdropFilter: "blur(8px)",
              }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-mono text-emerald-400/70 tracking-wider font-medium">{filteredNews.length} STORIES</span>
            </div>
          </div>
        </header>

        {/* === Coin Filter Tabs === */}
        <nav className="mb-8">
          <div className="flex items-center gap-2 p-1 rounded-2xl overflow-x-auto hide-scrollbar"
            style={{
              background: "rgba(17, 17, 17, 0.4)",
              border: "1px solid rgba(255,255,255,0.03)",
            }}
          >
            {[{ symbol: "ALL", name: "All News", short: "ALL", color: "#10b981" }, ...COINS].map(coin => {
              const isActive = activeCoin === coin.symbol
              const count = coin.symbol === "ALL"
                ? allNews.length
                : (newsByCoin[coin.symbol] || []).length
              return (
                <button
                  key={coin.symbol}
                  onClick={() => { setActiveCoin(coin.symbol); setVisibleCards(new Set()) }}
                  className="relative flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 flex-shrink-0 whitespace-nowrap"
                  style={{
                    background: isActive ? "rgba(17, 17, 17, 0.9)" : "transparent",
                    color: isActive ? "#e2e8f0" : "rgba(148, 163, 184, 0.5)",
                    border: isActive ? `1px solid ${coin.color}30` : "1px solid transparent",
                    boxShadow: isActive ? `0 0 20px ${coin.color}10, inset 0 1px 0 rgba(255,255,255,0.03)` : "none",
                  }}
                >
                  {coin.symbol !== "ALL" && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{
                      background: coin.color,
                      boxShadow: isActive ? `0 0 8px ${coin.color}60` : "none",
                      opacity: isActive ? 1 : 0.4,
                    }} />
                  )}
                  <span className="font-mono text-[13px]">{coin.short || coin.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{
                    background: isActive ? `${coin.color}15` : "rgba(255,255,255,0.03)",
                    color: isActive ? coin.color : "rgba(148, 163, 184, 0.3)",
                  }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 border-t-emerald-400 animate-spin" />
              <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-b-cyan-400/30 animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>
            <p className="text-xs font-mono text-gray-600 animate-pulse">Loading market feed...</p>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              <Globe className="w-7 h-7 text-gray-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">No headlines available</p>
              <p className="text-xs text-gray-700 mt-1">Check back shortly for updates</p>
            </div>
          </div>
        ) : (
          <>
            {/* === HERO / Featured Article === */}
            {featured && (() => {
              const coinMeta = getCoinMeta(featured.coin)
              const hasImg = featured.imageurl && !imgErrors["hero"]
              return (
                <a
                  href={featured.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block mb-16"
                  data-news-card
                  data-idx="hero"
                >
                  <div className="relative rounded-2xl overflow-hidden transition-all duration-500"
                    style={{
                      background: "rgba(17, 17, 17, 0.5)",
                      border: "1px solid rgba(255,255,255,0.04)",
                      boxShadow: "0 4px 40px rgba(0,0,0,0.3)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.border = `1px solid ${coinMeta?.color || '#10b981'}25`
                      e.currentTarget.style.boxShadow = `0 8px 60px rgba(0,0,0,0.4), 0 0 40px ${coinMeta?.color || '#10b981'}08`
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(255,255,255,0.04)"
                      e.currentTarget.style.boxShadow = "0 4px 40px rgba(0,0,0,0.3)"
                    }}
                  >
                    <div className="relative overflow-hidden" style={{ height: "420px", background: "#080a0e" }}>
                      {hasImg ? (
                        <img
                          src={featured.imageurl}
                          alt={featured.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1200ms] ease-out"
                          onError={() => setImgErrors(p => ({ ...p, hero: true }))}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{
                          background: `linear-gradient(135deg, ${coinMeta?.color || '#10b981'}10, transparent)`,
                        }}>
                          <Newspaper className="w-16 h-16 text-gray-800/50" />
                        </div>
                      )}
                      {/* Gradient overlays */}
                      <div className="absolute inset-0" style={{
                        background: "linear-gradient(180deg, rgba(5,7,10,0.1) 0%, rgba(5,7,10,0.3) 40%, rgba(5,7,10,0.95) 100%)",
                      }} />
                      <div className="absolute inset-0" style={{
                        background: `linear-gradient(135deg, ${coinMeta?.color || '#10b981'}08, transparent 60%)`,
                      }} />

                      {/* Content overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 lg:p-10">
                        <div className="flex flex-wrap items-center gap-3 mb-4">
                          {coinMeta && (
                            <span className="text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg tracking-wider"
                              style={{
                                background: `${coinMeta.color}18`,
                                color: coinMeta.color,
                                border: `1px solid ${coinMeta.color}30`,
                                backdropFilter: "blur(12px)",
                                boxShadow: `0 0 12px ${coinMeta.color}10`,
                              }}
                            >
                              {coinMeta.name.toUpperCase()}
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-gray-400 flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                            <Globe className="w-3 h-3" />
                            {featured.source}
                          </span>
                          <span className="text-[11px] font-mono text-gray-500 flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg backdrop-blur-sm">
                            <Clock className="w-3 h-3" />
                            {formatTime(featured.published)}
                          </span>
                        </div>
                        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white group-hover:text-emerald-200 transition-colors duration-500 leading-tight line-clamp-3 max-w-4xl"
                          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}
                        >
                          {featured.title}
                        </h2>
                        {featured.body && (
                          <p className="text-sm sm:text-base text-gray-400 mt-3 line-clamp-2 max-w-3xl leading-relaxed">
                            {featured.body}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-5 text-emerald-400/70 group-hover:text-emerald-400 transition-colors">
                          <span className="text-xs font-mono font-medium tracking-wider">READ FULL ARTICLE</span>
                          <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                      </div>

                      {/* Featured badge */}
                      <div className="absolute top-5 left-5">
                        <span className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest px-3 py-1.5 rounded-lg text-emerald-400"
                          style={{
                            background: "rgba(5, 7, 10, 0.7)",
                            border: "1px solid rgba(16, 185, 129, 0.2)",
                            backdropFilter: "blur(12px)",
                          }}
                        >
                          <TrendingUp className="w-3 h-3" />
                          FEATURED
                        </span>
                      </div>
                    </div>
                  </div>
                </a>
              )
            })()}

            {/* === News Grid === */}
            <div ref={gridRef} className="news-grid">
              {rest.map((article, i) => {
                const coinMeta = getCoinMeta(article.coin)
                const hasImg = article.imageurl && !imgErrors[`card-${i}`]
                const isVisible = visibleCards.has(String(i))
                return (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                    data-news-card
                    data-idx={i}
                    style={{
                      opacity: isVisible ? 1 : 0,
                      transform: isVisible ? "translateY(0)" : "translateY(24px)",
                      transition: `opacity 0.5s ease ${(i % 3) * 0.08}s, transform 0.5s ease ${(i % 3) * 0.08}s`,
                    }}
                  >
                    <div className="relative rounded-2xl overflow-hidden h-full transition-all duration-300"
                      style={{
                        background: "rgba(17, 17, 17, 0.4)",
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.border = `1px solid ${coinMeta?.color || '#10b981'}20`
                        e.currentTarget.style.boxShadow = `0 8px 40px rgba(0,0,0,0.3), 0 0 30px ${coinMeta?.color || '#10b981'}06`
                        e.currentTarget.style.transform = "translateY(-4px)"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.border = "1px solid rgba(255,255,255,0.04)"
                        e.currentTarget.style.boxShadow = "none"
                        e.currentTarget.style.transform = "translateY(0)"
                      }}
                    >
                      {/* Card image */}
                      <div className="relative overflow-hidden" style={{ height: "220px", background: "#080a0e" }}>
                        {hasImg ? (
                          <img
                            src={article.imageurl}
                            alt={article.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[900ms] ease-out"
                            onError={() => setImgErrors(p => ({ ...p, [`card-${i}`]: true }))}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{
                            background: `linear-gradient(135deg, ${coinMeta?.color || '#10b981'}08, transparent)`,
                          }}>
                            <Newspaper className="w-10 h-10 text-gray-800/40" />
                          </div>
                        )}
                        {/* Gradient overlay */}
                        <div className="absolute inset-0" style={{
                          background: "linear-gradient(180deg, transparent 30%, rgba(5,7,10,0.9) 100%)",
                        }} />
                        {/* Colored accent line at top */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                          style={{ background: `linear-gradient(90deg, transparent, ${coinMeta?.color || '#10b981'}, transparent)` }}
                        />

                        {/* Coin badge */}
                        {coinMeta && (
                          <div className="absolute top-4 left-4">
                            <span className="text-[10px] font-mono font-bold px-2.5 py-1.5 rounded-lg tracking-wider"
                              style={{
                                background: "rgba(5, 7, 10, 0.6)",
                                color: coinMeta.color,
                                border: `1px solid ${coinMeta.color}30`,
                                backdropFilter: "blur(12px)",
                              }}
                            >
                              {coinMeta.short}
                            </span>
                          </div>
                        )}

                        {/* Time badge */}
                        <div className="absolute bottom-4 right-4">
                          <span className="flex items-center gap-1.5 text-[10px] font-mono text-gray-400 px-2.5 py-1 rounded-lg"
                            style={{
                              background: "rgba(5, 7, 10, 0.5)",
                              backdropFilter: "blur(8px)",
                            }}
                          >
                            <Clock className="w-3 h-3 text-gray-500" />
                            {formatTime(article.published)}
                          </span>
                        </div>
                      </div>

                      {/* Card content */}
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-[10px] font-mono text-gray-600 tracking-wider uppercase">{article.source}</span>
                          <span className="w-1 h-1 rounded-full bg-gray-800" />
                          <span className="text-[10px] font-mono text-gray-700">
                            {article.categories?.split("|")?.[0] || "Markets"}
                          </span>
                        </div>
                        <h3 className="text-[15px] font-semibold text-gray-200 group-hover:text-emerald-300 transition-colors duration-300 leading-snug line-clamp-2 mb-2">
                          {article.title}
                        </h3>
                        {article.body && (
                          <p className="text-[12px] text-gray-600 leading-relaxed line-clamp-2">{article.body}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-4 text-emerald-500/50 group-hover:text-emerald-400/80 transition-colors">
                          <span className="text-[10px] font-mono font-medium tracking-wider">READ MORE</span>
                          <ArrowUpRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </div>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          </>
        )}

        {/* === Footer === */}
        <footer className="mt-16 pb-8">
          <div className="h-px w-full mb-8" style={{
            background: "linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.1), transparent)",
          }} />
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl"
                style={{ background: "rgba(16, 185, 129, 0.03)", border: "1px solid rgba(16, 185, 129, 0.06)" }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-mono text-gray-600 tracking-wider">POWERED BY CRYPTOCOMPARE</span>
              </div>
            </div>
            <p className="text-[10px] font-mono text-gray-800 tracking-wider">
              DATA REFRESHES AUTOMATICALLY
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}
