"""
CodePanel Self-Hosted Backend Server
Uses Gemini Interactions API for simplified state management
"""

import os
import base64
import re
import threading
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from prompts import (
    classify_query,
    build_prompt,
    build_voice_prompt,
    load_user_context,
    read_context_file,
    get_available_context_files,
    QueryType,
    CONTEXT_DIR,
)

load_dotenv()

# Configurable timeouts
FFMPEG_TIMEOUT = int(os.environ.get("FFMPEG_TIMEOUT", "30"))
GEMINI_TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT", "90"))

app = FastAPI(title="CodePanel Self-Hosted API")

ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["POST", "GET", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# =============================================================================
# GEMINI CLIENT (Interactions API)
# =============================================================================

GEMINI_MODEL = "gemini-3-flash-preview"

# Gemini API configuration
STORE_INTERACTIONS = os.environ.get("STORE_INTERACTIONS", "true").lower() == "true"
SYSTEM_INSTRUCTION = os.environ.get("GEMINI_SYSTEM_INSTRUCTION",
    "You are an expert coding interview assistant. Provide clear, accurate, and well-structured solutions. "
    "Focus on optimal time and space complexity. Explain your reasoning.")

_client = None
_client_lock = threading.Lock()

def get_client():
    """Get or create the Gemini client (thread-safe)"""
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                from google import genai
                api_key = os.environ.get("GOOGLE_API_KEY")
                if not api_key:
                    raise ValueError("GOOGLE_API_KEY environment variable is required but not set")
                _client = genai.Client(api_key=api_key)
    return _client


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class BaseRequest(BaseModel):
    images: List[str] = []
    audio: Optional[str] = None
    text: Optional[str] = None
    isMock: Optional[bool] = False

class SolveRequest(BaseRequest):
    pass

class DebugRequest(BaseRequest):
    pass

class SolveResponse(BaseModel):
    thoughts: List[str]
    code: str
    time_complexity: str
    space_complexity: str
    problem_statement: str

class DebugResponse(BaseModel):
    thoughts: List[str]
    code: str
    time_complexity: str
    space_complexity: str

class LeetCodeSolveRequest(BaseRequest):
    pass

class LeetCodeDebugRequest(BaseRequest):
    conversationId: str

class LeetCodeSolveResponse(BaseModel):
    code: str
    conversationId: str

class LeetCodeDebugResponse(BaseModel):
    code: str

class VoiceRequest(BaseModel):
    audio: Optional[str] = None
    images: List[str] = []
    text: Optional[str] = None
    conversation_id: Optional[str] = None

class VoiceResponse(BaseModel):
    response: str
    code: Optional[str] = None
    conversation_id: str


# =============================================================================
# TOOL DEFINITION (Interactions API format)
# =============================================================================

def get_context_tool():
    """Get tool definition for context file reading in Interactions API format"""
    files = get_available_context_files()
    if not files:
        return None

    files_list = ", ".join([f['filename'] for f in files])

    return {
        "type": "function",
        "name": "read_context_file",
        "description": f"Read personal background info. ONLY use for behavioral interview questions (e.g., 'tell me about yourself', 'describe a time when...'). Available files: {files_list}. NEVER use for coding or technical questions.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "The name of the file to read"
                }
            },
            "required": ["filename"]
        }
    }


# =============================================================================
# AUDIO CONVERSION
# =============================================================================

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
    import subprocess
    import tempfile
    import re

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

        output_path = input_path.replace(f".{source_format}", ".wav")

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


# =============================================================================
# CONTENT BUILDING (Interactions API format)
# =============================================================================

