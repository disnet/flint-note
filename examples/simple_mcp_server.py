#!/usr/bin/env python3
"""
Simple MCP Server Example for Flint GUI

This is a basic implementation of an MCP server that demonstrates:
- Text processing tools
- Mathematical calculations
- System information retrieval

To use this server with Flint GUI:
1. Install required dependencies: pip install mcp
2. Add server in Flint GUI settings:
   - Name: Simple Tools
   - Command: python
   - Arguments: /path/to/simple_mcp_server.py
   - Enable: true
"""

import json
import sys
import asyncio
from typing import Dict, Any, List
import platform
import os
import subprocess
from datetime import datetime
import re


class SimpleMCPServer:
    def __init__(self):
        self.tools = {
            "text_transform": {
                "name": "text_transform",
                "description": "Transform text using various operations (uppercase, lowercase, reverse, etc.)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "text": {
                            "type": "string",
                            "description": "The text to transform"
                        },
                        "operation": {
                            "type": "string",
                            "description": "The operation to perform",
                            "enum": ["uppercase", "lowercase", "reverse", "capitalize", "title", "count_words", "count_chars"]
                        }
                    },
                    "required": ["text", "operation"]
                }
            },
            "calculate": {
                "name": "calculate",
                "description": "Perform mathematical calculations",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "expression": {
                            "type": "string",
                            "description": "Mathematical expression to evaluate (e.g., '2 + 3 * 4')"
                        }
                    },
                    "required": ["expression"]
                }
            },
            "system_info": {
                "name": "system_info",
                "description": "Get system information",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "info_type": {
                            "type": "string",
                            "description": "Type of system information to retrieve",
                            "enum": ["platform", "cpu", "memory", "disk", "network", "processes", "uptime"]
                        }
                    },
                    "required": ["info_type"]
                }
            },
            "file_operations": {
                "name": "file_operations",
                "description": "Basic file operations (list, read, write)",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "operation": {
                            "type": "string",
                            "description": "File operation to perform",
                            "enum": ["list", "read", "write", "exists", "size"]
                        },
                        "path": {
                            "type": "string",
                            "description": "File or directory path"
                        },
                        "content": {
                            "type": "string",
                            "description": "Content to write (only for write operation)"
                        }
                    },
                    "required": ["operation", "path"]
                }
            },
            "current_time": {
                "name": "current_time",
                "description": "Get current date and time information",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "format": {
                            "type": "string",
                            "description": "Time format (iso, human, timestamp, custom)",
                            "enum": ["iso", "human", "timestamp", "custom"]
                        },
                        "timezone": {
                            "type": "string",
                            "description": "Timezone (default: local)",
                            "default": "local"
                        },
                        "custom_format": {
                            "type": "string",
                            "description": "Custom format string (for custom format type)"
                        }
                    },
                    "required": ["format"]
                }
            }
        }

    async def handle_request(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming MCP requests"""
        method = request.get("method")
        params = request.get("params", {})

        if method == "tools/list":
            return {
                "tools": list(self.tools.values())
            }
        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})

            if tool_name in self.tools:
                return await self.call_tool(tool_name, arguments)
            else:
                return {
                    "content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}],
                    "isError": True
                }
        else:
            return {
                "content": [{"type": "text", "text": f"Unknown method: {method}"}],
                "isError": True
            }

    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Call a specific tool with the given arguments"""
        try:
            if tool_name == "text_transform":
                return await self.text_transform(arguments)
            elif tool_name == "calculate":
                return await self.calculate(arguments)
            elif tool_name == "system_info":
                return await self.system_info(arguments)
            elif tool_name == "file_operations":
                return await self.file_operations(arguments)
            elif tool_name == "current_time":
                return await self.current_time(arguments)
            else:
                return {
                    "content": [{"type": "text", "text": f"Tool not implemented: {tool_name}"}],
                    "isError": True
                }
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error executing tool {tool_name}: {str(e)}"}],
                "isError": True
            }

    async def text_transform(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Transform text using various operations"""
        text = arguments.get("text", "")
        operation = arguments.get("operation", "")

        if operation == "uppercase":
            result = text.upper()
        elif operation == "lowercase":
            result = text.lower()
        elif operation == "reverse":
            result = text[::-1]
        elif operation == "capitalize":
            result = text.capitalize()
        elif operation == "title":
            result = text.title()
        elif operation == "count_words":
            result = f"Word count: {len(text.split())}"
        elif operation == "count_chars":
            result = f"Character count: {len(text)} (including spaces), {len(text.replace(' ', ''))} (excluding spaces)"
        else:
            return {
                "content": [{"type": "text", "text": f"Unknown operation: {operation}"}],
                "isError": True
            }

        return {
            "content": [{"type": "text", "text": result}]
        }

    async def calculate(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Perform mathematical calculations"""
        expression = arguments.get("expression", "")

        # Basic security: only allow safe mathematical operations
        if not re.match(r'^[0-9+\-*/().\s]+$', expression):
            return {
                "content": [{"type": "text", "text": "Invalid expression: only numbers and basic operators (+, -, *, /, parentheses) are allowed"}],
                "isError": True
            }

        try:
            result = eval(expression)
            return {
                "content": [{"type": "text", "text": f"{expression} = {result}"}]
            }
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error calculating '{expression}': {str(e)}"}],
                "isError": True
            }

    async def system_info(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Get system information"""
        info_type = arguments.get("info_type", "")

        try:
            if info_type == "platform":
                info = f"Platform: {platform.system()} {platform.release()}\nArchitecture: {platform.machine()}\nProcessor: {platform.processor()}"
            elif info_type == "cpu":
                info = f"CPU Count: {os.cpu_count()}\nProcessor: {platform.processor()}"
            elif info_type == "memory":
                # This is a simplified version - in practice you'd use psutil
                info = "Memory information requires psutil library"
            elif info_type == "disk":
                info = f"Current directory: {os.getcwd()}\nHome directory: {os.path.expanduser('~')}"
            elif info_type == "network":
                info = f"Hostname: {platform.node()}"
            elif info_type == "processes":
                info = "Process information requires psutil library"
            elif info_type == "uptime":
                info = f"Python started at: {datetime.now().isoformat()}"
            else:
                return {
                    "content": [{"type": "text", "text": f"Unknown info type: {info_type}"}],
                    "isError": True
                }

            return {
                "content": [{"type": "text", "text": info}]
            }
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error getting system info: {str(e)}"}],
                "isError": True
            }

    async def file_operations(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Basic file operations"""
        operation = arguments.get("operation", "")
        path = arguments.get("path", "")
        content = arguments.get("content", "")

        try:
            if operation == "list":
                if os.path.isdir(path):
                    items = os.listdir(path)
                    result = f"Contents of {path}:\n" + "\n".join(items)
                else:
                    result = f"Path {path} is not a directory"
            elif operation == "read":
                if os.path.isfile(path):
                    with open(path, 'r', encoding='utf-8') as f:
                        result = f"Contents of {path}:\n{f.read()}"
                else:
                    result = f"File {path} not found"
            elif operation == "write":
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                result = f"Successfully wrote to {path}"
            elif operation == "exists":
                result = f"Path {path} {'exists' if os.path.exists(path) else 'does not exist'}"
            elif operation == "size":
                if os.path.exists(path):
                    size = os.path.getsize(path)
                    result = f"Size of {path}: {size} bytes"
                else:
                    result = f"Path {path} does not exist"
            else:
                return {
                    "content": [{"type": "text", "text": f"Unknown operation: {operation}"}],
                    "isError": True
                }

            return {
                "content": [{"type": "text", "text": result}]
            }
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error with file operation: {str(e)}"}],
                "isError": True
            }

    async def current_time(self, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Get current date and time information"""
        format_type = arguments.get("format", "iso")
        custom_format = arguments.get("custom_format", "")

        try:
            now = datetime.now()

            if format_type == "iso":
                result = now.isoformat()
            elif format_type == "human":
                result = now.strftime("%A, %B %d, %Y at %I:%M %p")
            elif format_type == "timestamp":
                result = str(int(now.timestamp()))
            elif format_type == "custom":
                if custom_format:
                    result = now.strftime(custom_format)
                else:
                    result = "Custom format string required for custom format type"
            else:
                return {
                    "content": [{"type": "text", "text": f"Unknown format type: {format_type}"}],
                    "isError": True
                }

            return {
                "content": [{"type": "text", "text": f"Current time: {result}"}]
            }
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error getting time: {str(e)}"}],
                "isError": True
            }

    async def run(self):
        """Main server loop"""
        while True:
            try:
                # Read a line from stdin
                line = sys.stdin.readline()
                if not line:
                    break

                # Parse JSON request
                request = json.loads(line.strip())

                # Handle the request
                response = await self.handle_request(request)

                # Send response to stdout
                print(json.dumps(response), flush=True)

            except json.JSONDecodeError:
                error_response = {
                    "content": [{"type": "text", "text": "Invalid JSON request"}],
                    "isError": True
                }
                print(json.dumps(error_response), flush=True)
            except Exception as e:
                error_response = {
                    "content": [{"type": "text", "text": f"Server error: {str(e)}"}],
                    "isError": True
                }
                print(json.dumps(error_response), flush=True)


async def main():
    """Main entry point"""
    server = SimpleMCPServer()
    await server.run()


if __name__ == "__main__":
    asyncio.run(main())
