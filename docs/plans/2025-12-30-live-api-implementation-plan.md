# Live API Always-On Listener Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a real-time listening mode that uses Google's Live API to provide proactive assistance during meetings and interviews.

**Architecture:** Electron captures system + mic audio via WASAPI, streams to Python backend via WebSocket, which maintains persistent Live API connection. Text responses flow back to React frontend and display inline in existing chat UI.

**Tech Stack:** Electron (audio capture), Python FastAPI (WebSocket + Live API), React (UI toggle), google-genai SDK (Live API client)

**Reference Design:** See `docs/plans/2025-12-30-live-api-always-on-design.md` for architecture diagrams and rationale.

---

## Phase 1: Python Backend - Live Session Manager

### Task 1: Add Live Session Manager Module

**Files:**
- Create: `backend/live_session.py`

**Step 1: Create the LiveSessionManager class skeleton**

```python
"""
Live Session Manager for Gemini Live API
Handles persistent WebSocket connection with proactive audio
"""

import asyncio
from typing import AsyncIterator, Optional
from dataclasses import dataclass


@dataclass
class LiveConfig:
    """Configuration for Live API session"""
    model: str = "gemini-2.5-flash-native-audio-preview-12-2025"
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
        """Start a new Live API session with proactive audio."""
        raise NotImplementedError("To be implemented")

    async def send_audio(self, pcm_data: bytes) -> None:
        """Forward audio chunk to Live API."""
        raise NotImplementedError("To be implemented")

    async def send_text(self, text: str) -> None:
        """Send text message to Live API session."""
        raise NotImplementedError("To be implemented")

    async def receive_responses(self) -> AsyncIterator[str]:
        """Yield text responses as they arrive."""
        raise NotImplementedError("To be implemented")
        yield ""  # Make it a generator

    async def stop_session(self) -> None:
        """Gracefully close the session."""
        raise NotImplementedError("To be implemented")
```

**Step 2: Verify module imports correctly**

Run: `cd backend && python -c "from live_session import LiveSessionManager; print('OK')"`
Expected: `OK`

**Step 3: Commit skeleton**

```bash
git add backend/live_session.py
git commit -m "feat(live): add LiveSessionManager skeleton"
```

---

### Task 2: Implement start_session Method

**Files:**
- Modify: `backend/live_session.py`

**Step 1: Import google.genai types and implement start_session**

Replace the `start_session` method and add imports:

```python
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
    model: str = "gemini-2.5-flash-native-audio-preview-12-2025"
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
        """Forward audio chunk to Live API."""
        raise NotImplementedError("To be implemented")

    async def send_text(self, text: str) -> None:
        """Send text message to Live API session."""
        raise NotImplementedError("To be implemented")

    async def receive_responses(self) -> AsyncIterator[str]:
        """Yield text responses as they arrive."""
        raise NotImplementedError("To be implemented")
        yield ""

    async def stop_session(self) -> None:
        """Gracefully close the session."""
        raise NotImplementedError("To be implemented")
```

**Step 2: Verify syntax is correct**

Run: `cd backend && python -c "from live_session import LiveSessionManager; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/live_session.py
git commit -m "feat(live): implement start_session with proactive audio config"
```

---

### Task 3: Implement send_audio and send_text Methods

**Files:**
- Modify: `backend/live_session.py`

**Step 1: Replace the send_audio and send_text methods**

```python
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
```

**Step 2: Verify syntax**

Run: `cd backend && python -c "from live_session import LiveSessionManager; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/live_session.py
git commit -m "feat(live): implement send_audio and send_text methods"
```

---

### Task 4: Implement receive_responses Method

**Files:**
- Modify: `backend/live_session.py`

**Step 1: Replace the receive_responses method**

```python
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
```

**Step 2: Verify syntax**

Run: `cd backend && python -c "from live_session import LiveSessionManager; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/live_session.py
git commit -m "feat(live): implement receive_responses with session resumption"
```

