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
        avax: `${baseApi}/avalanche-avax-logo.png`,
        matic: `${baseApi}/polygon-matic-logo.png`,
        ftm: `${baseApi}/fantom-ftm-logo.png`,
        op: `${baseApi}/optimism-ethereum-op-logo.png`
    }[ticker] || getCoinFallbackLogo(symbol, ticker)
}

// Logo de stocks desde LoadLogo (https://img.loadlogo.com/ticker/{SYMBOL}),
// gratis y sin API key. Ej: AAPL, MSFT, NVDA, TSLA, AMZN, GOOGL, META, NFLX, AMD, INTC.
const getStockLogo = (symbol) => {
    const ticker = String(symbol || '').trim().toUpperCase().replace(/^[.:-]/, '')
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
