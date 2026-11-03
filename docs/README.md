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
