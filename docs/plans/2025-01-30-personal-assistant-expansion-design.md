# CodePanel Personal Assistant Expansion - Design Document

**Date:** 2025-01-30
**Status:** Approved
**Author:** Brainstorming session with Claude

---

## Executive Summary

Transform CodePanel from an interview-focused tool into a personal knowledge assistant with:
- Modular personal context system
- Real-time web search and URL analysis
- Stateful multi-turn conversations
- Future-ready architecture for MCP integration

---

## Goals & Non-Goals

### Goals
- Expand context system to be modular and self-describing
- Integrate Gemini's built-in tools (google_search, url_context)
- Add unified `/assistant/query` endpoint
- Enable stateful conversations via Interactions API
- Design for future MCP integration without throwaway work

### Non-Goals (For Now)
- Frontend redesign (defer to Phase 2)
- Document search in OneDrive/Google Drive (defer to MCP phase)
- Vector database / semantic search (YAGNI)
- Breaking changes to existing endpoints

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Frontend                         │
│            (existing - minimal changes for now)              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Gemini Interactions API                 │    │
│  │                                                      │    │
│  │  Built-in Tools:        Custom Tools:                │    │
│  │  • google_search        • list_context_files         │    │
│  │  • url_context          • read_context_file          │    │
│  │  • code_execution       • (future: MCP tools)        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │  context/        │    │  Future: MCP Servers         │   │
│  │  ├─ README.md    │    │  • OneDrive                  │   │
│  │  ├─ about_me.txt │    │  • Google Drive              │   │
│  │  └─ (modular)    │    │  • Notion, etc.              │   │
│  └──────────────────┘    └──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tool Registry Design

### Custom Tools (Implement in backend)

| Tool | Purpose | Parameters |
|------|---------|------------|
| `list_context_files` | Discover available context files | None |
| `read_context_file` | Load specific context file | `filename: str` |

### Built-in Tools (Gemini provides)

| Tool | Purpose | How to Enable |
|------|---------|---------------|
| `google_search` | Real-time web search with grounding | `{"type": "google_search"}` |
| `url_context` | Fetch and analyze any URL | `{"type": "url_context"}` |
| `code_execution` | Run Python for calculations | `{"type": "code_execution"}` |

### Tool Selection Logic

The AI receives ALL tools and decides which to use based on query:

```
Query: "What's new in Kubernetes and how does it affect my background?"

AI reasoning:
1. Need current K8s news → google_search
2. Need user's background → list_context_files → read_context_file
3. Synthesize response combining both
```

---

## Enhanced Context System

### Design Principles
- **No code changes to add files** - Drop file in directory, done
- **Self-describing files** - Header tells AI when to use it
- **Runtime discovery** - `list_context_files` scans directory dynamically

### Context File Format

```markdown
---
description: Professional background, skills, and work history
use_when: introductions, behavioral interviews, "tell me about yourself"
---

# About Me

Arie Shifrin - Senior DevOps/Cloud Engineer with 10+ years...
```

### Tool Implementation

```python
def list_context_files() -> list[dict]:
    """
    Scans context/ directory and returns metadata for each file.
    AI calls this first to discover what's available.
    """
    context_dir = Path("backend/context")
    files = []

    for file in context_dir.glob("*"):
        if file.name == "README.md":
            continue
        if file.suffix in [".txt", ".md"]:
            content = file.read_text(encoding="utf-8")
            metadata = parse_yaml_header(content)

            files.append({
                "filename": file.name,
                "description": metadata.get("description", "No description"),
                "use_when": metadata.get("use_when", ""),
                "last_modified": datetime.fromtimestamp(file.stat().st_mtime).isoformat()
            })

    return files


def read_context_file(filename: str) -> str:
    """
    Reads specified context file with security validation.
    """
    # Security: validate filename (no path traversal)
    if "/" in filename or "\\" in filename or ".." in filename:
        raise ValueError("Invalid filename")

    context_dir = Path("backend/context")
    file_path = context_dir / filename

    if not file_path.exists():
        raise FileNotFoundError(f"Context file not found: {filename}")

    return file_path.read_text(encoding="utf-8")
```

### Tool Registration

```python
context_tools = [
    {
        "type": "function",
        "name": "list_context_files",
        "description": "List available personal context files. Call this first to discover what context is available about the user.",
        "parameters": {"type": "object", "properties": {}}
    },
    {
        "type": "function",
        "name": "read_context_file",
        "description": "Read a specific context file to get personal information about the user. Use after list_context_files to load relevant context.",
        "parameters": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Name of the context file to read (e.g., 'about_me.txt')"
                }
            },
            "required": ["filename"]
        }
    }
]
```

---

## API Endpoint Design

### New Unified Endpoint

```
POST /assistant/query
```

Keep existing endpoints working (no breaking changes).

### Request Model

```python
class AssistantQueryRequest(BaseModel):
    text: str = ""                           # Text query
    images: list[str] = []                   # Base64 encoded images
    audio: str = None                        # Base64 encoded audio (webm)
    previous_interaction_id: str = None      # For conversation continuity
    enable_web_search: bool = True           # Toggle google_search tool
    enable_url_context: bool = True          # Toggle url_context tool
    enable_personal_context: bool = True     # Toggle context/ tools
```

### Response Model

```python
class AssistantQueryResponse(BaseModel):
    response: str                            # Main response (markdown formatted)
    interaction_id: str                      # For follow-up requests
    sources: list[str] = []                  # URLs if web search was used
    context_files_used: list[str] = []       # Which context files were read
```

