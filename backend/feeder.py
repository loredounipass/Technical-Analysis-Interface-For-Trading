"""Feeder worker: el UNICO proceso que consulta los exchanges.

Reemplaza al modelo anterior (cada instancia de Flask con su cache en memoria y
su polling a REST) por un solo escritor:

    exchanges (Binance WS/REST, Coinbase WS/REST, Yahoo WS/REST)
        -> streams de este proceso
        -> build_payload (indicadores calculados una sola vez)
        -> Redis (tier caliente cada tick, historico solo al cerrar la vela)
        -> publica ta:updates

La API HTTP, los sockets y el agente de chat leen Redis y nunca tocan un
exchange, asi que N réplicas de la API producen 1 sola consulta al proveedor
en vez de N.

Uso:
    MARKET_BACKEND=redis REDIS_URL=redis://redis:6379/0 python feeder.py
"""

import os
import sys
import time
import logging
import queue
import threading

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - FEEDER - %(levelname)s - %(message)s',
)
logger = logging.getLogger('feeder')

# Los comandos que llegan de la API pueden bloquear (REST 1-2 s): se serializan
# en una cola para no abrir rafagas de peticiones contra el proveedor.
_COMMAND_QUEUE = queue.Queue(maxsize=256)
HEARTBEAT_SECONDS = int(os.getenv('FEEDER_HEARTBEAT_SECONDS', '60'))


class _NullSocket:
    """Los streams emiten por socket.io, pero en el feeder no hay clientes.

    La difusion real la hacen los procesos API al recibir ta:updates, asi que
    aqui el emit es un no-op deliberado.
    """

    def emit(self, *args, **kwargs):
        return None

    def sleep(self, seconds=0, *args, **kwargs):
        time.sleep(seconds)


def _handle_command(command):
    """Atiende 'refresh' (boton Refresh Data o arranque en frio de una sala)."""
    from common import market_store
    from services.payload_builder import fetch_trading_data

    action = command.get('action')
    if action != 'refresh':
        logger.debug(f"[Feeder] comando ignorado (no soportado): {action}")
        return

    symbol = (command.get('symbol') or '').upper()
    interval = command.get('interval') or '15m'
    market = command.get('market') or 'crypto'
    provider = 'yahoo' if market == 'stock' else (command.get('provider') or 'coinbase')
    if not symbol:
        return

    # Dedupe del arranque en frio: N clientes/replicas que entren a la misma sala
    # lanzan N comandos, pero la cola es de un solo consumidor. Si el primero ya
    # publico, los demas se descartan aqui en vez de volver a ir al exchange
    # (5 peticiones de seed por sala era exactamente el ruido que queriamos quitar).
    if (command.get('reason') or 'cold') != 'manual':
        age = market_store.snapshot_age(provider, symbol, interval)
        if age is not None:
            logger.debug(
                f"[Feeder] seed {provider}:{symbol} {interval} ya publicado hace "
                f"{age:.1f}s, se omite el comando duplicado"
            )
            return

    started = time.time()
    try:
        payload = fetch_trading_data(symbol, interval, market, provider)
    except Exception as e:
        logger.warning(f"[Feeder] refresh {provider}:{symbol} {interval} fallo: {e}")
        return
    if not isinstance(payload, dict) or payload.get('precio') is None:
        logger.warning(f"[Feeder] refresh {provider}:{symbol} {interval} sin precio")
        return
    # El refresh manual trae la vela completa: se publica tambien el historico.
    market_store.write_payload(provider, symbol, interval, payload, include_history=True)
    logger.info(
        f"[Feeder] refresh {provider}:{symbol} {interval} publicado en "
        f"{time.time() - started:.2f}s (precio={payload.get('precio')})"
    )


def _command_consumer():
    while True:
        try:
            command = _COMMAND_QUEUE.get(timeout=5)
        except queue.Empty:
            continue
        try:
            _handle_command(command)
        except Exception as e:
            logger.exception(f"[Feeder] error procesando comando: {e}")
        finally:
            _COMMAND_QUEUE.task_done()


def _enqueue_command(command):
    """Los callbacks de pub/sub no deben bloquear: encolar y seguir."""
    try:
        _COMMAND_QUEUE.put_nowait(command)
    except queue.Full:
        logger.warning("[Feeder] cola de comandos llena, se descarta un refresh")


def _heartbeat():
    from common import market_store
    while True:
        time.sleep(HEARTBEAT_SECONDS)
        try:
            # El registro de salas es un lease: si un nodo API murio sin soltar
            # sus salas, aqui se podan y el feeder deja de trabajar de mas.
            market_store.rooms_prune()
            health = market_store.feed_health()
            logger.info(
                f"[Feeder] heartbeat: snapshots_vivos={health.get('snapshots')} "
                f"salas_activas={health.get('rooms')} comandos_en_cola={_COMMAND_QUEUE.qsize()}"
            )
        except Exception as e:
            logger.warning(f"[Feeder] heartbeat fallo: {e}")


def main():
    from common import market_store
    from common.redis_client import market_backend, redis_url
    from gateways.stream_manager import init_market_streams

    if market_backend() != 'redis':
        logger.error(
            "MARKET_BACKEND debe ser 'redis' para correr el feeder "
            f"(actual: {market_backend()!r})."
        )
        return 2
    if not market_store.redis_active():
        logger.error(
            f"Redis no disponible en {redis_url()}. El feeder no puede correr "
            "sin su destino de escritura."
        )
        return 3

    os.environ['MARKET_ROLE'] = 'feeder'
    logger.info(f"[Feeder] conectado a {redis_url()} — unico cliente de los exchanges")

    threading.Thread(target=_command_consumer, daemon=True).start()
    threading.Thread(target=_heartbeat, daemon=True).start()
    market_store.subscribe_commands(_enqueue_command)

    init_market_streams(_NullSocket())
    logger.info("[Feeder] streams iniciados (Binance + Coinbase + Yahoo). Ctrl+C para salir.")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logger.info("[Feeder] detenido por el usuario.")
    return 0


if __name__ == '__main__':
    sys.exit(main())