---

### Task 5: Implement stop_session Method

**Files:**
- Modify: `backend/live_session.py`

**Step 1: Replace the stop_session method**

```python
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
```

**Step 2: Verify complete module**

Run: `cd backend && python -c "from live_session import LiveSessionManager, LiveConfig; print('LiveSessionManager ready')"`
Expected: `LiveSessionManager ready`

**Step 3: Commit**

```bash
git add backend/live_session.py
git commit -m "feat(live): implement stop_session for graceful cleanup"
```

---

## Phase 2: Python Backend - System Prompt

### Task 6: Add Live Mode System Prompt

**Files:**
- Modify: `backend/prompts.py`

**Step 1: Add the get_live_system_prompt function at the end of prompts.py**

```python
def get_live_system_prompt() -> str:
    """
    Build system prompt for Live API "always-on" mode.
    Tells the AI when to respond and when to stay silent.
    """
    files_info = get_system_prompt_with_files()

    return f"""You are a real-time meeting and interview assistant listening to a conversation.

## YOUR ROLE
You hear both the user and other participants. Help the user by providing relevant information ONLY when needed.

## WHEN TO RESPOND
Respond when:
- Someone asks the user a direct question (e.g., "What do you think about...", "Can you explain...")
- A behavioral interview question is asked ("Tell me about a time...", "Describe a situation...")
- The user is asked about their experience, background, or skills
- Technical questions are directed at the user that they might need help with
- Someone asks for specific facts, dates, or details the user might not remember

## WHEN TO STAY SILENT
Do NOT respond when:
- General conversation not directed at the user
- The user is clearly handling the question well on their own
- Small talk or pleasantries
- Questions directed at other participants
- The user has already answered adequately

## RESPONSE STYLE
- Be concise - the user needs to read quickly while in conversation
- Lead with the key point or answer
- Use bullet points for multiple items
- For behavioral questions, suggest STAR format points
- For technical questions, give direct answers

## CONTEXT AVAILABLE
{files_info}

Use context files ONLY for behavioral/background questions about the user's experience.

## IMPORTANT
You are a silent helper. The user will read your responses on screen. Keep responses brief and actionable."""
```

**Step 2: Verify function works**

Run: `cd backend && python -c "from prompts import get_live_system_prompt; p = get_live_system_prompt(); print(f'Prompt length: {len(p)} chars')"`
Expected: `Prompt length: XXXX chars` (should be > 1000)

**Step 3: Commit**

```bash
git add backend/prompts.py
git commit -m "feat(live): add system prompt for always-on listening mode"
```

---

## Phase 3: Python Backend - WebSocket Endpoint

### Task 7: Add WebSocket Endpoint to Server

**Files:**
- Modify: `backend/server.py`

**Step 1: Add imports at the top of server.py (after existing imports)**

```python
import uuid
import time
from fastapi import WebSocket, WebSocketDisconnect
from live_session import LiveSessionManager
from prompts import get_live_system_prompt
```

**Step 2: Add the WebSocket endpoint before the health check section**

Add this before the `# HEALTH CHECK` section comment:

