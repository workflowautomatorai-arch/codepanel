"""
Tool Registry for CodePanel Personal Assistant
Centralizes all tool definitions and execution logic
"""

from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum


class ToolType(Enum):
    """Types of tools available"""
    CUSTOM = "function"      # Custom tools we implement
    BUILTIN = "builtin"      # Gemini built-in tools


@dataclass
class ToolResult:
    """Result from executing a tool"""
    name: str
    call_id: str
    result: str
    success: bool = True


@dataclass
class ToolCall:
    """Represents a tool call from the AI"""
    name: str
    call_id: str
    arguments: Dict[str, Any]


class ToolRegistry:
    """
    Central registry for all tools available to the AI.
    Handles both custom functions and built-in Gemini tools.
    """

    def __init__(self):
        self._custom_tools: Dict[str, Dict[str, Any]] = {}
        self._handlers: Dict[str, Callable] = {}
        self._builtin_tools: List[Dict[str, str]] = []

    def register_custom_tool(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        handler: Callable
    ) -> None:
        """
        Register a custom tool with its handler function.

        Args:
            name: Tool name (must match what AI will call)
            description: Description for the AI to understand when to use it
            parameters: JSON Schema for parameters
            handler: Function to execute when tool is called
        """
        self._custom_tools[name] = {
            "type": "function",
            "name": name,
            "description": description,
            "parameters": parameters
        }
        self._handlers[name] = handler

    def register_builtin_tool(self, tool_type: str) -> None:
        """
        Register a Gemini built-in tool.

        Args:
            tool_type: One of "google_search", "url_context", "code_execution"
        """
        valid_types = ["google_search", "url_context", "code_execution"]
        if tool_type not in valid_types:
            raise ValueError(f"Invalid built-in tool type: {tool_type}. Must be one of {valid_types}")

        self._builtin_tools.append({"type": tool_type})

    def get_tools(
        self,
        include_custom: bool = True,
        include_builtin: bool = True,
        custom_filter: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get tool definitions for the Gemini API.

        Args:
            include_custom: Include custom function tools
            include_builtin: Include built-in Gemini tools
            custom_filter: If provided, only include these custom tools by name

        Returns:
            List of tool definitions in Gemini format
        """
        tools = []

        if include_custom:
            for name, tool in self._custom_tools.items():
                if custom_filter is None or name in custom_filter:
                    tools.append(tool)

        if include_builtin:
            tools.extend(self._builtin_tools)

        return tools

    def execute_tool(self, tool_call: ToolCall) -> ToolResult:
        """
        Execute a tool call and return the result.

        Args:
            tool_call: The tool call from the AI

        Returns:
            ToolResult with the execution result
        """
        name = tool_call.name

        if name not in self._handlers:
            return ToolResult(
                name=name,
                call_id=tool_call.call_id,
                result=f"Unknown tool: {name}",
                success=False
            )

        try:
            handler = self._handlers[name]
            result = handler(**tool_call.arguments)
            return ToolResult(
                name=name,
                call_id=tool_call.call_id,
                result=result,
                success=True
            )
        except Exception as e:
            return ToolResult(
                name=name,
                call_id=tool_call.call_id,
                result=f"Error executing {name}: {str(e)}",
                success=False
            )

    def has_handler(self, name: str) -> bool:
        """Check if we have a handler for a tool (custom tools only)"""
        return name in self._handlers


def create_context_tools_registry() -> ToolRegistry:
    """
    Create and configure the tool registry with context tools.
    This is the main factory function for getting a configured registry.
    """
    from prompts import read_context_file, list_context_files, get_available_context_files

    registry = ToolRegistry()

    # Get available files for description
    files = get_available_context_files()
    files_list = ", ".join([f['filename'] for f in files]) if files else "none"

    # Register list_context_files tool
    registry.register_custom_tool(
        name="list_context_files",
        description="List all available personal context files. Call this first to discover what context is available about the user. Returns filenames with descriptions.",
        parameters={
            "type": "object",
            "properties": {},
            "required": []
        },
        handler=list_context_files
    )

    # Register read_context_file tool
    registry.register_custom_tool(
        name="read_context_file",
        description=f"Read a specific personal context file. Use after list_context_files to load relevant context. Available files: {files_list}. ONLY use for questions requiring personal background (behavioral interviews, 'tell me about yourself', etc.). NEVER use for coding or technical questions.",
        parameters={
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Name of the context file to read (e.g., 'about_me.txt')"
                }
            },
            "required": ["filename"]
        },
        handler=read_context_file
    )

    # NOTE: Built-in tools (google_search, url_context) are disabled because
    # Gemini Interactions API does not yet support combining custom function tools
    # with built-in tools. Re-enable when this limitation is lifted.
    # See: https://ai.google.dev/gemini-api/docs/interactions#limitations

    return registry


def parse_tool_calls(interaction_outputs: list) -> List[ToolCall]:
    """
    Parse tool calls from Gemini interaction outputs.

    Args:
        interaction_outputs: The outputs array from an interaction

    Returns:
        List of ToolCall objects
    """
    calls = []
    for output in interaction_outputs:
        if output.type == "function_call":
            calls.append(ToolCall(
                name=output.name,
                call_id=output.id,
                arguments=output.arguments or {}
            ))
    return calls
