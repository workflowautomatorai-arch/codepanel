"""
Live Session Manager for Gemini Live API
Handles persistent WebSocket connection with proactive audio
"""

import asyncio
import time
from typing import AsyncIterator, Optional
from dataclasses import dataclass

from google.genai import types


@dataclass
class LiveConfig:
    """Configuration for Live API session"""
    model: str = "gemini-2.5-flash-native-audio-preview-12-2025"
    sample_rate: int = 16000
    # Minimum response length before yielding (to prevent fragments)
    min_response_length: int = 50
    # Max time to wait for response aggregation (seconds)
    response_timeout: float = 2.0


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
        self._session_cm = None  # Store context manager for cleanup
        self.is_active = False
        self.resume_handle: Optional[str] = None
        self.config = LiveConfig()

    async def start_session(self, system_prompt: str) -> None:
        """
        Start a new Live API session with proactive audio.

        Args:
            system_prompt: Instructions for the AI on when/how to respond
        """
        # Use AUDIO modality with proactive_audio (required combination)
        # Get text via output_audio_transcription
        # Configure VAD to be less aggressive - require longer silence before responding
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            proactivity={"proactive_audio": True},
            output_audio_transcription={},
            context_window_compression=types.ContextWindowCompressionConfig(
                sliding_window=types.SlidingWindow(),
            ),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    # Lower sensitivity = less likely to trigger on short pauses
                    start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                    # Require 1 second of silence before considering speech ended
                    prefix_padding_ms=20,
                    silence_duration_ms=1000,
                )
            ),
            system_instruction=system_prompt,
        )

        # Add session resumption if we have a previous handle
        if self.resume_handle:
            config.session_resumption = types.SessionResumptionConfig(
                handle=self.resume_handle
            )

        # connect() returns an async context manager, manually enter it
        self._session_cm = self.client.aio.live.connect(
            model=self.config.model,
            config=config
        )
        self.session = await self._session_cm.__aenter__()
        self.is_active = True
        print(f"[LiveSession] Started session with model {self.config.model}", flush=True)

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
        Yield complete text responses from Live API.

        Buffers text until turn_complete, then yields the full response.
        Aggregates short responses to prevent fragmented output.

        Handles:
        - Session resumption token updates
        - Text extraction from output_transcription (for AUDIO modality)
        - Buffering until turn_complete for complete responses
        - Response aggregation to prevent short fragments
        """
        if not self.session:
            return

        text_buffer = []
        response_count = 0
        turn_count = 0
        # Aggregation buffer for responses across turns
        aggregation_buffer = []
        last_content_time = time.time()

        try:
            print(f"[LiveSession] Starting receive loop...", flush=True)

            # Keep receiving until session ends - receive() ends after each turn_complete
            while self.is_active:
                turn_count += 1
                print(f"[LiveSession] Waiting for turn #{turn_count}...", flush=True)

                async for response in self.session.receive():
                    response_count += 1

                    # Handle session resumption updates
                    if hasattr(response, 'session_resumption_update') and response.session_resumption_update:
                        update = response.session_resumption_update
                        if hasattr(update, 'new_handle') and update.new_handle:
                            self.resume_handle = update.new_handle

                    # Extract text from output_transcription (AUDIO mode with transcription)
                    if hasattr(response, 'server_content') and response.server_content:
                        server_content = response.server_content

                        # Buffer transcription text
                        if hasattr(server_content, 'output_transcription') and server_content.output_transcription:
                            transcript = server_content.output_transcription
                            if hasattr(transcript, 'text') and transcript.text:
                                text_buffer.append(transcript.text)
                                last_content_time = time.time()

                        # When turn is complete, process the buffered response
                        turn_complete = getattr(server_content, 'turn_complete', None)
                        if turn_complete:
                            if text_buffer:
                                turn_response = "".join(text_buffer)
                                text_buffer = []

                                # Add to aggregation buffer
                                aggregation_buffer.append(turn_response)
                                aggregated = " ".join(aggregation_buffer)

                                # Only yield if response is substantial enough
                                if len(aggregated) >= self.config.min_response_length:
                                    print(f"[LiveSession] Turn #{turn_count} complete, yielding aggregated ({len(aggregated)} chars): {aggregated[:80]}...", flush=True)
                                    aggregation_buffer = []
                                    yield aggregated
                                else:
                                    # Response too short, keep buffering
                                    time_since_content = time.time() - last_content_time
                                    if time_since_content > self.config.response_timeout:
                                        # Timeout reached, yield what we have
                                        print(f"[LiveSession] Timeout, yielding short response ({len(aggregated)} chars): {aggregated[:80]}...", flush=True)
                                        aggregation_buffer = []
                                        yield aggregated
                                    else:
                                        print(f"[LiveSession] Buffering short response ({len(aggregated)} chars), waiting for more...", flush=True)
                            # receive() iterator ends after turn_complete, loop back to call it again

                # Check if we should yield buffered content due to timeout
                if aggregation_buffer:
                    time_since_content = time.time() - last_content_time
                    if time_since_content > self.config.response_timeout:
                        aggregated = " ".join(aggregation_buffer)
                        print(f"[LiveSession] Timeout flush, yielding ({len(aggregated)} chars): {aggregated[:80]}...", flush=True)
                        aggregation_buffer = []
                        yield aggregated

                # Small delay before next receive() call
                await asyncio.sleep(0.01)

        except Exception as e:
            import traceback
            print(f"[LiveSession] Error receiving: {e}", flush=True)
            print(f"[LiveSession] Traceback: {traceback.format_exc()}", flush=True)
            self.is_active = False
        finally:
            # Yield any remaining buffered content
            if aggregation_buffer:
                aggregated = " ".join(aggregation_buffer)
                print(f"[LiveSession] Final flush ({len(aggregated)} chars): {aggregated[:80]}...", flush=True)
                # Note: Can't yield in finally, but this logs what was lost
            print(f"[LiveSession] receive_responses() exiting, {turn_count} turns, {response_count} responses", flush=True)

    async def stop_session(self) -> None:
        """Gracefully close the session."""
        print("[LiveSession] Stopping session...")
        self.is_active = False

        if self._session_cm:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception as e:
                print(f"[LiveSession] Error closing session: {e}")
            finally:
                self.session = None
                self._session_cm = None

        print("[LiveSession] Session stopped")
