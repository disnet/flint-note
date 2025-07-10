# Flint Electron - Chat Interface

A Svelte 5 + Electron application implementing a chat-first interface for Flint, an agent-first note-taking system. Now integrated with LangChain and LM Studio for real LLM conversations.

## Current Implementation Status

### ✅ Completed Features

- **Chat Interface**: Core conversational UI with message history
- **LLM Integration**: Real conversations powered by LangChain and LM Studio
- **Message Types**: Support for user, agent, and system messages
- **Slash Commands**: Command palette with fuzzy search (`/create`, `/find`, `/switch-vault`, etc.)
- **Note References**: Clickable note links using `[[Note Title]]` syntax
- **Auto-resize Input**: Textarea automatically adjusts height as you type
- **Responsive Design**: Mobile-friendly layout with dark mode support
- **Streaming Responses**: Real-time streaming of LLM responses
- **LLM Settings**: Configure connection to LM Studio server
- **MCP Server Management**: Add and manage arbitrary stdio MCP servers
- **Header**: Vault selector and settings button

### 🚧 Mock Data & Simulation

Currently using mock data for:

- Note database for link resolution
- Vault switching simulation

### 🤖 LLM Integration

Real LLM integration using:

- **LangChain**: For LLM abstraction and streaming
- **LM Studio**: Local LLM server for privacy and control
- **OpenAI-Compatible API**: Easy model switching
- **Streaming Responses**: Real-time conversation experience

### 🔄 Next Steps

- Note editor integration (right sidebar/overlay)
- Pinned notes/messages functionality
- Enhanced MCP server capabilities
- Vault management
- Search functionality
- Advanced LLM features (temperature control, model switching)

## MCP Server Management

Flint now supports adding arbitrary stdio MCP (Model Context Protocol) servers to extend the AI assistant's capabilities with custom tools.

### Features

- **Add Custom Servers**: Configure any stdio-compatible MCP server
- **Enable/Disable**: Control which servers are active
- **Test Connections**: Verify server setup before enabling
- **Tool Integration**: Server tools automatically appear in chat
- **Environment Variables**: Configure server-specific settings

### Adding MCP Servers

1. **Open Settings**: Click the settings gear icon in the header
2. **Navigate to MCP**: Go to "MCP Server Management" section
3. **Add Server**: Click "Add Server" and fill in:
   - **Name**: Friendly name for your server
   - **Command**: Executable command (e.g., `python`, `node`, `/path/to/binary`)
   - **Arguments**: Command-line arguments (comma-separated)
   - **Description**: Optional description
   - **Environment**: Set environment variables if needed
4. **Test**: Use the "Test" button to verify the server works
5. **Enable**: Check the "Enabled" checkbox to activate

### Example Server Configurations

#### Python MCP Server

```
Name: Weather Service
Command: python
Arguments: -m, weather_mcp_server, --api-key, ${WEATHER_API_KEY}
```

#### Node.js MCP Server

```
Name: File Tools
Command: node
Arguments: /path/to/file-server.js, --workspace, /home/user/projects
```

#### Custom Binary

```
Name: System Monitor
Command: /usr/local/bin/system-mcp
Arguments: --interval, 5, --log-level, info
```

### Using MCP Tools

Once servers are configured and enabled:

1. **Chat Integration**: Tools appear automatically in conversations
2. **Tool Naming**: Tools are prefixed with server name (e.g., `weather:get_current`)
3. **Natural Language**: Ask the AI to use specific tools
4. **Real-time**: Tools execute in real-time during conversations

### Creating Custom MCP Servers

See `examples/simple_mcp_server.py` for a basic Python implementation. Your server must:

- Accept JSON requests via stdin
- Send JSON responses via stdout
- Implement `tools/list` and `tools/call` methods
- Follow the MCP protocol specification

For detailed information, see [MCP_SERVERS.md](MCP_SERVERS.md).

## Project Setup

### Install

```bash
$ npm install
```

### LM Studio Setup

1. **Download and install LM Studio** from [https://lmstudio.ai/](https://lmstudio.ai/)

2. **Load a model** (recommended: Llama 3.1 8B or similar)

3. **Start the local server**:
   - Click "Local Server" in LM Studio
   - Start server on port 1234 (default)
   - Note the server URL (usually `http://localhost:1234/v1`)

4. **Configure in Flint**:
   - Open Flint
   - Click the settings gear icon
   - Configure LLM settings:
     - Base URL: `http://localhost:1234/v1`
     - API Key: `lm-studio` (default)
     - Model Name: Your loaded model name
   - Test the connection

### Development

```bash
$ npm run dev
```

### Type Checking

```bash
$ npm run typecheck
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Architecture

### Components

- `Chat.svelte` - Main chat interface with LLM integration
- `Header.svelte` - Top navigation with vault selector and settings
- `MessageContent.svelte` - Renders messages with note references
- `NoteReferenceComponent.svelte` - Clickable note links
- `SlashCommands.svelte` - Command palette with autocomplete
- `LLMSettings.svelte` - Configuration modal for LLM connection

### Services

- `llmService.ts` - Main process LLM service using LangChain
- `llmClient.ts` - Renderer process client for LLM communication

### Key Features

- **Real LLM Conversations**: Powered by LangChain and LM Studio
- **Streaming Responses**: See responses as they're generated
- **Slash Commands**: Type `/` to open command palette
- **Note References**: Use `[[Note Title]]` syntax for clickable links
- **Auto-scroll**: Chat automatically scrolls to latest messages
- **Keyboard Navigation**: Full keyboard support for commands
- **Responsive Layout**: Adapts to different screen sizes
- **LLM Configuration**: Easy setup and connection testing
- **MCP Server Management**: Add and configure custom MCP servers

### Technologies

- **Svelte 5** with runes syntax
- **TypeScript** for type safety
- **Electron** for desktop app packaging
- **Vite** for fast development and building
- **LangChain** for LLM integration and streaming
- **LM Studio** for local LLM hosting
- **MCP Protocol** for extensible tool integration

### LLM Features

- **Local Privacy**: All conversations stay on your machine
- **Streaming**: Real-time response generation
- **Configurable**: Adjust temperature, max tokens, and model
- **Fallback**: Graceful degradation when LLM is unavailable
- **Error Handling**: Comprehensive error reporting and recovery
- **MCP Tools**: Extensible tool system via MCP servers
- **Server Management**: Easy configuration and testing of MCP servers
