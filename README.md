# Flint Electron - Chat Interface

A Svelte 5 + Electron application implementing a chat-first interface for Flint, an agent-first note-taking system.

## Current Implementation Status

### ✅ Completed Features

- **Chat Interface**: Core conversational UI with message history
- **Message Types**: Support for user, agent, and system messages
- **Slash Commands**: Command palette with fuzzy search (`/create`, `/find`, `/switch-vault`, etc.)
- **Note References**: Clickable note links using `[[Note Title]]` syntax
- **Auto-resize Input**: Textarea automatically adjusts height as you type
- **Responsive Design**: Mobile-friendly layout with dark mode support
- **Typing Indicators**: Visual feedback when agent is responding
- **Header**: Vault selector and settings button

### 🚧 Mock Data & Simulation

Currently using mock data for:

- Sample conversations with note references
- Slash command responses
- Note database for link resolution
- Vault switching simulation

### 🔄 Next Steps

- Note editor integration (right sidebar/overlay)
- Pinned notes/messages functionality
- Real MCP server integration
- Vault management
- Search functionality

## Project Setup

### Install

```bash
$ npm install
```

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

- `Chat.svelte` - Main chat interface with message handling
- `Header.svelte` - Top navigation with vault selector
- `MessageContent.svelte` - Renders messages with note references
- `NoteReferenceComponent.svelte` - Clickable note links
- `SlashCommands.svelte` - Command palette with autocomplete

### Key Features

- **Slash Commands**: Type `/` to open command palette
- **Note References**: Use `[[Note Title]]` syntax for clickable links
- **Auto-scroll**: Chat automatically scrolls to latest messages
- **Keyboard Navigation**: Full keyboard support for commands
- **Responsive Layout**: Adapts to different screen sizes

### Technologies

- **Svelte 5** with runes syntax
- **TypeScript** for type safety
- **Electron** for desktop app packaging
- **Vite** for fast development and building
