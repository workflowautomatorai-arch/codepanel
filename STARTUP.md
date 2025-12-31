# CodePanel - Quick Start Guide

## Prerequisites
- Node.js 22+ installed
- Python 3.x installed
- API keys configured in `backend/.env`

## Starting the App

### Option 1: Use the start script (Recommended)
```bash
# From the project root
.\start.bat
```

This will:
1. Set up the Python venv if needed
2. Install npm dependencies if needed
3. Start the Electron app with auto-managed backend

### Option 2: Direct npm command
```bash
npm run dev
```

The Electron app automatically spawns and manages the Python backend - no separate windows needed.

### Option 3: Manual start (for debugging)

**Terminal 1 - Backend only:**
```bash
cd backend
.\venv\Scripts\activate
python server.py
```

**Terminal 2 - Frontend only:**
```bash
npm run dev
```

## Stopping the App

### Option 1: Close the Electron window
The Python backend is automatically stopped when you close the app.

### Option 2: Use the stop script (force cleanup)
```bash
.\stop.bat
```

### Option 3: Manual stop
- Press `Ctrl+C` in the terminal running `npm run dev`

## How Backend Management Works

The Electron app includes a `BackendManager` that:
- Spawns the Python backend as a child process on startup
- Polls `/health` endpoint until backend is ready
- Automatically kills the backend on app exit
- Shows error dialogs if Python isn't found or port is in use
- Attempts one restart if the backend crashes

## Context Files

Add your personal context for AI responses:
- Location: `backend/context/`
- Formats: `.txt` or `.md` files
- Example: `about_me.txt` for behavioral interview prep

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:3000` | Backend API (auto-managed) |
| `http://localhost:54321` | Frontend dev server |
| `http://localhost:3000/health` | Health check |

## Troubleshooting

### "Python not found" error
Ensure Python 3.x is installed and in your PATH:
```bash
python --version
```

### "Port 3000 in use" error
Another process is using port 3000. Run `stop.bat` or manually kill:
```bash
netstat -ano | findstr :3000
taskkill /PID <pid> /F
```

### Backend not starting
Check the Electron console for errors. You can also run the backend manually:
```bash
cd backend
.\venv\Scripts\activate
python server.py
```

## Production Build

```bash
npm run build
```

The production build bundles the backend folder (excluding venv) into `resources/backend`. Users need Python installed system-wide with dependencies:
```bash
pip install -r backend/requirements.txt
```