def build_interaction_input(
    images: List[str],
    audio: Optional[str],
    text: str
) -> list:
    """Build input array for Interactions API"""
    content = []

    # Add images
    for img in images:
        if img.startswith("data:"):
            header, data = img.split(",", 1)
            mime_type = header.split(";")[0].split(":")[1]
        else:
            mime_type = "image/png"
            data = img

        content.append({
            "type": "image",
            "data": data,
            "mime_type": mime_type
        })

    # Add audio (convert to WAV if needed)
    if audio:
        if audio.startswith("data:"):
            header, data = audio.split(",", 1)
            source_mime = header.split(";")[0].split(":")[1]
        else:
            source_mime = "audio/webm"
            data = audio

        audio_bytes = base64.b64decode(data)

        if "webm" in source_mime or "opus" in source_mime:
            print(f"[Audio] Converting {source_mime} to WAV...")
            audio_bytes = convert_audio_to_wav(audio_bytes, "webm")
            mime_type = "audio/wav"
        else:
            mime_type = source_mime

        content.append({
            "type": "audio",
            "data": base64.b64encode(audio_bytes).decode('utf-8'),
            "mime_type": mime_type
        })

    # Add text prompt
    content.append({"type": "text", "text": text})

    return content


def parse_solution_response(text: str) -> dict:
    """Parse AI response into structured format"""
    # Find all code blocks and take the last one (usually the final solution)
    code_matches = re.findall(r"```(?:\w+)?\n(.*?)```", text, re.DOTALL)
    code = code_matches[-1].strip() if code_matches else ""

    time_match = re.search(r"[Tt]ime [Cc]omplexity[:\s]*O\([^)]+\)", text)
    space_match = re.search(r"[Ss]pace [Cc]omplexity[:\s]*O\([^)]+\)", text)

    time_complexity = time_match.group(0).split(":")[-1].strip() if time_match else "O(n)"
    space_complexity = space_match.group(0).split(":")[-1].strip() if space_match else "O(1)"

    problem_match = re.search(r"[Pp]roblem[:\s]*(.*?)(?:\n\n|$)", text)
    problem_statement = problem_match.group(1).strip() if problem_match else "Problem extracted from input"

    thoughts_text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    thoughts = [t.strip() for t in thoughts_text.split("\n\n") if t.strip() and len(t.strip()) > 20][:5]

    if not thoughts:
        thoughts = ["Analyzed the problem", "Generated solution"]

    return {
        "code": code,
        "time_complexity": time_complexity,
        "space_complexity": space_complexity,
        "problem_statement": problem_statement,
        "thoughts": thoughts
    }


# =============================================================================
# CORE INTERACTION FUNCTION
# =============================================================================

async def generate_response(
    images: List[str],
    prompt: str,
    audio: Optional[str] = None,
    previous_interaction_id: Optional[str] = None,
    use_tools: bool = True
) -> tuple[str, str]:
    """
    Generate response using Gemini Interactions API.
    Returns (response_text, interaction_id)
    """
    import asyncio

    client = get_client()
    content = build_interaction_input(images, audio, prompt)

    has_audio = audio is not None
    print(f"[Gemini] Request to {GEMINI_MODEL} with {len(images)} images" +
          (", with audio" if has_audio else "") +
          (f", continuing from {previous_interaction_id}" if previous_interaction_id else ""))

    try:
        loop = asyncio.get_running_loop()

        # Build request params
        params = {
            "model": GEMINI_MODEL,
            "input": content,
            "system_instruction": SYSTEM_INSTRUCTION,
            "store": STORE_INTERACTIONS,
        }

        if previous_interaction_id:
            params["previous_interaction_id"] = previous_interaction_id

        # Add tools if enabled and available
        if use_tools:
            tool = get_context_tool()
            if tool:
                params["tools"] = [tool]

        # Create interaction
        interaction = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: client.interactions.create(**params)
            ),
            timeout=GEMINI_TIMEOUT
        )

        # Check for function calls
        for output in interaction.outputs:
            if output.type == "function_call":
                print(f"[Gemini] Function call: {output.name}")

                if output.name == "read_context_file":
                    filename = output.arguments.get("filename", "")
                    print(f"[Gemini] Reading context file: {filename}")
                    file_content = read_context_file(filename)

                    # Send function result back with formatting guidance
                    followup = await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            lambda: client.interactions.create(
                                model=GEMINI_MODEL,
                                previous_interaction_id=interaction.id,
                                input=[{
                                    "type": "function_result",
                                    "name": output.name,
                                    "call_id": output.id,
                                    "result": file_content
                                }]
                            )
                        ),
                        timeout=GEMINI_TIMEOUT
                    )
                    print(f"[Gemini] Response received after context fetch")
                    return followup.outputs[-1].text, followup.id

        print(f"[Gemini] Response received")
        return interaction.outputs[-1].text, interaction.id

    except asyncio.TimeoutError:
        raise Exception(f"Request timed out after {GEMINI_TIMEOUT} seconds")
    except Exception as e:
        print(f"[Gemini] Error: {e}")
        raise