```python
# =============================================================================
# LIVE API WEBSOCKET ENDPOINT
# =============================================================================

@app.websocket("/live/stream")
async def live_audio_stream(websocket: WebSocket):
    """
    Bidirectional WebSocket for live audio streaming.

    Client sends:
    - Binary data: PCM audio chunks (16kHz, 16-bit, mono)
    - JSON: {"type": "text", "content": "..."} for text messages

    Server sends:
    - JSON: {"type": "ready", "session_id": "..."}
    - JSON: {"type": "response", "content": "...", "timestamp": ...}
    - JSON: {"type": "error", "content": "..."}
    """
    await websocket.accept()
    session_id = str(uuid.uuid4())

    client = get_client()
    manager = LiveSessionManager(client)

    print(f"[Live] New connection: {session_id}")

    try:
        # Start Live API session with system prompt
        system_prompt = get_live_system_prompt()
        await manager.start_session(system_prompt)

        # Send ready confirmation
        await websocket.send_json({
            "type": "ready",
            "session_id": session_id
        })

        # Run send and receive concurrently
        async with asyncio.TaskGroup() as tg:
            tg.create_task(_handle_incoming(websocket, manager))
            tg.create_task(_handle_outgoing(websocket, manager))

    except WebSocketDisconnect:
        print(f"[Live] Client disconnected: {session_id}")
    except Exception as e:
        print(f"[Live] Error: {e}")
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
        except:
            pass
    finally:
        await manager.stop_session()
        print(f"[Live] Session ended: {session_id}")


async def _handle_incoming(websocket: WebSocket, manager: LiveSessionManager):
    """Receive audio/text from Electron, forward to Live API"""
    try:
        while manager.is_active:
            message = await websocket.receive()

            if "bytes" in message:
                # Binary audio data
                await manager.send_audio(message["bytes"])
            elif "text" in message:
                # JSON text message
                import json
                data = json.loads(message["text"])
                if data.get("type") == "text":
                    await manager.send_text(data.get("content", ""))
    except WebSocketDisconnect:
        manager.is_active = False
    except Exception as e:
        print(f"[Live] Incoming handler error: {e}")
        manager.is_active = False


async def _handle_outgoing(websocket: WebSocket, manager: LiveSessionManager):
    """Receive text from Live API, send to Electron"""
    try:
        async for text in manager.receive_responses():
            await websocket.send_json({
                "type": "response",
                "content": text,
                "timestamp": time.time()
            })
    except Exception as e:
        print(f"[Live] Outgoing handler error: {e}")
```

**Step 3: Verify server starts**

Run: `cd backend && python -c "from server import app; print('Server imports OK')"`
Expected: `Server imports OK`

**Step 4: Commit**

```bash
git add backend/server.py
git commit -m "feat(live): add WebSocket endpoint for live audio streaming"
```

---

## Phase 4: Electron - Audio Capture

### Task 8: Install Audio Capture Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install audify for WASAPI support**

Run: `npm install audify`

**Step 2: Verify installation**

Run: `npm ls audify`
Expected: Shows audify version

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add audify for Windows audio capture"
```

---

### Task 9: Create Audio Capture Module

**Files:**
- Create: `electron/audio-capture.ts`

**Step 1: Create the AudioCapture class**

```typescript
/**
 * Audio Capture Module for Windows
 * Captures system audio (WASAPI loopback) and microphone, mixes them together
 */

// Note: audify types may need adjustment based on actual library API
// This is a reference implementation - adjust based on audify docs

export interface AudioCaptureConfig {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  chunkMs: number;
}

const DEFAULT_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  chunkMs: 100,
};

type AudioDataCallback = (data: Buffer) => void;

export class AudioCapture {
  private config: AudioCaptureConfig;
  private onDataCallback: AudioDataCallback | null = null;
  private isRunning = false;
  private captureInterval: NodeJS.Timeout | null = null;

  // Audio capture instances (will be initialized on start)
  private systemCapture: unknown = null;
  private micCapture: unknown = null;

