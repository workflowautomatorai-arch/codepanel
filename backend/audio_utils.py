"""
Audio Utilities for CodePanel
Handles audio format conversion using ffmpeg
"""

import os
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

# Configurable timeout
FFMPEG_TIMEOUT = int(os.environ.get("FFMPEG_TIMEOUT", "30"))


def find_ffmpeg() -> Optional[str]:
    """Find ffmpeg executable path"""
    import shutil

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg

    # Check winget installation location
    winget_path = Path.home() / "AppData/Local/Microsoft/WinGet/Packages"
    for pkg_dir in winget_path.glob("Gyan.FFmpeg*"):
        for bin_dir in pkg_dir.glob("ffmpeg-*/bin"):
            ffmpeg_exe = bin_dir / "ffmpeg.exe"
            if ffmpeg_exe.exists():
                return str(ffmpeg_exe)

    return None


def convert_audio_to_wav(audio_data: bytes, source_format: str = "webm") -> bytes:
    """Convert audio from webm/opus to WAV format"""
    # Sanitize source_format
    if not re.match(r'^[a-z0-9]+$', source_format):
        raise ValueError(f"Invalid audio format: {source_format}")

    ffmpeg = find_ffmpeg()
    if not ffmpeg:
        raise Exception("ffmpeg not found. Please install ffmpeg and restart.")

    input_path = None
    output_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=f".{source_format}", delete=False) as input_file:
            input_file.write(audio_data)
            input_path = input_file.name

        # Use pathlib to safely change the file extension
        output_path = str(Path(input_path).with_suffix(".wav"))

        cmd = [
            ffmpeg, "-y", "-i", input_path,
            "-ar", "16000",
            "-ac", "1",
            "-f", "wav",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)

        if result.returncode != 0:
            raise Exception(f"ffmpeg conversion failed: {result.stderr}")

        with open(output_path, "rb") as f:
            wav_data = f.read()

        return wav_data

    except subprocess.TimeoutExpired:
        raise Exception("Audio conversion timed out")
    except Exception as e:
        raise Exception(f"Failed to convert audio: {e}")
    finally:
        # Always cleanup temp files
        if input_path and os.path.exists(input_path):
            try:
                os.unlink(input_path)
            except:
                pass
        if output_path and os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except:
                pass