# =============================================================================
# CONVERSATION MANAGEMENT
# =============================================================================

@app.delete("/conversation/{conversation_id}")
async def clear_conversation(conversation_id: str):
    """Clear a conversation (interactions are managed server-side, this is for client cleanup)"""
    return {"success": True, "message": f"Conversation {conversation_id} cleared"}

@app.delete("/conversations")
async def clear_all_conversations():
    """Clear all conversations notification"""
    return {"success": True, "message": "All conversations cleared"}


# =============================================================================
# VOICE ENDPOINT
# =============================================================================

@app.post("/voice", response_model=VoiceResponse)
async def voice_query(request: VoiceRequest):
    """Process voice query with optional images using Gemini's native audio"""
    try:
        has_images = len(request.images) > 0
        has_audio = request.audio is not None

        # Classify query type
        query_type = classify_query(request.text, has_images, has_audio)
        print(f"[Voice] Query classified as: {query_type.value}")

        # Build prompt
        if has_audio and not request.text:
            prompt = build_voice_prompt(has_images=has_images)
        else:
            prompt = build_prompt(
                query_type=query_type,
                user_text=request.text,
                has_images=has_images,
                has_audio=has_audio,
            )

        response_text, interaction_id = await generate_response(
            images=request.images,
            audio=request.audio,
            prompt=prompt,
            previous_interaction_id=request.conversation_id,
            use_tools=True
        )

        result = parse_solution_response(response_text)

        return VoiceResponse(
            response=response_text,
            code=result["code"] if result["code"] else None,
            conversation_id=interaction_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# LIVE INTERVIEW MODE ENDPOINTS
# =============================================================================

@app.post("/solutions/solve", response_model=SolveResponse)
async def solve_problem(request: SolveRequest):
    """Live Interview mode - Generate detailed solution with analysis"""
    try:
        if request.isMock:
            return SolveResponse(
                thoughts=["This is a mock response for testing"],
                code="def mock_solution():\n    return 'Mock solution'",
                time_complexity="O(1)",
                space_complexity="O(1)",
                problem_statement="Mock problem statement"
            )

        prompt = request.text or """Analyze this coding problem and provide a complete solution.

Please provide:
1. A brief problem statement (what the problem is asking)
2. Your thought process and approach
3. The complete code solution in Python
4. Time complexity analysis
5. Space complexity analysis

Format your response with clear sections and put the code in a ```python code block."""

        response_text, _ = await generate_response(
            images=request.images,
            prompt=prompt,
            audio=request.audio,
            use_tools=True
        )

        result = parse_solution_response(response_text)

        return SolveResponse(
            thoughts=result["thoughts"],
            code=result["code"],
            time_complexity=result["time_complexity"],
            space_complexity=result["space_complexity"],
            problem_statement=result["problem_statement"]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/solutions/debug", response_model=DebugResponse)
async def debug_solution(request: DebugRequest):
    """Live Interview mode - Debug solution with detailed analysis"""
    try:
        if request.isMock:
            return DebugResponse(
                thoughts=["This is a mock debug response"],
                code="def improved_mock_solution():\n    return 'Improved mock solution'",
                time_complexity="O(1)",
                space_complexity="O(1)"
            )

        prompt = request.text or """Analyze this code that needs debugging or improvement.

Please provide:
1. What issues you identified
2. Your debugging thought process
3. The corrected/improved code in Python
4. Updated time complexity analysis
5. Updated space complexity analysis

Format your response with clear sections and put the code in a ```python code block."""

        response_text, _ = await generate_response(
            images=request.images,
            prompt=prompt,
            audio=request.audio,
            use_tools=True
        )

        result = parse_solution_response(response_text)

        return DebugResponse(
            thoughts=result["thoughts"],
            code=result["code"],
            time_complexity=result["time_complexity"],
            space_complexity=result["space_complexity"]
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# LEETCODE SOLVER MODE ENDPOINTS
# =============================================================================

@app.post("/solutions/leetcode/solve", response_model=LeetCodeSolveResponse)
async def solve_leetcode_problem(request: LeetCodeSolveRequest):
    """LeetCode mode - Generate code solution (streamlined response)"""
    try:
        if request.isMock:
            return LeetCodeSolveResponse(
                code="def mock_leetcode_solution():\n    return 'Mock LeetCode solution'",
                conversationId="mock_conv_123"
            )

        prompt = request.text or """Analyze this LeetCode problem and provide a complete, working solution.

Respond with ONLY the code solution in a ```python code block. No explanations needed - just working code."""

        response_text, interaction_id = await generate_response(
            images=request.images,
            prompt=prompt,
            audio=request.audio,
            use_tools=True
        )

        result = parse_solution_response(response_text)

        return LeetCodeSolveResponse(
            code=result["code"],
            conversationId=interaction_id
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/solutions/leetcode/debug", response_model=LeetCodeDebugResponse)
async def debug_leetcode_solution(request: LeetCodeDebugRequest):
    """LeetCode mode - Debug code solution (uses conversation context)"""
    try:
        if request.isMock:
            return LeetCodeDebugResponse(
                code="def improved_mock_leetcode_solution():\n    return 'Improved mock LeetCode solution'"
            )

        prompt = request.text or """This shows a LeetCode solution that needs debugging or improvement.

Analyze the issue and provide a corrected solution. Respond with ONLY the fixed code in a ```python code block."""

        response_text, _ = await generate_response(
            images=request.images,
            prompt=prompt,
            audio=request.audio,
            previous_interaction_id=request.conversationId,
            use_tools=True
        )

        result = parse_solution_response(response_text)

        return LeetCodeDebugResponse(code=result["code"])

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.get("/health")
async def health_check():
    gemini_ok = bool(os.environ.get("GOOGLE_API_KEY"))

    return {
        "status": "OK",
        "mode": "self-hosted",
        "provider": "gemini",
        "api": "interactions",
        "model": GEMINI_MODEL,
        "gemini": "configured" if gemini_ok else "missing GOOGLE_API_KEY"
    }


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    print("\n" + "="*60)
    print("CodePanel Self-Hosted API Server")
    print("Using Gemini Interactions API")
    print("="*60)

    gemini_key = os.environ.get("GOOGLE_API_KEY")

    print(f"\nProvider Status:")
    print(f"  Gemini: {'[OK] Configured' if gemini_key else '[X] Missing GOOGLE_API_KEY'}")
    print(f"  Model: {GEMINI_MODEL}")

    # Check for context files
    context = load_user_context()
    context_files = list(CONTEXT_DIR.glob("*.txt")) + list(CONTEXT_DIR.glob("*.md"))
    print(f"\nContext Directory: {CONTEXT_DIR}")
    if context_files:
        print(f"  Context files loaded: {len(context_files)}")
        for f in context_files:
            print(f"    - {f.name}")
    else:
        print("  No context files found. Add .txt or .md files for personalization.")

    print(f"\nEndpoints:")
    print("  POST /solutions/solve          - Solve with images/audio")
    print("  POST /solutions/debug          - Debug with images/audio")
    print("  POST /solutions/leetcode/solve - LeetCode solve")
    print("  POST /solutions/leetcode/debug - LeetCode debug")
    print("  POST /voice                    - Voice query")
    print("  GET  /health                   - Health check")
    print("="*60 + "\n")

    uvicorn.run(app, host="0.0.0.0", port=3000)
