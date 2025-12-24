"""
Speech-to-Text API endpoint using OpenAI Whisper.
Fast, reliable transcription.
"""
import os
import logging
import asyncio
import json
import tempfile
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech", tags=["Speech"])


class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    duration: Optional[float] = None


def get_openai_client():
    """Get OpenAI client with API key."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not configured")
    return AsyncOpenAI(api_key=api_key)


@router.websocket("/stream")
async def websocket_stream_transcription(websocket: WebSocket):
    """
    WebSocket endpoint for speech-to-text using OpenAI Whisper.

    Collects audio chunks, then transcribes when recording ends.
    Not true streaming, but fast and reliable.

    Protocol:
    1. Client connects
    2. Server sends: {"type": "ready"}
    3. Client sends audio chunks as binary (PCM 16-bit, 16kHz, mono)
    4. Client sends: {"type": "end"} to signal end of audio
    5. Server transcribes and sends: {"type": "final", "text": "..."}
    """
    await websocket.accept()
    logger.info("Speech WebSocket connected")

    audio_chunks = []

    try:
        client = get_openai_client()

        # Send ready signal
        await websocket.send_json({"type": "ready"})
        logger.info("Ready for audio")

        # Collect audio chunks
        while True:
            try:
                message = await websocket.receive()

                if message["type"] == "websocket.disconnect":
                    break

                # Handle binary audio data
                if "bytes" in message:
                    audio_chunks.append(message["bytes"])

                # Handle JSON control messages
                elif "text" in message:
                    data = json.loads(message["text"])

                    if data.get("type") == "end":
                        logger.info(f"Recording ended, received {len(audio_chunks)} chunks")
                        break

            except WebSocketDisconnect:
                logger.info("Client disconnected")
                break
            except Exception as e:
                logger.error(f"Error receiving message: {e}")
                break

        # Transcribe if we have audio
        if audio_chunks:
            # Combine all PCM chunks
            pcm_data = b''.join(audio_chunks)
            logger.info(f"Total audio: {len(pcm_data)} bytes")

            # Convert PCM to WAV format for Whisper
            import wave
            import io

            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(1)  # Mono
                wav_file.setsampwidth(2)  # 16-bit
                wav_file.setframerate(16000)  # 16kHz
                wav_file.writeframes(pcm_data)

            wav_buffer.seek(0)
            wav_data = wav_buffer.read()

            # Write to temp file for OpenAI
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                tmp.write(wav_data)
                tmp_path = tmp.name

            try:
                # Transcribe with Whisper
                with open(tmp_path, 'rb') as audio_file:
                    transcript = await client.audio.transcriptions.create(
                        model="whisper-1",
                        file=audio_file,
                        response_format="text"
                    )

                text = transcript.strip() if transcript else ""
                logger.info(f"Transcribed: {text[:100] if text else 'empty'}")

                if text:
                    await websocket.send_json({
                        "type": "final",
                        "text": text
                    })
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "No speech detected"
                    })

            finally:
                # Clean up temp file
                os.unlink(tmp_path)
        else:
            await websocket.send_json({
                "type": "error",
                "message": "No audio received"
            })

    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "message": "Speech service not configured"
            })
        except:
            pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        try:
            await websocket.send_json({
                "type": "error",
                "message": f"Transcription error: {str(e)}"
            })
        except:
            pass
    finally:
        logger.info("Speech WebSocket closed")


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
):
    """
    Batch transcription endpoint using OpenAI Whisper.

    Supports: mp3, mp4, wav, webm, ogg, flac, m4a
    Max file size: 25MB
    """
    try:
        client = get_openai_client()
    except ValueError as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Read file content
    content = await audio.read()

    logger.info(f"Received audio: filename={audio.filename}, content_type={audio.content_type}, size={len(content)} bytes")

    # Check file size (25MB limit)
    max_size = 25 * 1024 * 1024
    if len(content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is 25MB, got {len(content) / (1024*1024):.1f}MB"
        )

    try:
        # Write to temp file
        suffix = '.webm'
        if audio.filename:
            suffix = '.' + audio.filename.split('.')[-1] if '.' in audio.filename else '.webm'

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        try:
            # Build kwargs
            kwargs = {
                "model": "whisper-1",
                "response_format": "text"
            }
            if language:
                kwargs["language"] = language
            if prompt:
                kwargs["prompt"] = prompt

            with open(tmp_path, 'rb') as audio_file:
                kwargs["file"] = audio_file
                transcript = await client.audio.transcriptions.create(**kwargs)

            text = transcript.strip() if transcript else ""
            logger.info(f"Transcribed: {len(text)} chars")

            return TranscriptionResponse(
                text=text,
                language=language,
                duration=None
            )
        finally:
            os.unlink(tmp_path)

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Whisper error: {error_msg}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error_msg}")
