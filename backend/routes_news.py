"""Blueprint de rutas de noticias: /api/news/<symbol>

Crypto  → CryptoCompare API
Stocks  → Yahoo Finance search API
"""

import os
import time
import logging
import requests as req

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

news_bp = Blueprint('news', __name__)

NEWS_CATEGORIES = {
    "BTCUSDT": "BTC",
    "ETHUSDT": "ETH",
    "SOLUSDT": "SOL",
    "PEPEUSDT": "PEPE",
    "DOGEUSDT": "DOGE",
}

NEWS_CACHE = {}
NEWS_CACHE_TTL = 300

CRYPTOCOMPARE_API_KEY = os.getenv('CRYPTOCOMPARE_API_KEY')


@news_bp.route('/api/news/<symbol>')
def get_news(symbol):
    from cache import rate_limited
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    market = request.args.get('market', 'crypto')
    now = time.time()
    cached = NEWS_CACHE.get(symbol)
    if cached and now - cached['ts'] <= NEWS_CACHE_TTL:
        return jsonify(cached['articles'])

    # STOCKS: noticias de Yahoo Finance (gratis, sin API key, mismo host que los charts)
    if market == 'stock':
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
            }
            resp = req.get(
                'https://query1.finance.yahoo.com/v1/finance/search',
                params={'q': symbol, 'newsCount': 6},
                headers=headers,
                timeout=6
            )
            resp.raise_for_status()
            data = resp.json()
            articles = []
            for item in (data.get('news') or [])[:6]:
                thumb = None
                try:
                    thumb = item['thumbnail']['resolutions'][0]['url']
                except Exception:
                    pass
                articles.append({
                    'title': item.get('title', ''),
                    'url': item.get('link', ''),
                    'source': item.get('publisher', ''),
                    'published': item.get('providerPublishTime'),
                    'body': '',
                    'imageurl': thumb,
                    'categories': 'Stocks',
                })
            NEWS_CACHE[symbol] = {'articles': articles, 'ts': now}
            return jsonify(articles)
        except Exception as e:
            logger.warning(f"[News] Yahoo stock news fallo para {symbol}: {e}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

    category = NEWS_CATEGORIES.get(symbol, symbol.replace('USDT', ''))
    try:
        headers = {}
        if CRYPTOCOMPARE_API_KEY:
            headers['authorization'] = f'Apikey {CRYPTOCOMPARE_API_KEY}'
        resp = req.get(
            'https://min-api.cryptocompare.com/data/v2/news/',
            params={'lang': 'EN', 'categories': category, 'limit': 5},
            headers=headers,
            timeout=6
        )
        if resp.status_code == 429:
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])
        resp.raise_for_status()
        try:
            data = resp.json()
        except Exception:
            logger.warning(f"News API invalid JSON for {symbol}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

        if not isinstance(data, dict):
            logger.warning(f"News API unexpected response type for {symbol}: {type(data)}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

        if data.get('Response') == 'Error':
            logger.warning(f"News API error for {symbol}: {data.get('Message')}")
            if cached:
                return jsonify(cached['articles'])
            return jsonify([])

        articles = []
        raw_articles = data.get('Data')
        if isinstance(raw_articles, list):
            for item in raw_articles[:5]:
                body = item.get('body', '') or ''
                articles.append({
                    'title': item.get('title'),
                    'source': item.get('source'),
                    'url': item.get('url'),
                    'published': item.get('published_on'),
                    'body': body[:200],
                    'imageurl': item.get('imageurl'),
                })
        elif raw_articles is not None:
            logger.warning(f"Unexpected news Data format for {symbol}: {type(raw_articles)}")

        NEWS_CACHE[symbol] = {'articles': articles, 'ts': now}
        return jsonify(articles)
    except Exception as e:
        logger.warning(f"News fetch failed for {symbol}: {e}")
        if cached:
            return jsonify(cached['articles'])
        return jsonify([])