### Endpoint Implementation

```python
@app.post("/assistant/query")
async def assistant_query(request: AssistantQueryRequest):
    # 1. Build tools list based on toggles
    tools = []
    if request.enable_personal_context:
        tools.extend(context_tools)
    if request.enable_web_search:
        tools.append({"type": "google_search"})
    if request.enable_url_context:
        tools.append({"type": "url_context"})

    # 2. Build input content (text, images, audio)
    content = build_assistant_content(request)

    # 3. Call Interactions API
    interaction = client.interactions.create(
        model="gemini-3-flash-preview",
        input=content,
        tools=tools,
        previous_interaction_id=request.previous_interaction_id,
    )

    # 4. Handle function calls (context file reading)
    context_files_used = []
    while has_function_calls(interaction):
        interaction, files_used = handle_function_calls(interaction)
        context_files_used.extend(files_used)

    # 5. Return structured response
    return AssistantQueryResponse(
        response=extract_text(interaction),
        interaction_id=interaction.id,
        sources=extract_sources(interaction),
        context_files_used=context_files_used,
    )
```

---

## Stateful Conversations

### How It Works

Use `previous_interaction_id` to chain conversations:

```
Request 1: "What's my background in Kubernetes?"
  └─ AI reads context, responds
  └─ Returns interaction_id: "abc123"

Request 2: "How does that compare to current market demands?"
  └─ Sends previous_interaction_id: "abc123"
  └─ AI remembers context, uses google_search
  └─ Returns interaction_id: "def456"

Request 3: "Draft a summary for my resume"
  └─ Sends previous_interaction_id: "def456"
  └─ AI has full conversation context
```

### Storage

- Google stores interactions (55 days paid tier, 1 day free)
- Set `store=False` in API call to opt out
- Conversation chains require `store=True` (default)

---

## Implementation Phases

### Phase 1: Backend Foundation (Priority)

| Task | Files | Description |
|------|-------|-------------|
| Enhanced context tools | `prompts.py` | Add `list_context_files`, update tool definitions |
| Context README | `context/README.md` | Document file format |
| Update about_me.txt | `context/about_me.txt` | Add self-describing header |
| Built-in tools | `server.py` | Add google_search, url_context to existing endpoints |
| New endpoint | `server.py` | Add `/assistant/query` |
| Function call handling | `server.py` | Handle tool calls in conversation loop |

**Files to modify:**
```
backend/
├── server.py              # Add endpoint, tool handling
├── prompts.py             # Add list_context_files, tool definitions
├── context/
│   ├── README.md          # NEW: Documentation
│   └── about_me.txt       # UPDATE: Add header
```

### Phase 2: Frontend Integration (Later)

| Task | Description |
|------|-------------|
| Conversation history UI | Show past interactions in session |
| Unified assistant mode | New mode using `/assistant/query` |
| Capability toggles | Web search, URL context, personal context switches |
| Background task indicator | "Thinking..." for longer operations |

### Phase 3: MCP & Document Search (Future)

| Task | Description |
|------|-------------|
| Evaluate MCP support | Wait for Gemini 3 MCP or test with 2.5 |
| Cloud storage MCP | OneDrive/Google Drive integration |
| Document search | Via MCP servers, not custom code |

---

## Security Considerations

### Context Directory
- Full read access (user-curated files)
- Filename validation (no path traversal)
- File size limits recommended

### Documents (Future MCP)
- Read-only access
- Path validation
- Sandboxed via MCP server

### Web Access
- Only via built-in tools (sandboxed by Google)
- No arbitrary HTTP requests from backend

---

## Testing Strategy

### Phase 1 Tests

1. **Context tools:**
   - `list_context_files` returns correct metadata
   - `read_context_file` validates filenames
   - New files auto-discovered without code changes

2. **Built-in tools:**
   - `google_search` returns grounded results
   - `url_context` fetches and summarizes URLs

3. **Endpoint:**
   - `/assistant/query` handles text, images, audio
   - Conversation continuity works across requests
   - Tool toggles enable/disable correctly

### Manual Testing

```bash
# Test context listing
curl -X POST http://localhost:3000/assistant/query \
  -H "Content-Type: application/json" \
  -d '{"text": "What context files do you have about me?"}'

# Test web search
curl -X POST http://localhost:3000/assistant/query \
  -H "Content-Type: application/json" \
  -d '{"text": "What are the latest Kubernetes features in 2025?"}'

# Test combined
curl -X POST http://localhost:3000/assistant/query \
  -H "Content-Type: application/json" \
  -d '{"text": "Based on my background, what K8s certifications should I pursue?"}'
```

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Build document search now or wait for MCP? | **Wait for MCP** - avoid throwaway code |
| Keep separate modes or unified interface? | **Unified long-term**, backend-first for now |
| Pre-index documents or on-demand search? | **Defer** - MCP will handle this |

---

## References

- [Gemini Interactions API Docs](backend/interactionsapi.md)
- [MCP Specification](https://modelcontextprotocol.io/docs)
- Existing implementation: `backend/server.py`, `backend/prompts.py`

---

## Next Steps

1. Review and approve this design document
2. Create `context/README.md` with file format documentation
3. Update `context/about_me.txt` with self-describing header
4. Implement `list_context_files` tool in `prompts.py`
5. Add built-in tools to existing endpoints in `server.py`
6. Implement `/assistant/query` endpoint
7. Test end-to-end with sample queries
