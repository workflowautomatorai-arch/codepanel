# CodePanel

A desktop overlay application for code assistance, built with Electron and React.

## Features

- Screenshot capture and AI-powered analysis
- Multi-language coding solutions (Python, JavaScript, Java, C++, Go, Swift, Kotlin, Ruby, SQL, R, PHP)
- Debug mode for solution improvement
- Always-on-top transparent window
- Global keyboard shortcuts
- Cross-platform support (Windows, macOS, Linux)
- Self-hosted backend with Claude API

## Quick Start

### Prerequisites

- Node.js v22+
- Python 3.8+ (for backend)
- Anthropic API key

### Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment (`.env` already created):
```bash
VITE_SELF_HOSTED_MODE=true
VITE_API_BASE_URL=http://localhost:3000
IS_MOCK=false
```

3. Install backend dependencies:
```bash
cd backend
pip install -r requirements.txt
```

4. Set your API key and run the backend:
```powershell
# Windows PowerShell
$env:ANTHROPIC_API_KEY="sk-ant-your-key-here"
python server.py
```

5. In a new terminal, run the app:
```bash
npm run dev
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + B` | Hide/Show Window |
| `Ctrl/Cmd + H` | Take Screenshot |
| `Ctrl/Cmd + Arrow Keys` | Move Window |
| `Ctrl/Cmd + Return` | Generate Solution |
| `Ctrl/Cmd + G` | Reset Context |

## Architecture

- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Desktop**: Electron 37
- **Backend**: FastAPI + Claude API
- **Build**: Vite

## Building

```bash
npm run build
```

Custom product name:
```powershell
$env:PRODUCT_NAME="My Assistant"; npm run build
```

## License

MIT License
