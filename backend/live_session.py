"""
Live Session Manager for Gemini Live API
Handles persistent WebSocket connection with proactive audio
"""

import asyncio
import time
from typing import AsyncIterator, Optional, Callable, Awaitable
from dataclasses import dataclass, field

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
    # Token threshold for context compression (default 100k)
    trigger_tokens: int = 100000
    # Enable affective dialog (adapts tone to user's expression)
    enable_affective_dialog: bool = True
    # Seconds before GoAway timeout to trigger reconnection callback
    goaway_reconnect_buffer: float = 5.0


@dataclass
class TokenUsage:
    """Token usage statistics"""
    total_tokens: int = 0
    audio_tokens: int = 0
    text_tokens: int = 0
    last_updated: float = field(default_factory=time.time)


@dataclass
class LiveMessage:
    """Message from Live API session"""
    type: str  # 'response' | 'interrupted' | 'generation_complete'
    content: str = ""
    timestamp: float = field(default_factory=time.time)


class LiveSessionManager:
    """Manages persistent connection to Gemini Live API"""

    def __init__(
        self,
        client,
        on_goaway: Optional[Callable[['LiveSessionManager', float], Awaitable[None]]] = None
    ):
        """
        Initialize the session manager.

        Args:
            client: Gemini client instance (from google.genai)
            on_goaway: Optional async callback when GoAway received.
                       Called with (manager, time_left_seconds) to allow reconnection.
        """
        self.client = client
        self.session = None
        self._session_cm = None
        self.is_active = False
        self.resume_handle: Optional[str] = None
        self.config = LiveConfig()
        self.token_usage = TokenUsage()
        self._on_goaway = on_goaway
        self._audio_streaming = False

    async def start_session(
        self,
        system_prompt: str,
        context_summary: Optional[str] = None
    ) -> None:
        """
        Start a new Live API session with proactive audio.

        Args:
            system_prompt: Instructions for the AI on when/how to respond
            context_summary: Optional summary of prior conversation context
                            (recommended for long sessions instead of full history)
        """
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            proactivity={"proactive_audio": True},
            output_audio_transcription={},
            enable_affective_dialog=self.config.enable_affective_dialog,
            context_window_compression=types.ContextWindowCompressionConfig(
                sliding_window=types.SlidingWindow(),
                trigger_tokens=self.config.trigger_tokens,
            ),
            realtime_input_config=types.RealtimeInputConfig(
                automatic_activity_detection=types.AutomaticActivityDetection(
                    start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                    end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                    prefix_padding_ms=300,
                    silence_duration_ms=1000,
                )
            ),
            system_instruction=system_prompt,
        )

        if self.resume_handle:
            config.session_resumption = types.SessionResumptionConfig(
                handle=self.resume_handle
            )

        self._session_cm = self.client.aio.live.connect(
            model=self.config.model,
            config=config
        )
        self.session = await self._session_cm.__aenter__()
        self.is_active = True
        self._audio_streaming = False
        self.token_usage = TokenUsage()
        print(f"[LiveSession] Started session with model {self.config.model}", flush=True)
        print(f"[LiveSession] Affective dialog: {self.config.enable_affective_dialog}, Trigger tokens: {self.config.trigger_tokens}", flush=True)

        if context_summary and not self.resume_handle:
            await self.send_context_summary(context_summary)

    async def send_context_summary(self, summary: str) -> None:
        """
        Send a context summary to establish session context efficiently.

        Per docs: "For longer contexts it's recommended to provide a single
        message summary to free up the context window for subsequent interactions."

        Args:
            summary: Condensed summary of prior conversation/context
        """
        if not self.session or not self.is_active:
            return

        await self.session.send_client_content(
            turns=[
                {"role": "user", "parts": [{"text": f"Context from our previous conversation: {summary}"}]},
                {"role": "model", "parts": [{"text": "I understand. I have the context from our previous conversation."}]},
            ],
            turn_complete=False
        )
        print(f"[LiveSession] Sent context summary ({len(summary)} chars)", flush=True)

    async def send_audio(self, pcm_data: bytes) -> None:
        """
        Forward audio chunk to Live API.

        Args:
            pcm_data: Raw PCM audio bytes (16-bit, 16kHz, mono)
        """
        if not self.session or not self.is_active:
            return

        self._audio_streaming = True
        await self.session.send_realtime_input(
            audio=types.Blob(
                data=pcm_data,
                mime_type=f"audio/pcm;rate={self.config.sample_rate}"
            )
        )

    async def send_audio_stream_end(self) -> None:
        """
        Signal end of audio stream to flush cached audio.

        Per docs: "When the audio stream is paused for more than a second
        (e.g., user switched off microphone), an audioStreamEnd event should
        be sent to flush any cached audio."

        Call this when:
        - Microphone is muted/paused
        - User stops speaking for extended period
        - Switching audio input sources
        """
        if not self.session or not self.is_active:
            return

        if self._audio_streaming:
            await self.session.send_realtime_input(audio_stream_end=True)
            self._audio_streaming = False
            print("[LiveSession] Sent audio stream end", flush=True)

    async def send_text(self, text: str) -> None:
        """
        Send text message to Live API session (for follow-up questions).

        Args:
            text: User's text message
        """
        if not self.session or not self.is_active:
            return

        await self.session.send_client_content(turns=text, turn_complete=True)
        print(f"[LiveSession] Sent text: {text[:50]}...", flush=True)

    async def receive_responses(self) -> AsyncIterator[LiveMessage]:
        """
        Yield messages from Live API as LiveMessage objects.

        Message types:
        - 'response': AI's text response (main chat content)
        - 'interrupted': User interrupted AI (cleared buffers)
        - 'generation_complete': AI finished generating

        Buffers text until turn_complete, then yields the full response.
        Aggregates short responses to prevent fragmented output.
        """
        if not self.session:
            return

        text_buffer = []
        response_count = 0
        turn_count = 0
        aggregation_buffer = []
        last_content_time = time.time()

        try:
            while self.is_active:
                turn_count += 1

                async for response in self.session.receive():
                    response_count += 1

                    # Handle GoAway - connection will terminate soon
                    if hasattr(response, 'go_away') and response.go_away:
                        time_left = getattr(response.go_away, 'time_left', 30)
                        print(f"[LiveSession] GoAway received, {time_left}s remaining", flush=True)
                        if self._on_goaway and time_left > self.config.goaway_reconnect_buffer:
                            asyncio.create_task(self._on_goaway(self, time_left))

                    # Handle session resumption updates
                    if hasattr(response, 'session_resumption_update') and response.session_resumption_update:
                        update = response.session_resumption_update
                        if hasattr(update, 'new_handle') and update.new_handle:
                            self.resume_handle = update.new_handle

                    # Track token usage
                    if hasattr(response, 'usage_metadata') and response.usage_metadata:
                        usage = response.usage_metadata
                        self.token_usage.total_tokens = getattr(usage, 'total_token_count', 0) or 0
                        self.token_usage.last_updated = time.time()
                        details = getattr(usage, 'response_tokens_details', None)
                        if details:
                            for detail in details:
                                modality = getattr(detail, 'modality', '')
                                count = getattr(detail, 'token_count', 0)
                                if 'audio' in str(modality).lower():
                                    self.token_usage.audio_tokens = count
                                elif 'text' in str(modality).lower():
                                    self.token_usage.text_tokens = count

                    # Handle server content
                    if hasattr(response, 'server_content') and response.server_content:
                        server_content = response.server_content

                        # Handle interruption - clear all buffers and notify
                        if getattr(server_content, 'interrupted', False):
                            text_buffer = []
                            aggregation_buffer = []
                            yield LiveMessage(type="interrupted")
                            continue

                        # Extract AI's transcription text
                        if hasattr(server_content, 'output_transcription') and server_content.output_transcription:
                            transcript = server_content.output_transcription
                            if hasattr(transcript, 'text') and transcript.text:
                                text_buffer.append(transcript.text)
                                last_content_time = time.time()

                        # Handle turn complete
                        turn_complete = getattr(server_content, 'turn_complete', None)
                        if turn_complete:
                            if text_buffer:
                                turn_response = "".join(text_buffer)
                                text_buffer = []

                                aggregation_buffer.append(turn_response)
                                aggregated = " ".join(aggregation_buffer)

                                if len(aggregated) >= self.config.min_response_length:
                                    aggregation_buffer = []
                                    yield LiveMessage(type="response", content=aggregated)
                                else:
                                    time_since_content = time.time() - last_content_time
                                    if time_since_content > self.config.response_timeout:
                                        aggregation_buffer = []
                                        yield LiveMessage(type="response", content=aggregated)

                        # Handle generation complete
                        if getattr(server_content, 'generation_complete', False):
                            yield LiveMessage(type="generation_complete")

                # Timeout flush for buffered content
                if aggregation_buffer:
                    time_since_content = time.time() - last_content_time
                    if time_since_content > self.config.response_timeout:
                        aggregated = " ".join(aggregation_buffer)
                        aggregation_buffer = []
                        yield LiveMessage(type="response", content=aggregated)

                await asyncio.sleep(0.01)

        except Exception as e:
            import traceback
            print(f"[LiveSession] Error: {e}", flush=True)
            print(f"[LiveSession] {traceback.format_exc()}", flush=True)
            self.is_active = False
        finally:
            if aggregation_buffer:
                aggregated = " ".join(aggregation_buffer)
                yield LiveMessage(type="response", content=aggregated)

    def get_token_usage(self) -> TokenUsage:
        """Get current token usage statistics."""
        return self.token_usage

    async def stop_session(self) -> None:
        """Gracefully close the session."""
        print("[LiveSession] Stopping session...")
        self.is_active = False

        # Send audio stream end if we were streaming
        if self._audio_streaming and self.session:
            try:
                await self.session.send_realtime_input(audio_stream_end=True)
            except:
                pass

        if self._session_cm:
            try:
                await self._session_cm.__aexit__(None, None, None)
            except Exception as e:
                print(f"[LiveSession] Error closing session: {e}")
            finally:
                self.session = None
                self._session_cm = None

        print(f"[LiveSession] Session stopped. Final token usage: {self.token_usage.total_tokens}")
