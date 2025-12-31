"""
Centralized prompt management for CodePanel
Handles different use cases with appropriate context
Supports agentic context fetching via function calling
"""

import re
from enum import Enum
from typing import Optional, List, Dict, Any
from pathlib import Path

# Context directory
CONTEXT_DIR = Path(__file__).parent / "context"


# =============================================================================
# YAML HEADER PARSING
# =============================================================================

def parse_yaml_header(content: str) -> Dict[str, str]:
    """
    Parse YAML front matter from a context file.

    Expected format:
    ---
    description: Short description of the file
    use_when: When the AI should use this file
    ---

    Returns dict with parsed values or empty dict if no header.
    """
    if not content.startswith('---'):
        return {}

    # Find the closing ---
    end_match = re.search(r'\n---\s*\n', content[3:])
    if not end_match:
        return {}

    header_content = content[3:end_match.start() + 3]
    result = {}

    for line in header_content.split('\n'):
        line = line.strip()
        if ':' in line:
            key, value = line.split(':', 1)
            result[key.strip()] = value.strip()

    return result


def get_content_without_header(content: str) -> str:
    """Remove YAML header from content if present"""
    if not content.startswith('---'):
        return content

    end_match = re.search(r'\n---\s*\n', content[3:])
    if not end_match:
        return content

    return content[end_match.end() + 3:].strip()


# =============================================================================
# AGENTIC CONTEXT SYSTEM
# =============================================================================

def get_available_context_files() -> List[Dict[str, str]]:
    """
    Get list of available context files with descriptions.
    Returns metadata only - not the actual content.
    Supports YAML front matter for self-describing files.
    """
    if not CONTEXT_DIR.exists():
        CONTEXT_DIR.mkdir(exist_ok=True)
        return []

    files = []
    for file in list(CONTEXT_DIR.glob("*.txt")) + list(CONTEXT_DIR.glob("*.md")):
        # Skip README
        if file.name.lower() == "readme.md":
            continue

        try:
            content = file.read_text(encoding="utf-8")

            # Try to parse YAML header first
            header = parse_yaml_header(content)

            if header:
                description = header.get("description", "No description")
                use_when = header.get("use_when", "")
                file_type = header.get("type", "personal_background" if "about" in file.name.lower() else "reference")
            else:
                # Fallback: use first non-empty line as description
                lines = [l.strip() for l in content.split('\n') if l.strip()]
                description = lines[0][:100] if lines else "No description"
                description = description.lstrip('#').strip()
                use_when = ""
                file_type = "personal_background" if "about" in file.name.lower() else "reference"

            files.append({
                "filename": file.name,
                "description": description,
                "use_when": use_when,
                "type": file_type
            })
        except Exception as e:
            print(f"Error reading {file}: {e}")

    return files


def list_context_files() -> str:
    """
    List available context files in a format the AI can understand.
    This is the function called by the AI tool.

    Returns:
        Formatted string listing all available context files
    """
    files = get_available_context_files()

    if not files:
        return "No context files available."

    result = "Available context files:\n\n"
    for f in files:
        result += f"- **{f['filename']}**\n"
        result += f"  Description: {f['description']}\n"
        if f.get('use_when'):
            result += f"  Use when: {f['use_when']}\n"
        result += f"  Type: {f['type']}\n\n"

    return result


def read_context_file(filename: str) -> str:
    """
    Read a specific context file by name.
    This is the function the AI can call.
    """
    # Sanitize filename - reject any path separators or traversal attempts
    if '/' in filename or '\\' in filename or '..' in filename:
        return "Invalid filename: path separators not allowed"

    # Only allow alphanumeric, underscore, hyphen, and dot
    if not re.match(r'^[\w\-\.]+$', filename):
        return "Invalid filename: contains invalid characters"

    file_path = CONTEXT_DIR / filename

    # Ensure the resolved path is within CONTEXT_DIR
    try:
        resolved_path = file_path.resolve()
        resolved_context = CONTEXT_DIR.resolve()
        if not resolved_path.is_relative_to(resolved_context):
            return "Access denied: file outside context directory"
    except (ValueError, OSError):
        return "Invalid file path"

    if not file_path.exists():
        return f"File '{filename}' not found in context directory"

    try:
        return file_path.read_text(encoding="utf-8")
    except Exception:
        return "Error reading file"




