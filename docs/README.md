# Project structure and local setup

## Project structure

```text
frontend/       Next.js application, UI, and public assets
backend/        Flask API, market data services, and chat/TTS logic
backend/database/
                PostgreSQL schema and chat persistence
docker-compose.yml
                Local frontend, backend, and PostgreSQL services
```

The frontend, backend, and PostgreSQL configuration are kept separate. Local
`.env` files contain machine-specific values and are ignored by Git; commit only
the corresponding `.env.example` files.

## Start all services with Docker

From the repository root, create the local environment files:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Set the PostgreSQL credentials in `backend/.env`. Add provider keys there for
optional NVIDIA chat/TTS, CryptoCompare news, and SerpApi search.
`NVIDIA_TTS_FUNCTION_ID` is required when using TTS.

Build and start all services:

```bash
docker-compose up --build -d
```

The services are available at:

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:5000/api>
- PostgreSQL: `localhost:5432`

Inside the Compose network, other containers can reach PostgreSQL at
`postgres:5432`. The database data is stored in the `postgres_data` Docker
volume and persists when containers are recreated. PostgreSQL stores anonymous
chat sessions, messages, the selected model, and web-search preference. Browser
histories are isolated by a random browser ID; this is not authentication, and
a user can replace that ID.
The `search_chat_history` MCP-style tool reads messages directly from
PostgreSQL, searches all messages without a result cap, supports filters for a
specific session ID/name or symbol, and returns matching message IDs and full
content. It limits its search to the browser owner making the chat request. The
model can also rename the current session based on its conversation context.

Useful commands:

```bash
docker-compose ps
docker-compose logs -f frontend backend postgres
docker-compose down
```

`docker-compose down` preserves the PostgreSQL data volume.

## Run frontend and backend without Docker

Install dependencies once:

```bash
cd frontend
pnpm install

cd ../backend
pip install -r requirements.txt
```

When running the backend directly, set `POSTGRES_HOST=localhost` in
`backend/.env`; Docker Compose overrides it with the service name `postgres`.
The backend creates the chat tables automatically on startup.

Start the backend from the repository root in one terminal:

```bash
cd backend
python app.py
```

Start the frontend from the repository root in another terminal:

```bash
cd frontend
pnpm run dev
```

The frontend uses `frontend/.env` for its API and Socket.IO URLs. The backend
loads `backend/.env` when it starts.

## Market data providers

The trading dashboard lets you choose Binance or Coinbase for crypto. The
selected provider supplies the candles, live price, 24-hour volume, order book,
order flow, indicators, and real-time socket room. The backend keeps provider
caches and socket rooms separate so switching exchanges does not mix values.
The selected crypto provider is stored in the `market_data_preferences`
PostgreSQL table per anonymous browser ID, so it remains selected after a
reload.
Stocks, indices, and other non-crypto instruments continue to use Yahoo Finance;
the crypto selector is hidden for those markets.

The trading endpoint accepts `provider=binance` or `provider=coinbase` for
crypto, for example `/api/trading/BTCUSDT?interval=15m&market=crypto&provider=binance`.
If omitted, crypto continues to default to Coinbase. Stock requests always use
Yahoo Finance regardless of the provider parameter.
