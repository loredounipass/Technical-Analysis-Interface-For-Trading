const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://crispy-barnacle-qj97q4q9xj7c9pgv-5000.app.github.dev/api';

async function request(path, { method = 'GET', headers = {}, body = null, timeout = 15000, retries = 2 } = {}) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        method,
        headers: { Accept: 'application/json', ...headers },
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
      });
      clearTimeout(id);

      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        // non-json response
        data = text;
      }

      const isRateLimit = res.status === 429 || (data && data.error && data.error.toLowerCase().includes('rate limit'));

      if (!res.ok || (data && data.error)) {
        const errorMessage = data && data.error ? data.error : `HTTP ${res.status}`;
        const err = new Error(errorMessage);
        err.status = data && data.status ? data.status : (res.status !== 200 ? res.status : 400);
        err.body = data;

        // retry on 5xx or rate limit
        if ((err.status >= 500 || isRateLimit) && attempt < retries) {
          const delay = isRateLimit ? 2000 * (attempt + 1) : 2 ** attempt * 100;
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(id);
      const isAbort = err.name === 'AbortError';
      const shouldRetry = (isAbort || err.status >= 500 || !err.status) && attempt < retries;
      if (shouldRetry) {
        await new Promise(r => setTimeout(r, 2 ** attempt * 100));
        continue;
      }
      throw err;
    }
  }
}

export const fetchTradingData = async (symbol, interval = '15m') => {
  if (!symbol) throw new Error('symbol is required');
  return request(`/trading/${symbol}?interval=${interval}`, { retries: 4 });
};

