# Backend API

## Technical overview

The backend is a Flask application that exposes REST endpoints and a Socket.IO
interface for the trading dashboard. Binance and Coinbase provide cryptocurrency
market data, while Yahoo Finance provides stock data. A dedicated feeder consumes
market streams, builds indicator payloads, and publishes snapshots and updates
through Redis for the API and connected clients. PostgreSQL stores anonymous chat
sessions, messages, and user preferences. The backend also provides AI chat,
market news, and text-to-speech services.

Base URL: `http://localhost:5000`

The backend defines 16 REST endpoints:

1. **Trading data** — GET `http://localhost:5000/api/trading/<symbol>`

2. **Get crypto provider preference** — GET `http://localhost:5000/api/trading/provider-preference`

3. **Set crypto provider preference** — PATCH `http://localhost:5000/api/trading/provider-preference`

4. **Market feed health** — GET `http://localhost:5000/api/trading/feed-health`

5. **Chat** — POST `http://localhost:5000/api/chat`

6. **Available chat models** — GET `http://localhost:5000/api/models`

7. **Search health** — GET `http://localhost:5000/api/search/health`

8. **News** — GET `http://localhost:5000/api/news/<symbol>`

9. **Text-to-speech** — POST `http://localhost:5000/api/tts`

10. **Get chat state and sessions** — GET `http://localhost:5000/api/chat/state`

11. **Import legacy chat state** — POST `http://localhost:5000/api/chat/state/import`

12. **Update chat preferences** — PATCH `http://localhost:5000/api/chat/preferences`

13. **Create chat session** — POST `http://localhost:5000/api/chat/sessions`

14. **Add message to session** — POST `http://localhost:5000/api/chat/sessions/<session_id>/messages`

15. **Update session welcome message** — PATCH `http://localhost:5000/api/chat/sessions/<session_id>/welcome`

16. **Delete chat session** — DELETE `http://localhost:5000/api/chat/sessions/<session_id>`

## Real-time interface

Socket.IO uses `http://localhost:5000/socket.io/` for the connection and is
separate from the 16 REST endpoints. Client events: `join`, `leave`, and
`request_refresh`. The server emits `trading_data_update`.
