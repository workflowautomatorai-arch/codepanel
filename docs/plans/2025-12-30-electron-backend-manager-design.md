# Electron Backend Manager Design

## Overview

Replace the current two-window startup approach (start.bat) with Electron automatically spawning and managing the Python backend as a child process.

**Goal**: Single command (`npm run dev`) starts everything. Backend lifecycle managed automatically.

## Architecture

```
App Start → BackendManager.start() → Spawn Python → Health poll → Show window
App Quit  → BackendManager.stop() → Kill Python → Exit
```

### Components

1. **`electron/backend-manager.ts`** - New module managing Python process lifecycle
2. **`electron/main.ts`** - Integration points for startup/shutdown
3. **`package.json`** - Bundle backend as extraResources for production

## BackendManager Implementation

### Class Structure

```typescript
class BackendManager {
  private process: ChildProcess | null
  private isReady: boolean

  start(): Promise<void>   // Spawn Python, wait for health
  stop(): Promise<void>    // Kill process gracefully
  isHealthy(): boolean     // Check current status
}
```

### Python Discovery

| Mode | Python Path | Backend Dir |
|------|-------------|-------------|
| Development | `backend/venv/Scripts/python.exe` (Win) or `backend/venv/bin/python` (Unix) | `./backend` |
| Production | System Python | `resources/backend` |

### Health Check

- Poll `http://localhost:3000/health` every 500ms
- Success: `status: "OK"` → backend ready
- Connection refused → retry (backend still starting)
- Timeout after 30s → reject with error

### Graceful Shutdown

- Windows: `taskkill /pid /T` (tree kill for uvicorn workers)
- Unix: `SIGTERM`, then `SIGKILL` after 5s timeout

## main.ts Integration

### Startup Sequence

```typescript
async function initializeApp() {
  loadEnvVariables();

  // Start backend first
  await backendManager.start();

  // Existing initialization
  initializeHelpers();
  initializeIpcHandlers(...);
  await createWindow();
}
```

### Shutdown Hook

```typescript
app.on('before-quit', async () => {
  await backendManager.stop();
});
```

## Bundling (package.json)

```json
"extraResources": [
  { "from": ".env", "to": ".env" },
  { "from": "backend", "to": "backend", "filter": ["**/*", "!venv/**", "!__pycache__/**"] }
]
```

Production expects system Python with dependencies installed.

## Error Handling

| Error | Response |
|-------|----------|
| Python not found | Dialog: "Python not installed. Please install Python 3.x" |
| Port 3000 in use | Dialog: "Port 3000 is in use. Close other applications." |
| Backend crash | Attempt restart once, then show error dialog |
| Health timeout | Dialog: "Backend failed to start. Check logs." |

## Dev Experience Change

```
Before: start.bat → 2 windows → manage manually
After:  npm run dev → Electron spawns backend automatically
```

The `start.bat` and `stop.bat` become optional convenience scripts.

## Implementation Tasks

1. Create `electron/backend-manager.ts` with BackendManager class
2. Add Python path discovery logic (dev vs prod, Windows vs Unix)
3. Implement health check polling with timeout
4. Implement graceful shutdown with platform-specific kill
5. Integrate into `main.ts` initializeApp()
6. Add before-quit hook for cleanup
7. Update package.json extraResources for production bundling
8. Add error dialogs for failure cases
9. Test on Windows (primary platform based on codebase)
