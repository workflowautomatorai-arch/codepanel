# CodePanel - Quick Start Guide

## Prerequisites
- Node.js installed
- Python 3.x installed
- API keys configured in `backend/.env`

## Starting the App

### Option 1: Use the start script
```bash
# From the project root
.\start.bat
```

### Option 2: Manual start (2 terminals)

**Terminal 1 - Backend:**
```bash
cd backend
.\venv\Scripts\activate
python server.py
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

## Stopping the App

### Option 1: Use the stop script
```bash
.\stop.bat
```

### Option 2: Manual stop
- Press `Ctrl+C` in each terminal
- Or close the terminal windows

## Context Files

Add your personal context for AI responses:
- Location: `backend/context/`
- Formats: `.txt` or `.md` files
- Example: `about_me.txt` for behavioral interview prep

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `http://localhost:3000` | Backend API |
| `http://localhost:54321` | Frontend dev server |
| `http://localhost:3000/health` | Health check |

## Switching AI Provider

```bash
# Check current provider
curl http://localhost:3000/provider

# Switch to Claude
curl -X POST http://localhost:3000/provider -H "Content-Type: application/json" -d "{\"provider\":\"claude\"}"

# Switch to Gemini
curl -X POST http://localhost:3000/provider -H "Content-Type: application/json" -d "{\"provider\":\"gemini\"}"
```
