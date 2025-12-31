"""
Live Session Manager for Gemini Live API
Handles persistent WebSocket connection with proactive audio
"""

import asyncio
from typing import AsyncIterator, Optional
from dataclasses import dataclass

from google.genai import types


@dataclass
class LiveConfig:
    """Configuration for Live API session"""
    model: str = "gemini-2.5-flash-native-audio-preview"
    sample_rate: int = 16000


class LiveSessionManager:
    """Manages persistent connection to Gemini Live API"""

    def __init__(self, client):
        """
        Initialize the session manager.

        Args:
            client: Gemini client instance (from google.genai)
        """
        self.client = client
        self.session = None
        self.is_active = False
        self.resume_handle: Optional[str] = None
        self.config = LiveConfig()

    async def start_session(self, system_prompt: str) -> None:
        """
        Start a new Live API session with proactive audio.

        Args:
            system_prompt: Instructions for the AI on when/how to respond
        """
        config = types.LiveConnectConfig(
            response_modalities=["TEXT"],
            proactivity=types.ProactivityConfig(proactive_audio=True),
            context_window_compression=types.ContextWindowCompressionConfig(
                sliding_window=types.SlidingWindow(),
            ),
            system_instruction=system_prompt,
        )

        # Add session resumption if we have a previous handle
        if self.resume_handle:
            config.session_resumption = types.SessionResumptionConfig(
                handle=self.resume_handle
            )

        self.session = await self.client.aio.live.connect(
            model=self.config.model,
            config=config
        )
        self.is_active = True
        print(f"[LiveSession] Started session with model {self.config.model}")

    async def send_audio(self, pcm_data: bytes) -> None:
        """
        Forward audio chunk to Live API.

        Args:
            pcm_data: Raw PCM audio bytes (16-bit, 16kHz, mono)
        """
        if not self.session or not self.is_active:
            return

        await self.session.send_realtime_input(
            audio=types.Blob(
                data=pcm_data,
                mime_type=f"audio/pcm;rate={self.config.sample_rate}"
            )
        )

    async def send_text(self, text: str) -> None:
        """
        Send text message to Live API session (for follow-up questions).

        Args:
            text: User's text message
        """
        if not self.session or not self.is_active:
            return

        await self.session.send_client_content(
            turns=types.Content(
                role="user",
                parts=[types.Part(text=text)]
            ),
            turn_complete=True
        )
        print(f"[LiveSession] Sent text: {text[:50]}...")

    async def receive_responses(self) -> AsyncIterator[str]:
        """
        Yield text responses as they arrive from Live API.

        Handles:
        - Session resumption token updates
        - Text content extraction from model turns
        """
        if not self.session:
            return

        try:
            async for response in self.session.receive():
                # Handle session resumption updates
                if hasattr(response, 'session_resumption_update') and response.session_resumption_update:
                    update = response.session_resumption_update
                    if hasattr(update, 'new_handle') and update.new_handle:
                        self.resume_handle = update.new_handle
                        print(f"[LiveSession] Updated resume handle")

                # Extract text content from model responses
                if hasattr(response, 'server_content') and response.server_content:
                    server_content = response.server_content
                    if hasattr(server_content, 'model_turn') and server_content.model_turn:
                        model_turn = server_content.model_turn
                        if hasattr(model_turn, 'parts') and model_turn.parts:
                            for part in model_turn.parts:
                                if hasattr(part, 'text') and part.text:
                                    yield part.text
        except Exception as e:
            print(f"[LiveSession] Error receiving: {e}")
            self.is_active = False

    async def stop_session(self) -> None:
        """Gracefully close the session."""
        print("[LiveSession] Stopping session...")
        self.is_active = False

        if self.session:
            try:
                self.session.close()
            except Exception as e:
                print(f"[LiveSession] Error closing session: {e}")
            finally:
                self.session = None

        print("[LiveSession] Session stopped")
