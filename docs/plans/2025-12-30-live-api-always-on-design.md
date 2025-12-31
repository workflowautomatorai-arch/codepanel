# Live API "Always-On" Listener Design

## Overview

Add a real-time listening mode to CodePanel that uses Google's Live API to provide proactive assistance during meetings and interviews. The AI listens to conversations and provides relevant information when needed, displayed as text in the existing chat UI.

**Use Cases:**
- Meeting assistant - surfaces answers when you're asked questions
- Interview helper - provides real-time assistance during interviews

**Key Differentiator from Existing Assistant:**
| Feature | Interactions API (current) | Live API (new) |
|---------|---------------------------|----------------|
| Model | `gemini-3-flash-preview` | `gemini-2.5-flash-native-audio-preview` |
| Connection | HTTP/SSE request-response | WebSocket bidirectional |
| Audio | Upload recorded clips | Continuous streaming |
| Response trigger | User sends message | AI decides proactively |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ELECTRON APP                                 │
│  ┌─────────────────┐     ┌─────────────────┐     ┌───────────────┐ │
│  │  AssistantPage  │     │  AudioCapture   │     │   IPC Bridge  │ │
│  │  + LiveToggle   │     │  (System+Mic)   │     │               │ │
│  └────────┬────────┘     └────────┬────────┘     └───────┬───────┘ │
│           │                       │                       │         │
└───────────┼───────────────────────┼───────────────────────┼─────────┘
            │                       │                       │
            ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       PYTHON BACKEND                                 │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    LiveSessionManager                           ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ ││
│  │  │ WebSocket   │  │ Audio Queue │  │ Session State           │ ││
│  │  │ to Live API │  │ (incoming)  │  │ (compression, resume)   │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐                        │
│  │ AssistantService │  │ Existing prompts │  ← Reused for both     │
│  │ (Interactions)   │  │ & tools          │    modes               │
│  └──────────────────┘  └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GOOGLE LIVE API                                   │
│  Model: gemini-2.5-flash-native-audio-preview                       │
│  Features: proactive_audio, context_window_compression              │
└─────────────────────────────────────────────────────────────────────┘
```

## Audio Capture (Windows Only)

**Two audio sources combined into one stream:**

| Source | Method | Purpose |
|--------|--------|---------|
| System Audio | WASAPI Loopback | Hear meeting participants |
| Microphone | Standard capture | Hear user (full context) |

**Audio format for Live API:**
- 16-bit PCM, 16kHz mono
- Chunks sent every ~100ms (1600 samples per chunk)

**Recommended library:** `audify` (WASAPI loopback support, actively maintained)

### New File: `electron/audio-capture.ts`

```typescript
import Audify from 'audify';

interface AudioCaptureConfig {
  sampleRate: number;      // 16000 for Live API
  channels: number;        // 1 (mono)
  bitsPerSample: number;   // 16
  chunkMs: number;         // 100ms chunks
}

const DEFAULT_CONFIG: AudioCaptureConfig = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16,
  chunkMs: 100,
};

export class AudioCapture {
  private config: AudioCaptureConfig;
  private systemCapture: Audify.RtAudio | null = null;
  private micCapture: Audify.RtAudio | null = null;
  private mixBuffer: Int16Array;
  private onDataCallback: ((data: Buffer) => void) | null = null;
  private isRunning = false;

  constructor(config: Partial<AudioCaptureConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    const samplesPerChunk = (this.config.sampleRate * this.config.chunkMs) / 1000;
    this.mixBuffer = new Int16Array(samplesPerChunk);
  }

  onAudioData(callback: (data: Buffer) => void) {
    this.onDataCallback = callback;
  }

  async start(): Promise<void> {
    // Initialize WASAPI loopback for system audio
    // Initialize default mic for user audio
    // Mix both streams and forward via callback
  }