  constructor(config: Partial<AudioCaptureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register callback for audio data
   */
  onAudioData(callback: AudioDataCallback): void {
    this.onDataCallback = callback;
  }

  /**
   * Start capturing system audio and microphone
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[AudioCapture] Already running');
      return;
    }

    console.log('[AudioCapture] Starting audio capture...');
    console.log(`[AudioCapture] Config: ${JSON.stringify(this.config)}`);

    try {
      // Dynamic import to avoid issues if audify not available
      const Audify = await import('audify');

      // TODO: Initialize WASAPI loopback for system audio
      // TODO: Initialize microphone capture
      // TODO: Mix both streams

      // For now, create a placeholder that sends silence
      // This allows testing the pipeline before full WASAPI implementation
      this.isRunning = true;

      const samplesPerChunk = (this.config.sampleRate * this.config.chunkMs) / 1000;
      const bytesPerChunk = samplesPerChunk * (this.config.bitsPerSample / 8);

      this.captureInterval = setInterval(() => {
        if (this.onDataCallback && this.isRunning) {
          // Send silence for now - replace with actual audio mixing
          const silenceBuffer = Buffer.alloc(bytesPerChunk, 0);
          this.onDataCallback(silenceBuffer);
        }
      }, this.config.chunkMs);

      console.log('[AudioCapture] Started (placeholder mode)');
    } catch (error) {
      console.error('[AudioCapture] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop capturing audio
   */
  stop(): void {
    console.log('[AudioCapture] Stopping...');
    this.isRunning = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    // TODO: Clean up WASAPI captures

    console.log('[AudioCapture] Stopped');
  }

  /**
   * Check if currently capturing
   */
  isCapturing(): boolean {
    return this.isRunning;
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run compile:electron`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/audio-capture.ts
git commit -m "feat(audio): add AudioCapture module skeleton for Windows"
```

---

## Phase 5: Electron - IPC Handlers

### Task 10: Add Live Session IPC Handlers

**Files:**
- Modify: `electron/ipc.handlers.ts`

**Step 1: Add imports at top of file**

```typescript
import WebSocket from 'ws';
import { AudioCapture } from './audio-capture';
```

**Step 2: Add live session state variables after other module-level variables**

```typescript
// Live session state
let liveSocket: WebSocket | null = null;
let audioCapture: AudioCapture | null = null;
```

**Step 3: Add helper function for WebSocket message waiting**

```typescript
function waitForMessage(ws: WebSocket, type: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for message type: ${type}`));
    }, timeoutMs);

    const handler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === type) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(message);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.on('message', handler);
  });
}
```

**Step 4: Add IPC handlers for live session**

```typescript
// Start live listening session
ipcMain.handle('start-live-session', async () => {
  try {
    // Close existing session if any
    if (liveSocket) {
      liveSocket.close();
      liveSocket = null;
    }
    if (audioCapture) {
      audioCapture.stop();
      audioCapture = null;
    }

    // Connect to Python backend WebSocket
    liveSocket = new WebSocket('ws://localhost:3000/live/stream');

    await new Promise<void>((resolve, reject) => {
      liveSocket!.onopen = () => resolve();
      liveSocket!.onerror = (err) => reject(err);
    });

    // Wait for ready confirmation from backend
    const ready = await waitForMessage(liveSocket, 'ready');
    console.log('[IPC] Live session ready:', ready.session_id);

    // Start audio capture
    audioCapture = new AudioCapture();
    audioCapture.onAudioData((pcmData: Buffer) => {
      if (liveSocket?.readyState === WebSocket.OPEN) {
        liveSocket.send(pcmData);
      }
    });
    await audioCapture.start();

    // Forward responses to renderer
    liveSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data.toString());
        if (data.type === 'response') {
          const mainWindow = BrowserWindow.getAllWindows()[0];
          mainWindow?.webContents.send('live-response', data);
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    liveSocket.onclose = () => {
      console.log('[IPC] Live WebSocket closed');
      audioCapture?.stop();
      audioCapture = null;
      liveSocket = null;
    };

    return { success: true, sessionId: ready.session_id };
  } catch (error) {
    console.error('[IPC] Failed to start live session:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Stop live listening session
ipcMain.handle('stop-live-session', async () => {
  try {
    audioCapture?.stop();
    audioCapture = null;
    liveSocket?.close();
    liveSocket = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
});

// Send text while in live mode
ipcMain.handle('send-live-text', async (_, text: string) => {
  if (liveSocket?.readyState === WebSocket.OPEN) {
    liveSocket.send(JSON.stringify({ type: 'text', content: text }));
    return { success: true };
  }
  return { success: false, error: 'Live session not active' };
});
```

**Step 5: Verify TypeScript compiles**

Run: `npm run compile:electron`
Expected: No errors (may need to add ws to dependencies if not present)

**Step 6: Install ws if needed**

Run: `npm install ws && npm install -D @types/ws`

**Step 7: Commit**

```bash
git add electron/ipc.handlers.ts package.json package-lock.json
git commit -m "feat(ipc): add live session handlers for start/stop/text"
```

---

### Task 11: Update Preload Script

**Files:**
- Modify: `electron/preload.ts`

**Step 1: Add live mode API methods to contextBridge**

Add these to the `electronAPI` object in `contextBridge.exposeInMainWorld`:

```typescript
  // Live mode
  startLiveSession: () => ipcRenderer.invoke('start-live-session'),
  stopLiveSession: () => ipcRenderer.invoke('stop-live-session'),
  sendLiveText: (text: string) => ipcRenderer.invoke('send-live-text', text),
  onLiveResponse: (callback: (response: { type: string; content: string; timestamp: number }) => void) => {
    const handler = (_: Electron.IpcRendererEvent, response: { type: string; content: string; timestamp: number }) => callback(response);
    ipcRenderer.on('live-response', handler);
    return () => {
      ipcRenderer.removeListener('live-response', handler);
    };
  },
```

**Step 2: Verify TypeScript compiles**

Run: `npm run compile:electron`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/preload.ts
git commit -m "feat(preload): expose live session API to renderer"
```

---

### Task 12: Update TypeScript Types

**Files:**
- Modify: `src/electron.d.ts`

**Step 1: Add live mode types to ElectronAPI interface**

```typescript
  // Live mode
  startLiveSession: () => Promise<{ success: boolean; sessionId?: string; error?: string }>;
  stopLiveSession: () => Promise<{ success: boolean; error?: string }>;
  sendLiveText: (text: string) => Promise<{ success: boolean; error?: string }>;
  onLiveResponse: (callback: (response: { type: string; content: string; timestamp: number }) => void) => () => void;
```

**Step 2: Verify TypeScript compiles**

Run: `npm run compile`
Expected: No errors

**Step 3: Commit**

```bash
git add src/electron.d.ts
git commit -m "types: add live session API types"
```

---

## Phase 6: Electron - Keyboard Shortcut

### Task 13: Add Live Mode Keyboard Shortcut

**Files:**
- Modify: `electron/shortcuts.ts`

**Step 1: Add live mode toggle shortcut**

Find where shortcuts are registered and add:

```typescript
  // Live mode toggle
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    mainWindow?.webContents.send('toggle-live-mode');
  });
```

**Step 2: Verify TypeScript compiles**

Run: `npm run compile:electron`
Expected: No errors

**Step 3: Commit**

```bash
git add electron/shortcuts.ts
git commit -m "feat(shortcuts): add Ctrl+Shift+L for live mode toggle"
```

---

## Phase 7: Frontend - Live Mode UI

### Task 14: Add Live Mode Hook

**Files:**
- Create: `src/hooks/useLiveMode.ts`

**Step 1: Create the useLiveMode hook**

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';
import { useChatContext, ChatMessage, generateMessageId } from '../contexts/ChatContext';
import { useToast } from '../contexts/toast';

interface UseLiveModeReturn {
  isLiveMode: boolean;
  isConnecting: boolean;
  toggleLiveMode: () => Promise<void>;
  sendTextInLiveMode: (text: string) => Promise<void>;
}

export function useLiveMode(): UseLiveModeReturn {
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const { addMessage } = useChatContext();
  const { showToast } = useToast();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Set up response listener
  useEffect(() => {
    if (isLiveMode) {
      unsubscribeRef.current = window.electronAPI.onLiveResponse((response) => {
        if (response.type === 'response' && response.content) {
          const message: ChatMessage = {
            id: generateMessageId(),
            role: 'assistant',
            content: response.content,
            timestamp: Date.now(),
            status: 'complete',
            metadata: { source: 'live' },
          };
          addMessage(message);
        }
      });
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isLiveMode, addMessage]);

  // Listen for keyboard shortcut toggle
  useEffect(() => {
    const handleToggle = () => {
      toggleLiveMode();
    };

    // Listen for IPC event from main process
    const unsubscribe = window.electronAPI.onLiveResponse &&
      (() => {
        // This would need a separate IPC channel for toggle
        // For now, toggle is handled via button click
      });

    return () => {
      // Cleanup
    };
  }, []);

  const toggleLiveMode = useCallback(async () => {
    if (isLiveMode) {
      // Stop live mode
      const result = await window.electronAPI.stopLiveSession();
      if (result.success) {
        setIsLiveMode(false);
        showToast('Live Mode', 'Stopped listening', 'default');
      } else {
        showToast('Error', result.error || 'Failed to stop', 'error');
      }
    } else {
      // Start live mode
      setIsConnecting(true);
      try {
        const result = await window.electronAPI.startLiveSession();
        if (result.success) {
          setIsLiveMode(true);
          showToast('Live Mode', 'Now listening...', 'default');
        } else {
          showToast('Error', result.error || 'Failed to start', 'error');
        }
      } finally {
        setIsConnecting(false);
      }
    }
  }, [isLiveMode, showToast]);

  const sendTextInLiveMode = useCallback(async (text: string) => {
    if (!isLiveMode) return;

    const result = await window.electronAPI.sendLiveText(text);
    if (!result.success) {
      showToast('Error', result.error || 'Failed to send', 'error');
    }
  }, [isLiveMode, showToast]);

  return {
    isLiveMode,
    isConnecting,
    toggleLiveMode,
    sendTextInLiveMode,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `npm run compile:renderer`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/useLiveMode.ts
git commit -m "feat(hooks): add useLiveMode hook for live session management"
```

---

### Task 15: Update AssistantPage for Live Mode

**Files:**
- Modify: `src/pages/AssistantPage.tsx`

**Step 1: Import and use the live mode hook**

Add import:
```typescript
import { useLiveMode } from '../hooks/useLiveMode';
```

**Step 2: Use the hook in the component**

Add inside the component:
```typescript
const { isLiveMode, isConnecting, toggleLiveMode, sendTextInLiveMode } = useLiveMode();
```

**Step 3: Modify the message sending to handle live mode**

Update the send message logic to route through live mode when active:
```typescript
const handleSendMessage = async (text: string, screenshots?: Screenshot[]) => {
  if (isLiveMode && !screenshots?.length) {
    // Add user message to chat
    addMessage({
      id: generateMessageId(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'complete',
    });
    // Send through live session
    await sendTextInLiveMode(text);
  } else {
    // Use regular assistant
    await sendMessage(text, screenshots);
  }
};
```

**Step 4: Pass live mode props to child components**

Pass to AssistantCommands or wherever the toggle button will live:
```typescript
<AssistantCommands
  isLiveMode={isLiveMode}
  isConnecting={isConnecting}
  onToggleLiveMode={toggleLiveMode}
  // ... other props
/>
```

**Step 5: Verify TypeScript compiles**

Run: `npm run compile:renderer`
Expected: No errors (may have errors until AssistantCommands is updated)

**Step 6: Commit**

```bash
git add src/pages/AssistantPage.tsx
git commit -m "feat(assistant): integrate live mode into AssistantPage"
```

---

### Task 16: Add Live Mode Toggle Button

**Files:**
- Modify: `src/components/Commands/AssistantCommands.tsx`

**Step 1: Add live mode props to component**

```typescript
interface AssistantCommandsProps {
  // ... existing props
  isLiveMode?: boolean;
  isConnecting?: boolean;
  onToggleLiveMode?: () => void;
}
```

**Step 2: Add the toggle button**

Import icon:
```typescript
import { Radio, Loader2 } from 'lucide-react';
```

Add button in the commands area:
```typescript
{onToggleLiveMode && (
  <CommandButton
    onClick={onToggleLiveMode}
    disabled={isConnecting}
    variant={isLiveMode ? "destructive" : "default"}
    title={isLiveMode ? "Stop listening (Ctrl+Shift+L)" : "Start listening (Ctrl+Shift+L)"}
  >
    {isConnecting ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : (
      <Radio className={`h-4 w-4 ${isLiveMode ? 'text-red-500' : ''}`} />
    )}
  </CommandButton>
)}
```

**Step 3: Add visual indicator when live mode is active**

```typescript
{isLiveMode && (
  <div className="flex items-center gap-1.5 text-xs text-red-500 ml-2">
    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
    <span>Listening</span>
  </div>
)}
```

**Step 4: Verify TypeScript compiles**

Run: `npm run compile:renderer`
Expected: No errors

**Step 5: Commit**

```bash
git add src/components/Commands/AssistantCommands.tsx
git commit -m "feat(ui): add live mode toggle button with indicator"
```

---

### Task 17: Export useLiveMode from hooks index

**Files:**
- Modify: `src/hooks/index.ts`

**Step 1: Add export**

```typescript
export { useLiveMode } from './useLiveMode';
```

**Step 2: Commit**

```bash
git add src/hooks/index.ts
git commit -m "chore: export useLiveMode hook"
```

---

## Phase 8: Integration Testing

### Task 18: Manual Integration Test

**Step 1: Start the backend**

Run: `cd backend && python server.py`
Expected: Server starts, shows `/live/stream` endpoint available

**Step 2: Start the frontend**

Run: `npm run dev`
Expected: Electron app launches

**Step 3: Test live mode toggle**

1. Navigate to Assistant page
2. Click the live mode toggle button (or press Ctrl+Shift+L)
3. Verify "Listening" indicator appears
4. Verify backend logs show WebSocket connection

**Step 4: Test stopping live mode**

1. Click toggle again (or press Ctrl+Shift+L)
2. Verify indicator disappears
3. Verify backend logs show session ended

**Step 5: Document any issues found**

Create issues or fix immediately as needed.

---

## Phase 9: Full Audio Capture Implementation (Future)

### Task 19: Implement Full WASAPI Audio Capture

**Note:** This task requires deeper investigation into audify's WASAPI loopback support. The current implementation uses a placeholder.

**Files:**
- Modify: `electron/audio-capture.ts`

**Research needed:**
1. Test audify's actual API for WASAPI loopback
2. Determine device enumeration approach
3. Implement proper audio mixing
4. Handle sample rate conversion if needed

This task should be done after confirming the pipeline works with placeholder audio.

---

## Summary

**Files Created:**
- `backend/live_session.py` - Live API session management
- `electron/audio-capture.ts` - Audio capture module
- `src/hooks/useLiveMode.ts` - React hook for live mode

**Files Modified:**
- `backend/prompts.py` - Added `get_live_system_prompt()`
- `backend/server.py` - Added `/live/stream` WebSocket endpoint
- `electron/ipc.handlers.ts` - Added live session IPC handlers
- `electron/preload.ts` - Exposed live API to renderer
- `electron/shortcuts.ts` - Added Ctrl+Shift+L shortcut
- `src/electron.d.ts` - Added live mode types
- `src/pages/AssistantPage.tsx` - Integrated live mode
- `src/components/Commands/AssistantCommands.tsx` - Added toggle button
- `src/hooks/index.ts` - Export useLiveMode

**Dependencies Added:**
- `audify` - Windows audio capture
- `ws` + `@types/ws` - WebSocket client (if not present)
