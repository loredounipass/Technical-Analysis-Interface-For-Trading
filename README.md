# Trading Bot UI

## 📊 Description
This project is a professional-grade cryptocurrency trading interface that retrieves real-time market data directly from the TradingView API. It is designed to empower traders with advanced technical analysis tools and a modern, responsive user experience. The platform integrates a robust set of technical indicators, allowing users to analyze price trends, identify trading opportunities, and make informed decisions. Additionally, it now features an AI-powered technical analysis agent capable of generating market insights, detecting patterns, evaluating indicators, and assisting traders with smarter decision-making in real time. Built with Next.js for the frontend and Python for the backend, it seamlessly combines performance, flexibility, and a visually appealing dashboard for both novice and experienced traders.

## ✨ Features

- 🎯 Intuitive dashboard with real-time technical indicators
- 💹 Advanced price and trend visualization
- 🔄 Customizable cryptocurrency selector
- 📱 Responsive design for all devices
- 🌓 Integrated light/dark theme
- 📊 Interactive and dynamic charts
- 🤖 Python backend for technical analysis

## 🚀 Technologies

### Frontend
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Shadcn/UI](https://img.shields.io/badge/shadcn/ui-000000?style=for-the-badge&logo=shadcnui&logoColor=white)

### Backend
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white)

## 🛠️ Installation

1. Clone the repository:
```bash
git clone https://github.com/Erick-MC-Cedeno/Technical-Analysis-Interface-For-Trading
```

```
cd Technical-Analysis-Interface-For-Trading
```

2. Install frontend dependencies:
```bash
pnpm install
# or
pnpm install --force
```

3. Install backend dependencies:
```bash
cd backend
pip install -r requirements.txt
```

## 🚀 Usage

1. Start the backend server:
```bash
python app.py
```

2. In another terminal, start the frontend:
```bash
pnpm run dev
# or
ppnpm dev
```


3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🐳 Docker (local)

Requisito: Docker Desktop instalado y corriendo.

```bash
# 1. Copia y ajusta las variables (opcional, hay defaults)
cp .env.example .env

# 2. Levanta frontend + backend
docker compose up --build

# 3. Abre http://localhost:3000
```

Para correr solo un servicio:

```bash
docker compose up --build backend   # API en http://localhost:5000
docker compose up --build frontend  # UI en http://localhost:3000
```

## ☁️ Deploy en Render (https://dashboard.render.com/web/new)

La app tiene 2 servicios (frontend y backend), cada uno con su propio `Dockerfile`. Render los detecta automáticamente (Entorno: **Docker**).

### 1. Backend (crear primero)

1. Conecta tu repo de GitHub en Render → **New → Web Service**.
2. **Root Directory**: `backend` → Render detecta `backend/Dockerfile` y usa **Docker**.
3. **Name**: `trading-backend`
4. En **Environment** agrega:
   - `ALLOWED_ORIGINS`: la URL de tu frontend, ej. `https://trading-frontend.onrender.com`
   - `NVIDIA_API_KEY` (opcional, para el chat IA)
   - `CRYPTOCOMPARE_API_KEY` (opcional, para noticias)
5. **Create Web Service**. Espera el deploy y copia la URL asignada, ej. `https://trading-backend.onrender.com`.

### 2. Frontend (crear después)

1. **New → Web Service**, mismo repo.
2. **Root Directory**: `/` → Render detecta el `Dockerfile` de la raíz y usa **Docker**.
3. **Name**: `trading-frontend`
4. En **Environment** agrega (estas se inyectan durante el build del Dockerfile):
   - `NEXT_PUBLIC_API_BASE_URL`: `https://trading-backend.onrender.com/api`
   - `NEXT_PUBLIC_SOCKET_URL`: `https://trading-backend.onrender.com`
5. **Create Web Service**.

> 💡 Las variables `NEXT_PUBLIC_*` se inyectan en el build del frontend. Si cambias la URL del backend, ve al servicio en Render → **Environment** → guarda y usa **Deploy → Clear build cache & Deploy**.

> ⚠️ En el plan **Free**, Render pone los servicios a dormir tras ~15 min sin tráfico; el primer acceso puede tardar ~50s en responder.

### Alternativa: Blueprint (1 click)

En Render → **New → Blueprint**, conecta el repo. Se crean ambos servicios con `render.yaml`. Luego edita las env vars marcadas con `sync: false` con las URLs reales de cada servicio.

## 📷 Capturas de pantalla

A continuación se muestran imágenes de la interfaz:

### Card
![Card](photos/card.png)

### Dashboard 1
![Dashboard 1](photos/dashboard1.png)

### Dashboard 2
![Dashboard 2](photos/dashboard2.png)

### Dashboard 3
![Dashboard 3](photos/dashboard3.png)

### Loader
![Loader](photos/loader.png)

## 💡 Project Structure

```
├── app/                  # Next.js configuration and main pages
├── components/          # Reusable React components
│   ├── indicators/     # Technical indicator components
│   └── ui/            # UI components
├── backend/            # Python server and analysis logic
├── utils/             # Utilities and helpers
└── public/            # Static files
```

## 📄 License

MIT

## 👥 Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.



