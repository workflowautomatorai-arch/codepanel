"""
Service Layer for CodePanel Personal Assistant
Handles AI interactions with proper tool call orchestration
"""

import asyncio
import base64
import os
import threading
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field
from typing import AsyncIterator

from tools import (
    ToolRegistry,
    ToolResult,
    parse_tool_calls,
    create_context_tools_registry,
)
from audio_utils import convert_audio_to_wav


# Configuration
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3-flash-preview")
GEMINI_TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT", "90"))
STORE_INTERACTIONS = os.environ.get("STORE_INTERACTIONS", "true").lower() == "true"
MAX_TOOL_ITERATIONS = int(os.environ.get("MAX_TOOL_ITERATIONS", "5"))

# System instructions
ASSISTANT_SYSTEM_INSTRUCTION = """You are a knowledgeable personal assistant with access to the user's personal context and real-time information.

Your capabilities:
- Access personal context files containing the user's background, skills, and experiences
- Search the web for current information using Google Search
- Fetch and analyze content from URLs

Guidelines:
- For questions about the user's background, experience, or for behavioral interviews: use the context tools
- For questions requiring current/recent information: use Google Search
- For questions about specific URLs or articles: use URL context
- For general questions or coding: respond directly without tools
- Be concise but thorough
- Cite sources when using web search results
- Use STAR format for behavioral interview questions

Always think about which tools (if any) would help provide the best answer before responding."""

INTERVIEW_SYSTEM_INSTRUCTION = """You are an expert coding interview assistant. Provide clear, accurate, and well-structured solutions. Focus on optimal time and space complexity. Explain your reasoning."""


@dataclass
class AssistantRequest:
    """Request model for the assistant service"""
    text: str = ""
    images: List[str] = field(default_factory=list)
    audio: Optional[str] = None
    previous_interaction_id: Optional[str] = None
    enable_web_search: bool = True
    enable_url_context: bool = True
    enable_personal_context: bool = True


@dataclass
class AssistantResponse:
    """Response model from the assistant service"""
    response: str
    interaction_id: str
    sources: List[str] = field(default_factory=list)
    context_files_used: List[str] = field(default_factory=list)


@dataclass
class StreamChunk:
    """A chunk of streaming response"""
    type: str  # 'text', 'done', 'error'
    content: str = ""
    interaction_id: str = ""
    sources: List[str] = field(default_factory=list)
    context_files_used: List[str] = field(default_factory=list)


