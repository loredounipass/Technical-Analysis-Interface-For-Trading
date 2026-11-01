"""Blueprint de rutas de TTS: /api/tts

Expone la síntesis de voz (NVIDIA Riva, ver services/tts_nvidia.py) al frontend.
Recibe JSON {text, voice?, lang?}, extrae SOLO la conclusión del informe y
devuelve el audio en WAV. Rate limiting por IP igual que el resto de rutas.
"""

import logging

from flask import Blueprint, jsonify, request, Response
from common.cache import rate_limited
from services.tts_nvidia import synthesize_speech, build_speech_text

logger = logging.getLogger(__name__)

tts_bp = Blueprint('tts', __name__)


@tts_bp.route('/api/tts', methods=['POST'])
def tts_endpoint():
    """Sintetiza la conclusión del texto recibido y la devuelve como audio/wav."""
    ip = request.remote_addr or 'unknown'
    if rate_limited(ip):
        return jsonify({'error': 'Too many requests'}), 429

    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'text is required'}), 400

    voice = data.get('voice') or None
    lang = data.get('lang') or None

    # La voz lee únicamente la conclusión (y sin símbolos de markdown).
    speech_text = build_speech_text(text)
    if not speech_text:
        return jsonify({'error': 'no speakable content'}), 400

    try:
        audio_bytes = synthesize_speech(speech_text, voice=voice, lang=lang)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except RuntimeError as e:
        # API key ausente, riva no instalado o fallo de gRPC: el frontend
        # detecta !resp.ok y aborta la reproducción sin romperse.
        logger.error(f"[TTS] síntesis no disponible: {e}")
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        logger.error(f"[TTS] error inesperado: {e}")
        return jsonify({'error': str(e)}), 500

    return Response(
        audio_bytes,
        mimetype='audio/wav',
        headers={'Cache-Control': 'no-store'},
    )