class QueryType(Enum):
    CODE_ANALYSIS = "code_analysis"      # Analyzing/debugging code
    CODE_GENERATION = "code_generation"  # Writing new code
    BEHAVIORAL = "behavioral"            # Interview behavioral questions
    SYSTEM_DESIGN = "system_design"      # Architecture/design questions
    GENERAL = "general"                  # General questions/conversation


# Keywords that suggest behavioral/interview questions
BEHAVIORAL_KEYWORDS = [
    "tell me about a time",
    "describe a situation",
    "give me an example",
    "how do you handle",
    "what would you do if",
    "describe a challenge",
    "tell me about yourself",
    "why should we hire",
    "what are your strengths",
    "what are your weaknesses",
    "where do you see yourself",
    "why do you want to work",
    "describe your experience",
    "walk me through",
    "behavioral",
    "interview question",
    "star format",
    "star method",
]

# Keywords that suggest code-related questions
CODE_KEYWORDS = [
    "code", "function", "class", "bug", "error", "fix",
    "implement", "algorithm", "debug", "compile", "syntax",
    "optimize", "refactor", "test", "unit test", "api",
    "database", "query", "sql", "python", "javascript",
    "typescript", "java", "leetcode", "hackerrank",
]

# Keywords that suggest system design
SYSTEM_DESIGN_KEYWORDS = [
    "system design", "architecture", "scale", "scalability",
    "microservice", "distributed", "load balancer", "caching",
    "database design", "api design", "high availability",
    "design a system", "how would you design", "infrastructure",
]


def classify_query(text: Optional[str], has_images: bool, has_audio: bool) -> QueryType:
    """
    Classify the query type based on content.
    Returns the most appropriate QueryType for context selection.
    """
    if not text:
        if has_images:
            return QueryType.CODE_ANALYSIS  # Screenshots usually contain code
        if has_audio:
            return QueryType.GENERAL  # Voice without text - could be anything
        return QueryType.GENERAL

    text_lower = text.lower()

    # Check for behavioral questions first (highest priority for context)
    for keyword in BEHAVIORAL_KEYWORDS:
        if keyword in text_lower:
            return QueryType.BEHAVIORAL

    # Check for system design
    for keyword in SYSTEM_DESIGN_KEYWORDS:
        if keyword in text_lower:
            return QueryType.SYSTEM_DESIGN

    # Check for code-related
    for keyword in CODE_KEYWORDS:
        if keyword in text_lower:
            return QueryType.CODE_ANALYSIS if has_images else QueryType.CODE_GENERATION

    # Default based on whether there are images
    if has_images:
        return QueryType.CODE_ANALYSIS

    return QueryType.GENERAL


def load_user_context() -> str:
    """Load all context files from the context directory"""
    if not CONTEXT_DIR.exists():
        CONTEXT_DIR.mkdir(exist_ok=True)
        return ""

    context_parts = []
    for file in CONTEXT_DIR.glob("*.txt"):
        try:
            content = file.read_text(encoding="utf-8")
            # Skip template/example content
            if "## Example Format:" in content and len(content) < 2000:
                continue
            context_parts.append(f"--- {file.stem} ---\n{content}")
        except Exception as e:
            print(f"Error reading context file {file}: {e}")

    for file in CONTEXT_DIR.glob("*.md"):
        try:
            content = file.read_text(encoding="utf-8")
            context_parts.append(f"--- {file.stem} ---\n{content}")
        except Exception as e:
            print(f"Error reading context file {file}: {e}")

    return "\n\n".join(context_parts)


# =============================================================================
# PROMPT TEMPLATES
# =============================================================================

