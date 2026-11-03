"""
Entrypote WSGI para Vercel (capa de transporte serverless).

Vercel ejecuta esta función como AWS Lambda vía su runtime de Python/WSGI.
No se toca `app.py`: el módulo se importa tal cual (con sus blueprints y
rutas `/api/*`) y solo se expone el objeto `app` al handler de Vercel.

La inicialización de SocketIO y de los streams de mercado se omite cuando
`VERCEL=1` (ver `backend/app.py`), porque el entorno serverless no mantiene
conexiones WebSocket ni hilos de fondo entre invocaciones.
"""
import os
import sys

# El handler vive en backend/api/, pero los módulos internos (common,
# controllers, gateways, services) están en la raíz de backend/.
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from app import app  # noqa: E402  (Flask WSGI app detectado por Vercel)


def handler(event, context):
    """Permite invocación explícita; Vercel también puede usar `app` directo."""
    return app(event, context)