class AssistantService:
    """
    High-level service for AI assistant interactions.
    Handles tool orchestration and conversation management.
    """

    def __init__(self, client, tool_registry: Optional[ToolRegistry] = None):
        """
        Initialize the assistant service.

        Args:
            client: Gemini client instance
            tool_registry: Optional tool registry (creates default if not provided)
        """
        self._client = client
        self._registry = tool_registry or create_context_tools_registry()

    async def query(self, request: AssistantRequest) -> AssistantResponse:
        """
        Process an assistant query with full tool support.

        Args:
            request: The assistant request

        Returns:
            AssistantResponse with the AI's response and metadata
        """
        loop = asyncio.get_running_loop()

        # Build content
        content = self._build_content(request)

        # Get tools based on request settings
        tools = self._get_enabled_tools(request)

        # Build request params
        params = {
            "model": GEMINI_MODEL,
            "input": content,
            "system_instruction": ASSISTANT_SYSTEM_INSTRUCTION,
            "store": STORE_INTERACTIONS,
        }

        if request.previous_interaction_id:
            params["previous_interaction_id"] = request.previous_interaction_id

        if tools:
            params["tools"] = tools

        # Track metadata
        context_files_used = []
        sources = []

        # Execute with tool call loop
        interaction = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: self._client.interactions.create(**params)),
            timeout=GEMINI_TIMEOUT
        )

        # Handle tool calls in a loop
        iteration = 0
        while iteration < MAX_TOOL_ITERATIONS:
            tool_calls = parse_tool_calls(interaction.outputs)

            if not tool_calls:
                break  # No more tool calls, we have the final response

            iteration += 1
            print(f"[Assistant] Tool call iteration {iteration}: {[tc.name for tc in tool_calls]}")

            # Execute all tool calls that have handlers
            # Note: Built-in tools (google_search, url_context) are handled server-side by Gemini
            results = []
            for tc in tool_calls:
                if self._registry.has_handler(tc.name):
                    result = self._registry.execute_tool(tc)
                    results.append(result)

                    # Track context file usage
                    if tc.name == "read_context_file" and result.success:
                        filename = tc.arguments.get("filename", "")
                        if filename:
                            context_files_used.append(filename)

                    print(f"[Assistant] Executed {tc.name}: success={result.success}")
                else:
                    # Log unhandled tool calls (shouldn't happen for properly registered tools)
                    print(f"[Assistant] Warning: No handler for tool '{tc.name}', skipping")

            if not results:
                # No executable tool calls found - either all were built-in or unregistered
                print(f"[Assistant] No custom tools executed, breaking loop")
                break

            # Send results back to get next response
            function_results = [
                {
                    "type": "function_result",
                    "name": r.name,
                    "call_id": r.call_id,
                    "result": r.result
                }
                for r in results
            ]

            interaction = await asyncio.wait_for(
                loop.run_in_executor(
                    None,
                    lambda fr=function_results: self._client.interactions.create(
                        model=GEMINI_MODEL,
                        previous_interaction_id=interaction.id,
                        input=fr
                    )
                ),
                timeout=GEMINI_TIMEOUT
            )

        # Extract final response
        response_text = self._extract_text(interaction)

        # Extract sources from web search results if any
        sources = self._extract_sources(interaction)

        return AssistantResponse(
            response=response_text,
            interaction_id=interaction.id,
            sources=sources,
            context_files_used=context_files_used
        )

    async def query_stream(self, request: AssistantRequest) -> AsyncIterator[StreamChunk]:
        """
        Process an assistant query with streaming response.
        Yields StreamChunk objects as the response is generated.
        Handles tool calls by executing them and continuing the stream.
        """
        import sys
        from tools import ToolCall
        loop = asyncio.get_running_loop()

        # Build content
        content = self._build_content(request)

        # Get tools based on request settings
        tools = self._get_enabled_tools(request)

        print(f"[Stream] === Starting query_stream ===", flush=True)
        print(f"[Stream] enable_personal_context: {request.enable_personal_context}", flush=True)
        print(f"[Stream] Tools count: {len(tools)}", flush=True)
        print(f"[Stream] Tool names: {[t.get('name', t.get('type', 'unknown')) for t in tools]}", flush=True)
        print(f"[Stream] Request text: {request.text[:100] if request.text else 'None'}...", flush=True)
        print(f"[Stream] Request has audio: {bool(request.audio)}", flush=True)
        print(f"[Stream] Request images count: {len(request.images)}", flush=True)
        print(f"[Stream] Content parts: {[c.get('type') for c in content]}", flush=True)
        sys.stdout.flush()

        # Build request params with streaming enabled
        params = {
            "model": GEMINI_MODEL,
            "input": content,
            "system_instruction": ASSISTANT_SYSTEM_INSTRUCTION,
            "store": STORE_INTERACTIONS,
            "stream": True,
        }

        if request.previous_interaction_id:
            params["previous_interaction_id"] = request.previous_interaction_id

        if tools:
            params["tools"] = tools

        print(f"[Stream] Params keys: {list(params.keys())}", flush=True)
        print(f"[Stream] Has tools in params: {'tools' in params}", flush=True)
        if tools:
            import json
            print(f"[Stream] First tool definition: {json.dumps(tools[0], indent=2)}", flush=True)

        # Track metadata
        context_files_used = []
        interaction_id = ""

        try:
            iteration = 0
            while iteration < MAX_TOOL_ITERATIONS:
                iteration += 1
                print(f"[Stream] Iteration {iteration}", flush=True)

                # Create streaming interaction
                stream = await loop.run_in_executor(
                    None, lambda p=params: self._client.interactions.create(**p)
                )
                print(f"[Stream] Stream object created: {type(stream)}", flush=True)

                # Collect any tool calls that need to be processed
                pending_tool_calls = []

                # Process stream chunks
                for chunk in stream:
                    event_type = getattr(chunk, 'event_type', None)

                    # Debug: print all chunk attributes
                    chunk_attrs = {k: v for k, v in vars(chunk).items() if not k.startswith('_')}
                    print(f"[Stream] Chunk: event_type={event_type}, attrs={list(chunk_attrs.keys())}", flush=True)

                    if hasattr(chunk, 'id') and chunk.id:
                        interaction_id = chunk.id

                    # Get interaction ID from interaction.start
                    if event_type == "interaction.start":
                        if hasattr(chunk, 'interaction') and chunk.interaction:
                            interaction_id = getattr(chunk.interaction, 'id', '') or interaction_id

                    # Check for interaction.complete which contains the full interaction
                    if event_type == "interaction.complete":
                        print(f"[Stream] Interaction complete, checking outputs", flush=True)
                        if hasattr(chunk, 'interaction') and chunk.interaction:
                            interaction_obj = chunk.interaction
                            print(f"[Stream] Interaction status: {getattr(interaction_obj, 'status', 'unknown')}", flush=True)
                            print(f"[Stream] Interaction attrs: {[k for k in dir(interaction_obj) if not k.startswith('_')]}", flush=True)
                            outputs = getattr(interaction_obj, 'outputs', None) or []
                            print(f"[Stream] Outputs count: {len(outputs)}", flush=True)
                            for output in outputs:
                                output_type = getattr(output, 'type', None)
                                print(f"[Stream] Output type: {output_type}", flush=True)
                                if output_type == "function_call":
                                    name = getattr(output, 'name', '')
                                    call_id = getattr(output, 'id', '')
                                    args = getattr(output, 'arguments', {})
                                    print(f"[Stream] Found function_call in outputs: name={name}, call_id='{call_id}'", flush=True)
                                    if self._registry.has_handler(name):
                                        tc = ToolCall(
                                            name=name,
                                            call_id=call_id,
                                            arguments=args or {}
                                        )
                                        pending_tool_calls.append(tc)

                    if event_type == "content.delta":
                        delta = getattr(chunk, 'delta', None)
                        if delta:
                            delta_type = getattr(delta, 'type', None)
                            print(f"[Stream] Delta type: {delta_type}", flush=True)

                            if delta_type == "text":
                                text = getattr(delta, 'text', '')
                                if text:  # Only yield non-empty text
                                    print(f"[Stream] Yielding text chunk, len={len(text)}", flush=True)
                                    yield StreamChunk(
                                        type="text",
                                        content=text,
                                        interaction_id=interaction_id
                                    )
                            elif delta_type == "function_call":
                                # Function calls come as content.delta with call_id
                                # In streaming mode, interaction.complete has empty outputs,
                                # so we MUST collect tool calls from content.delta
                                name = getattr(delta, 'name', '')
                                call_id = getattr(delta, 'id', '')
                                args = getattr(delta, 'arguments', {})
                                print(f"[Stream] Function call delta: name={name}, call_id='{call_id}', args={args}", flush=True)
                                if name and call_id and self._registry.has_handler(name):
                                    tc = ToolCall(
                                        name=name,
                                        call_id=call_id,
                                        arguments=args or {}
                                    )
                                    pending_tool_calls.append(tc)
                                    print(f"[Stream] Added tool call to pending: {name}", flush=True)

                print(f"[Stream] Stream consumed, pending_tool_calls: {len(pending_tool_calls)}", flush=True)

                # If no tool calls, we're done
                if not pending_tool_calls:
                    break

                # Execute all pending tool calls and send results back
                function_results = []
                for tc in pending_tool_calls:
                    result = self._registry.execute_tool(tc)

                    if tc.name == "read_context_file" and result.success:
                        filename = tc.arguments.get("filename", "")
                        if filename:
                            context_files_used.append(filename)

                    print(f"[Stream] Executed {tc.name}: success={result.success}", flush=True)

                    function_results.append({
                        "type": "function_result",
                        "name": tc.name,
                        "call_id": tc.call_id,
                        "result": result.result
                    })

                # Continue conversation with tool results
                import json as json_module
                print(f"[Stream] Function results to send: {json_module.dumps(function_results, indent=2)}", flush=True)
                params = {
                    "model": GEMINI_MODEL,
                    "previous_interaction_id": interaction_id,
                    "input": function_results,
                    "stream": True,
                }
                # Include tools so model can make additional tool calls if needed
                if tools:
                    params["tools"] = tools
                print(f"[Stream] Continuing with function results, interaction_id: {interaction_id}", flush=True)

            # Send completion chunk
            print(f"[Stream] Sending done chunk", flush=True)
            yield StreamChunk(
                type="done",
                interaction_id=interaction_id,
                context_files_used=context_files_used
            )

        except Exception as e:
            import traceback
            print(f"[Stream] Error: {e}", flush=True)
            traceback.print_exc()
            yield StreamChunk(
                type="error",
                content=str(e)
            )

    def _build_content(self, request: AssistantRequest) -> list:
        """Build content array for Gemini API"""
        content = []

        # Add images
        for img in request.images:
            if img.startswith("data:"):
                if "," not in img:
                    continue  # Skip malformed data URI without comma
                header, data = img.split(",", 1)
                parts = header.split(";")[0].split(":")
                mime_type = parts[1] if len(parts) > 1 and parts[1] else "application/octet-stream"
            else:
                mime_type = "image/png"
                data = img

            content.append({
                "type": "image",
                "data": data,
                "mime_type": mime_type
            })

        # Add audio if present
        if request.audio:
            audio_content = self._process_audio(request.audio)
            if audio_content:
                content.append(audio_content)

        # Add text - use appropriate default based on content type
        if request.text:
            text = request.text
        elif request.audio:
            # For voice messages, instruct model to respond to what was said
            text = "Listen to my voice message and respond to what I said. Treat this as a conversation."
        else:
            text = "Please analyze the provided content."
        content.append({"type": "text", "text": text})

        return content

    def _process_audio(self, audio: str) -> Optional[Dict[str, Any]]:
        """Process audio input, converting if necessary"""
        try:
            if audio.startswith("data:"):
                header, data = audio.split(",", 1)
                source_mime = header.split(";")[0].split(":")[1]
            else:
                source_mime = "audio/webm"
                data = audio

            audio_bytes = base64.b64decode(data)

            if "webm" in source_mime or "opus" in source_mime:
                print(f"[Assistant] Converting {source_mime} to WAV...")
                audio_bytes = convert_audio_to_wav(audio_bytes, "webm")
                mime_type = "audio/wav"
            else:
                mime_type = source_mime

            return {
                "type": "audio",
                "data": base64.b64encode(audio_bytes).decode('utf-8'),
                "mime_type": mime_type
            }
        except Exception as e:
            print(f"[Assistant] Audio processing error: {e}")
            return None

    def _get_enabled_tools(self, request: AssistantRequest) -> List[Dict[str, Any]]:
        """Get tools based on request settings"""
        tools = []

        # Add custom context tools if enabled
        if request.enable_personal_context:
            custom_tools = self._registry.get_tools(include_custom=True, include_builtin=False)
            tools.extend(custom_tools)

        # NOTE: Built-in tools (google_search, url_context) are disabled because
        # Gemini Interactions API does not yet support combining custom function tools
        # with built-in tools. Re-enable when this limitation is lifted.
        # See: https://ai.google.dev/gemini-api/docs/interactions#limitations
        #
        # if request.enable_web_search:
        #     tools.append({"type": "google_search"})
        #
        # if request.enable_url_context:
        #     tools.append({"type": "url_context"})

        return tools

    def _extract_text(self, interaction) -> str:
        """Extract text response from interaction"""
        if not interaction.outputs:
            return ""

        # First try to find an explicit text output
        for output in interaction.outputs:
            if output.type == "text":
                return output.text

        # Fall back to last output if it has text attribute
        last_output = interaction.outputs[-1]
        if hasattr(last_output, 'text') and last_output.text:
            return last_output.text

        return ""

    def _extract_sources(self, interaction) -> List[str]:
        """Extract source URLs from search results if present"""
        sources = []
        for output in interaction.outputs:
            # Google search results may include source info
            if hasattr(output, 'grounding_metadata') and output.grounding_metadata:
                if hasattr(output.grounding_metadata, 'web_search_queries'):
                    # Could extract URLs here if available in the response
                    pass
        return sources


# Singleton service instance
_assistant_service: Optional[AssistantService] = None
_service_lock = threading.Lock()


def get_assistant_service(client) -> AssistantService:
    """Get or create the assistant service singleton (thread-safe)"""
    global _assistant_service
    if _assistant_service is None:
        with _service_lock:
            # Double-check locking pattern
            if _assistant_service is None:
                _assistant_service = AssistantService(client)
    return _assistant_service
