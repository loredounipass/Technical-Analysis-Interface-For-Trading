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
cd frontend
pnpm install
```

3. Install backend dependencies:
```bash
cd ../backend
pip install -r requirements.txt
```

## 🚀 Usage

1. Start the backend server:
```bash
cd backend
python app.py
```

2. In another terminal, start the frontend:
```bash
cd frontend
pnpm run dev
```


3. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🐳 Docker (local)

Requisito: Docker Desktop instalado y corriendo.

```bash
# 1. Copia los ejemplos de variables del frontend, backend y PostgreSQL
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
cp backend/database/.env.example backend/database/.env
# Cambia POSTGRES_PASSWORD por una contraseña segura en backend/database/.env

# 2. Levanta frontend, backend y PostgreSQL
docker compose up --build

# 3. Abre http://localhost:3000
```

Para correr solo un servicio:

```bash
docker compose up --build backend   # API en http://localhost:5000
docker compose up --build frontend  # UI en http://localhost:3000
```

## 📷 Capturas de pantalla

A continuación se muestran imágenes de la interfaz:

### Card
![Card](frontend/photos/card.png)

### Dashboard 1
![Dashboard 1](frontend/photos/dashboard1.png)

### Dashboard 2
![Dashboard 2](frontend/photos/dashboard2.png)

### Dashboard 3
![Dashboard 3](frontend/photos/dashboard3.png)

### Loader
![Loader](frontend/photos/loader.png)

## 💡 Project Structure

```
├── frontend/             # Next.js application and frontend assets
│   ├── app/
│   ├── components/
│   └── public/
├── backend/              # Python API and analysis logic
│   └── database/          # PostgreSQL local configuration
└── docker-compose.yml    # Local services
```

## 📄 License

MIT

## 👥 Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change.
