const baseApi = 'https://cryptologos.cc/logos'

const normalizeCoin = (coin) => {
    if (coin === undefined || coin === null) return ''

    const normalized = String(coin).trim().toLowerCase()
    const aliases = {
        ethereum: 'eth',
        polygon: 'matic',
        avalanche: 'avax',
        fantom: 'ftm',
        optimism: 'op',
        'binance smart chain': 'bnb',
        binance: 'bnb'
    }

    return aliases[normalized] || normalized
}

// 'BTCUSDT' -> 'btc', 'PEPEUSDT' -> 'pepe', 'AAPL' -> 'aapl'
const getCoinTicker = (symbol) => {
    return normalizeCoin(String(symbol || '').replace(/USDT$|USDC$|BUSD$/i, ''))
}

const getCoinFallbackLogo = (symbol, ticker) => {
    const normalizedTicker = ticker || getCoinTicker(symbol)
    const label = (String(symbol || 'COIN').trim().toUpperCase().replace(/USDT$/, '').slice(0, 6) || 'COIN')
    const colors = {
        btc: '#F7931A',
        eth: '#627EEA',
        sol: '#9945FF',
        pepe: '#3CC68A',
        xrp: '#23292F',
        usdt: '#26A17B',
        bnb: '#F3BA2F',
        doge: '#C2A633',
        shib: '#FF6B35',
        avax: '#E84142',
        matic: '#8247E5',
        ftm: '#1969FF',
        op: '#FF0420'
    }
    const color = colors[normalizedTicker] || '#1976D2'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${color}"/><text x="32" y="37" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#FFFFFF">${label}</text></svg>`

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const getCoinLogo = (symbol) => {
    const ticker = getCoinTicker(symbol)

    return {
        btc: `${baseApi}/bitcoin-btc-logo.png`,
        eth: `${baseApi}/ethereum-eth-logo.png`,
        sol: `${baseApi}/solana-sol-logo.png`,
        pepe: `${baseApi}/pepe-pepe-logo.png`,
        xrp: `${baseApi}/xrp-xrp-logo.png`,
        usdt: `${baseApi}/tether-usdt-logo.png`,
        bnb: `${baseApi}/bnb-bnb-logo.png`,
        doge: `${baseApi}/dogecoin-doge-logo.png`,
        shib: `${baseApi}/shiba-inu-shib-logo.png`,
        avax: `${baseApi}/avalanche-avax-logo.png`,
        matic: `${baseApi}/polygon-matic-logo.png`,
        ftm: `${baseApi}/fantom-ftm-logo.png`,
        op: `${baseApi}/optimism-ethereum-op-logo.png`
    }[ticker] || getCoinFallbackLogo(symbol, ticker)
}

// Logo de stocks desde LoadLogo (https://img.loadlogo.com/ticker/{SYMBOL}),
// gratis y sin API key. Ej: AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, NFLX, AMD, INTC.
//
// Simbolos de Yahoo con marcadores de exchange se normalizan al ticker limpio que
// LoadLogo si indexa, asi caen por la MISMA via que las acciones:
//   ^NDX    (indice)    -> NDX    -> logo real de Nasdaq
//   EURUSD=X (forex)    -> EURUSD -> logo real (bandas EU/US)
//   GC=F    (futuro)    -> GC     -> LoadLogo devuelve "Goldcliff Resources" (NO es
//                          oro), por eso se curva con un lingote vectorial abajo.
const GOLD_BAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="0.5" stop-color="#f5c542"/><stop offset="1" stop-color="#c8901a"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="#1a1405"/><polygon points="18,24 46,24 52,38 12,38" fill="url(#g)" stroke="#8a5e12" stroke-width="1.5" stroke-linejoin="round"/><polygon points="22,18 42,18 46,24 18,24" fill="#fff0a8" stroke="#8a5e12" stroke-width="1.5" stroke-linejoin="round"/><rect x="26" y="29" width="12" height="6" rx="1" fill="#fff3b0" opacity="0.7"/></svg>`
const GOLD_BAR_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(GOLD_BAR_SVG)}`

// Overrides curados (por symbol crudo, antes de limpiar) donde la base de
// tickers de LoadLogo devuelve la empresa equivocada.
const SPECIAL_LOGOS = {
    'GC=F': GOLD_BAR_LOGO,
    'GC': GOLD_BAR_LOGO,
}

const getStockLogo = (symbol) => {
    const raw = String(symbol || '').trim().toUpperCase()
    if (!raw) return getCoinFallbackLogo(symbol)

    // Override curado antes de limpiar (evita el ticker erroneo de LoadLogo).
    if (SPECIAL_LOGOS[raw]) return SPECIAL_LOGOS[raw]

    // Normaliza marcadores de exchange de Yahoo al ticker limpio que indexa LoadLogo.
    const ticker = raw
        .replace(/^\^/, '')           // ^NDX -> NDX
        .replace(/=[A-Z]{1,2}$/, '')  // EURUSD=X -> EURUSD, GC=F -> GC
        .replace(/^[.:-]+/, '')       // .BRK.B -> BRK.B
    if (!ticker) return getCoinFallbackLogo(symbol)

    return `https://img.loadlogo.com/ticker/${encodeURIComponent(ticker)}?size=128`
}

// Elige el logo segun el mercado: crypto -> cryptologos.cc, stock -> loadlogo
const getAssetLogo = (symbol, market = 'crypto') => {
    if (market === 'stock') return getStockLogo(symbol)
    return getCoinLogo(symbol)
}

export {
    getCoinLogo,
    getCoinFallbackLogo,
    getStockLogo,
    getAssetLogo,
    getCoinTicker,
    normalizeCoin
}
