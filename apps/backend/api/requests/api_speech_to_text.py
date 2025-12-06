"""
Speech-to-Text API endpoint using Groq Whisper
Fast, accurate, and cost-effective transcription for voice input functionality.
Groq is 3-18x cheaper than OpenAI ($0.02-0.11/hr vs $0.36/hr)
"""
import os
import logging
import tempfile
import subprocess
import shutil
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from pydantic import BaseModel
from groq import Groq

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/speech", tags=["Speech"])

# Check if ffmpeg is available
FFMPEG_PATH = shutil.which("ffmpeg")


def convert_to_mp3(input_path: str) -> str | None:
    """Convert audio to mp3 using ffmpeg. Returns output path or None if failed."""
    if not FFMPEG_PATH:
        logger.warning("ffmpeg not available for audio conversion")
        return None

    output_path = input_path.rsplit(".", 1)[0] + ".mp3"

    try:
        result = subprocess.run(
            [
                FFMPEG_PATH, "-y", "-i", input_path,
                "-vn",  # No video
                "-ar", "16000",  # 16kHz sample rate (good for speech)
                "-ac", "1",  # Mono
                "-b:a", "64k",  # 64kbps bitrate
                "-f", "mp3",
                output_path
            ],
            capture_output=True,
            timeout=30
        )

        if result.returncode == 0 and os.path.exists(output_path):
            logger.info(f"Converted audio to mp3: {os.path.getsize(output_path)} bytes")
            return output_path
        else:
            logger.warning(f"ffmpeg conversion failed: {result.stderr.decode()[:200]}")
            return None

    except Exception as e:
        logger.warning(f"ffmpeg conversion error: {e}")
        return None


class TranscriptionResponse(BaseModel):
    text: str
    language: Optional[str] = None
    duration: Optional[float] = None


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(
    audio: UploadFile = File(...),
    language: Optional[str] = Form(None),
    prompt: Optional[str] = Form(None),
):
    """
    Transcribe audio to text using Groq Whisper.

    Supports: mp3, mp4, mpeg, mpga, m4a, wav, webm, ogg, flac
    Max file size: 25MB

    Args:
        audio: Audio file to transcribe
        language: Optional language hint (ISO 639-1 code, e.g., 'en', 'es')
        prompt: Optional text to guide the transcription style

    Returns:
        TranscriptionResponse with transcribed text
    """
    # Get Groq API key
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured")

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

    # Determine file extension from filename or content type
    file_ext = os.path.splitext(audio.filename or "")[1].lower()
    if not file_ext:
        content_type = (audio.content_type or "").lower()
        if "ogg" in content_type:
            file_ext = ".ogg"  # Best for opus audio
        elif "mpeg" in content_type or "mp3" in content_type:
            file_ext = ".mp3"
        elif "mp4" in content_type or "m4a" in content_type:
            file_ext = ".m4a"
        elif "wav" in content_type:
            file_ext = ".wav"
        elif "webm" in content_type:
            file_ext = ".webm"
        elif "flac" in content_type:
            file_ext = ".flac"
        else:
            # Default to ogg for opus-encoded audio (most compatible with Groq)
            file_ext = ".ogg"

    logger.info(f"Using file extension: {file_ext}")

    # Create temp file with original audio
    with tempfile.NamedTemporaryFile(suffix=file_ext, delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    converted_path = None
    file_to_use = tmp_path

    try:
        # Convert webm/problematic formats to mp3 for Groq compatibility
        if file_ext in [".webm", ".ogg"]:
            converted_path = convert_to_mp3(tmp_path)
            if converted_path:
                file_to_use = converted_path
                logger.info("Using converted mp3 file")

        client = Groq(api_key=api_key)

        # Use whisper-large-v3-turbo for best speed/quality balance
        model = "whisper-large-v3-turbo"

        # Prepare transcription params
        transcription_params = {
            "model": model,
            "response_format": "verbose_json",
        }

        if language:
            transcription_params["language"] = language
        if prompt:
            transcription_params["prompt"] = prompt

        # Transcribe
        with open(file_to_use, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                file=audio_file,
                **transcription_params
            )

        text = transcription.text if hasattr(transcription, 'text') else str(transcription)
        detected_language = getattr(transcription, 'language', None)
        duration = getattr(transcription, 'duration', None)

        logger.info(f"Transcribed: {len(text)} chars, lang={detected_language}")

        return TranscriptionResponse(
            text=text,
            language=detected_language,
            duration=duration
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Groq transcription error: {error_msg}")

        if "could not process" in error_msg.lower() or "format" in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail="Audio format not supported. Please try recording again."
            )

        raise HTTPException(status_code=500, detail=f"Transcription failed: {error_msg}")

    finally:
        # Clean up temp files
        for path in [tmp_path, converted_path]:
            if path:
                try:
                    os.unlink(path)
                except:
                    pass