  stop(): void {
    this.isRunning = false;
    // Clean up captures
  }
}
```

## Python Backend

### New File: `backend/live_session.py`

```python
class LiveSessionManager:
    """Manages persistent connection to Gemini Live API"""

    def __init__(self, client):
        self.client = client
        self.session = None
        self.is_active = False
        self.resume_handle = None

    async def start_session(self, system_prompt: str):
        """Start a new Live API session with proactive audio"""
        config = {
            "response_modalities": ["TEXT"],
            "proactivity": {"proactive_audio": True},
            "context_window_compression": {"sliding_window": {}},
            "session_resumption": {"handle": self.resume_handle},
            "system_instruction": system_prompt,
        }
        self.session = await self.client.aio.live.connect(
            model="gemini-2.5-flash-native-audio-preview-12-2025",
            config=config
        )
        self.is_active = True

    async def send_audio(self, pcm_data: bytes):
        """Forward audio chunk to Live API"""
        await self.session.send_realtime_input(
            audio={"data": pcm_data, "mime_type": "audio/pcm;rate=16000"}
        )

    async def send_text(self, text: str):
        """Send text message to Live API session (for follow-up questions)"""
        await self.session.send_client_content(
            turns={"role": "user", "parts": [{"text": text}]},
            turn_complete=True
        )

    async def receive_responses(self) -> AsyncIterator[str]:
        """Yield text responses as they arrive"""
        async for response in self.session.receive():
            if response.session_resumption_update:
                if response.session_resumption_update.new_handle:
                    self.resume_handle = response.session_resumption_update.new_handle

            if response.server_content and response.server_content.model_turn:
                for part in response.server_content.model_turn.parts:
                    if hasattr(part, 'text') and part.text:
                        yield part.text

    async def stop_session(self):
        self.is_active = False
        if self.session:
            self.session.close()
```

### WebSocket Endpoint in `backend/server.py`

```python
@app.websocket("/live/stream")
async def live_audio_stream(websocket: WebSocket):
    """
    Bidirectional WebSocket for live audio streaming.

    Client sends: binary PCM audio chunks OR JSON {"type": "text", "content": "..."}
    Server sends: JSON messages with text responses
    """
    await websocket.accept()
    session_id = str(uuid.uuid4())

    client = get_client()
    manager = LiveSessionManager(client)

    try:
        system_prompt = get_live_system_prompt()
        await manager.start_session(system_prompt)
        await websocket.send_json({"type": "ready", "session_id": session_id})

        async with asyncio.TaskGroup() as tg:
            tg.create_task(handle_incoming(websocket, manager))
            tg.create_task(handle_outgoing(websocket, manager))

    except WebSocketDisconnect:
        pass
    finally:
        await manager.stop_session()
```

**Message Protocol:**

| Direction | Type | Format |
|-----------|------|--------|
| Client → Server | Audio | Binary PCM bytes |
| Client → Server | Text | `{"type": "text", "content": "..."}` |
| Server → Client | Ready | `{"type": "ready", "session_id": "..."}` |
| Server → Client | Response | `{"type": "response", "content": "..."}` |
| Server → Client | Error | `{"type": "error", "content": "..."}` |

## System Prompt for Live Mode

Addition to `backend/prompts.py`:

```python
def get_live_system_prompt() -> str:
    files_info = get_system_prompt_with_files()

    return f"""You are a real-time meeting and interview assistant listening to a conversation.

## YOUR ROLE
You hear both the user and other participants. Help the user by providing relevant information ONLY when needed.

## WHEN TO RESPOND
Respond when:
- Someone asks the user a direct question
- A behavioral interview question is asked ("Tell me about a time...")
- The user is asked about their experience, background, or skills
- Technical questions are directed at the user
- Someone asks for specific facts the user might not remember

## WHEN TO STAY SILENT
Do NOT respond when:
- General conversation not directed at the user
- The user is handling the question well on their own
- Small talk or pleasantries
- Questions directed at other participants

## RESPONSE STYLE
- Be concise - user needs to read quickly while in conversation
- Lead with the key point or answer
- Use bullet points for multiple items
- For behavioral questions, suggest STAR format points

## CONTEXT AVAILABLE
{files_info}

Use context files for behavioral/background questions about the user's experience."""
```

## Electron IPC Bridge

Updates to `electron/ipc.handlers.ts`:

```typescript
let liveSocket: WebSocket | null = null;
let audioCapture: AudioCapture | null = null;