PROMPTS = {
    # For analyzing code in screenshots
    QueryType.CODE_ANALYSIS: """Analyze this code and provide helpful feedback.

## Guidelines:
- Explain what the code does
- Identify any bugs, errors, or issues
- Suggest improvements or optimizations
- If it's a coding problem, provide a solution
- Include working code in your response when applicable

Be concise and practical.""",

    # For generating/writing code
    QueryType.CODE_GENERATION: """Help with this coding request.

## Guidelines:
- Provide clean, working code
- Use best practices and clear variable names
- Include brief explanations of your approach
- Consider edge cases
- If relevant, mention time/space complexity

Respond with practical, production-ready code.""",

    # For behavioral interview questions (uses personal context)
    QueryType.BEHAVIORAL: """Answer this behavioral interview question.

## Guidelines:
- Use the STAR format (Situation, Task, Action, Result)
- Draw from the professional context provided below
- Be specific with examples and metrics when possible
- Keep responses concise but impactful
- Sound natural and conversational

{user_context}""",

    # For system design questions
    QueryType.SYSTEM_DESIGN: """Help with this system design question.

## Guidelines:
- Clarify requirements and constraints
- Start with high-level architecture
- Discuss trade-offs between approaches
- Consider scalability, reliability, and performance
- Use diagrams in text form if helpful
- Mention specific technologies when relevant

{user_context}""",

    # For general questions
    QueryType.GENERAL: """Respond to this question helpfully.

## Guidelines:
- Be direct and practical
- If it's a technical question, provide accurate information
- If asking for advice, be specific and actionable
- Keep responses focused and concise""",
}

# Voice-specific prompt for audio input (without pre-loaded context)
VOICE_PROMPT = """Listen to the audio carefully and respond appropriately.

Determine the type of question and respond accordingly:
- For coding questions: provide clear code solutions. Do NOT use any tools.
- For behavioral/interview questions (e.g., "tell me about a time...", "describe your experience..."): use STAR format
- For general questions: be direct and helpful. Do NOT use any tools.
- For system design: think through requirements and trade-offs

{files_info}

IMPORTANT: Only use tools for behavioral interview questions that explicitly ask about personal experience. For coding, technical, or general questions, respond directly without using any tools."""


def get_system_prompt_with_files() -> str:
    """
    Build system prompt that tells AI about available context files.
    AI can choose to read them if needed.
    """
    files = get_available_context_files()

    if not files:
        return ""

    files_info = "\n## Available Context Files (use sparingly):\n"
    files_info += "These files contain personal background. ONLY use for behavioral interview questions like 'tell me about yourself' or 'describe a time when...':\n\n"

    for f in files:
        files_info += f"- **{f['filename']}**: {f['description']}\n"

    files_info += "\nDo NOT use these files for coding, debugging, or technical questions.\n"

    return files_info


def build_prompt(
    query_type: QueryType,
    user_text: Optional[str] = None,
    has_images: bool = False,
    has_audio: bool = False,
    conversation_history: Optional[List[dict]] = None,
    include_files_info: bool = True,
) -> str:
    """
    Build the complete prompt based on query type and inputs.
    Does NOT include full context - AI can fetch via tool if needed.
    """
    parts = []

    # Add available files info (AI can choose to read them)
    if include_files_info:
        files_info = get_system_prompt_with_files()
        if files_info:
            parts.append(files_info)

    # Add conversation history if present
    if conversation_history and len(conversation_history) > 0:
        history_text = "\n## Previous Conversation:\n"
        for msg in conversation_history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            role_label = "User" if role == "user" else "Assistant"
            history_text += f"\n**{role_label}:** {content}\n"
        history_text += "\n---\n\n## Current Request:\n"
        parts.append(history_text)

    # Get base prompt for query type (without embedded context)
    base_prompt = PROMPTS.get(query_type, PROMPTS[QueryType.GENERAL])

    # Remove context placeholders since we're using agentic approach
    base_prompt = base_prompt.replace("{user_context}", "")

    parts.append(base_prompt)

    # Add the user's actual text if provided
    if user_text:
        parts.append(f"\n## Question/Request:\n{user_text}")
    elif has_images and not has_audio:
        parts.append("\n## Task:\nAnalyze the screenshot provided.")

    return "\n".join(parts)


def build_voice_prompt(has_images: bool = False) -> str:
    """
    Build prompt specifically for voice input where we don't know the content yet.
    Uses agentic approach - AI can fetch context if needed.
    """
    files_info = get_system_prompt_with_files()

    prompt = VOICE_PROMPT.format(files_info=files_info)

    if has_images:
        prompt += "\n\nUse the provided screenshot(s) for context."

    return prompt


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
