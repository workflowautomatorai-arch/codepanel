# Context Files Directory

This directory contains personal context files that the AI assistant can access to provide personalized responses.

## How It Works

1. **Drop files here** - Add `.txt` or `.md` files to this directory
2. **AI discovers them** - The assistant can list available files using `list_context_files`
3. **AI reads when needed** - Based on your query, the AI decides which files to read
4. **No code changes needed** - Adding new files is automatic

## File Format

### Recommended: Self-Describing Files (YAML Header)

Add a YAML front matter header to help the AI understand when to use each file:

```markdown
---
description: Short description of what this file contains
use_when: When the AI should use this file (e.g., "behavioral interviews, tell me about yourself")
type: personal_background
---

# Your Content Here

The actual content of your file goes below the header.
```

### Fallback: Plain Files

Files without a YAML header will still work. The AI will use the first line as the description.

## Available Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | No | Brief description of the file contents (shown to AI) |
| `use_when` | No | Hints for when the AI should use this file |
| `type` | No | Category: `personal_background`, `reference`, `notes`, etc. |

## Example Files

### about_me.txt
```markdown
---
description: Professional background, skills, and work history
use_when: behavioral interviews, tell me about yourself, describe your experience
type: personal_background
---

# Professional Summary

Senior DevOps Engineer with 10+ years experience...
```

### current_projects.txt
```markdown
---
description: Active projects and current priorities
use_when: status updates, what are you working on, project questions
type: reference
---

# Current Projects

## Project A - Kubernetes Migration
Status: In Progress
...
```

### writing_style.txt
```markdown
---
description: Communication preferences and writing style
use_when: drafting emails, writing documents, communication style
type: reference
---

# Writing Style

- Prefer concise, direct communication
- Use bullet points for clarity
...
```

## Security Notes

- Files are only accessible from this directory (no path traversal)
- Only `.txt` and `.md` files are scanned
- File contents are only read when the AI explicitly requests them
- The AI decides which files are relevant based on your query

## Tips

1. **Be specific in descriptions** - Help the AI understand when to use each file
2. **Keep files focused** - One topic per file works better than one large file
3. **Update regularly** - Keep your context current for accurate responses
4. **Use STAR format** - For interview prep, include Situation-Task-Action-Result examples