ipcMain.handle('start-live-session', async () => {
  try {
    liveSocket = new WebSocket('ws://localhost:3000/live/stream');
    await waitForOpen(liveSocket);

    const ready = await waitForMessage(liveSocket, 'ready');

    audioCapture = new AudioCapture();
    audioCapture.onAudioData((pcmData: Buffer) => {
      if (liveSocket?.readyState === WebSocket.OPEN) {
        liveSocket.send(pcmData);
      }
    });
    await audioCapture.start();

    liveSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'response') {
        mainWindow?.webContents.send('live-response', data);
      }
    };

    return { success: true, sessionId: ready.session_id };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-live-session', async () => {
  audioCapture?.stop();
  liveSocket?.close();
  return { success: true };
});

ipcMain.handle('send-live-text', async (_, text: string) => {
  if (liveSocket?.readyState === WebSocket.OPEN) {
    liveSocket.send(JSON.stringify({ type: 'text', content: text }));
    return { success: true };
  }
  return { success: false, error: 'Live session not active' };
});
```

## Frontend Changes

### Toggle Button in AssistantCommands

```tsx
<CommandButton
  onClick={toggleLiveMode}
  disabled={isConnecting}
  variant={isLiveMode ? "destructive" : "default"}
  title={isLiveMode ? "Stop listening (Ctrl+Shift+L)" : "Start listening (Ctrl+Shift+L)"}
>
  {isConnecting ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : isLiveMode ? (
    <MicOff className="h-4 w-4" />
  ) : (
    <Radio className="h-4 w-4" />
  )}
</CommandButton>
```

### Visual Indicator

```tsx
{isLiveMode && (
  <div className="flex items-center gap-2 text-xs text-red-500">
    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
    Listening
  </div>
)}
```

### Keyboard Shortcut

In `electron/shortcuts.ts`:
```typescript
globalShortcut.register('CommandOrControl+Shift+L', () => {
  mainWindow?.webContents.send('toggle-live-mode');
});
```

### Hybrid Input (Audio + Text)

While live mode is active, user can still type in ChatInput. Text goes through same Live session:

```typescript
const sendMessage = async (text: string) => {
  addMessage({ role: 'user', content: text, ... });

  if (isLiveMode) {
    await window.electronAPI.sendLiveText(text);
  } else {
    await window.electronAPI.queryAssistant({ text });
  }
};
```

## Implementation Tasks

1. **Audio Capture**
   - [ ] Add `audify` dependency (or alternative WASAPI library)
   - [ ] Create `electron/audio-capture.ts` with system + mic mixing
   - [ ] Test WASAPI loopback on Windows

2. **Python Backend**
   - [ ] Create `backend/live_session.py` with LiveSessionManager
   - [ ] Add WebSocket endpoint `/live/stream` to server.py
   - [ ] Add `get_live_system_prompt()` to prompts.py
   - [ ] Handle text input alongside audio in WebSocket

3. **Electron IPC**
   - [ ] Add live session IPC handlers (start, stop, send-text)
   - [ ] Add preload API methods
   - [ ] Update TypeScript types in electron.d.ts

4. **Frontend**
   - [ ] Add live mode state to AssistantPage
   - [ ] Add toggle button to AssistantCommands
   - [ ] Add visual "Listening" indicator
   - [ ] Handle live responses in chat
   - [ ] Modify ChatInput to route through live session when active

5. **Keyboard Shortcut**
   - [ ] Register Ctrl+Shift+L in shortcuts.ts
   - [ ] Handle toggle event in renderer

6. **Testing**
   - [ ] Test audio capture with various Windows audio setups
   - [ ] Test session duration with compression
   - [ ] Test session resumption on disconnect
   - [ ] Test hybrid text + audio input
