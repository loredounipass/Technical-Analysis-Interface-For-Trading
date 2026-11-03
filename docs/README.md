# Project structure and local setup

## Project structure

```text
frontend/       Next.js application, UI, and public assets
backend/        Flask API, market data services, and chat/TTS logic
backend/database/
                Local PostgreSQL environment files
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
cp backend/database/.env.example backend/database/.env
```

Set `POSTGRES_PASSWORD` in `backend/database/.env`. Add provider keys to
`backend/.env` for optional NVIDIA chat/TTS, CryptoCompare news, and SerpApi
search. `NVIDIA_TTS_FUNCTION_ID` is required when using TTS.

Build and start all services:

```bash
docker compose up --build -d
```

The services are available at:

- Frontend: <http://localhost:3000>
- Backend API: <http://localhost:5000/api>
- PostgreSQL: `localhost:5432`

Inside the Compose network, other containers can reach PostgreSQL at
`postgres:5432`. The database data is stored in the `postgres_data` Docker
volume and persists when containers are recreated. The backend is not currently
configured to use PostgreSQL.

Useful commands:

```bash
docker compose ps
docker compose logs -f frontend backend postgres
docker compose down
```

`docker compose down` preserves the PostgreSQL data volume.

## Run frontend and backend without Docker

Install dependencies once:

```bash
cd frontend
pnpm install

cd ../backend
pip install -r requirements.txt
```

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
