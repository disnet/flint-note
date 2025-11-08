# Flint

An AI-powered note-taking application designed as a thinking system that extends and amplifies human cognition. Built with Electron, Svelte 5, and TypeScript.

## Overview

Flint is a local-first note-taking application that combines plain-text markdown notes with AI agents that assist with metadata management, connection discovery, and workflow automation. The application maintains a strong philosophy: AI agents help with structural tasks while humans remain responsible for thinking, content creation, and insight generation.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Build for production
npm run build
```

## Project Structure

This is a **unified Electron application** with integrated note server functionality:

```
flint-ui/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.ts           # Main entry point
│   │   ├── ai-service.ts      # AI/MCP integration
│   │   ├── note-service.ts    # Note management
│   │   ├── tool-service.ts    # Agent tool system
│   │   ├── workflow-service.ts # Workflow automation
│   │   └── ...                # Storage, auto-update, etc.
│   ├── preload/               # Electron preload scripts
│   │   └── index.ts          # IPC bridge
│   ├── renderer/              # Svelte UI application
│   │   └── src/
│   │       ├── components/    # Svelte 5 components
│   │       ├── stores/        # State management (runes)
│   │       ├── services/      # Frontend services
│   │       └── utils/         # Utility functions
│   └── server/                # Integrated note server
│       ├── api/               # FlintNoteApi
│       ├── core/              # Core note logic
│       ├── database/          # SQLite management
│       └── types/             # Type definitions
├── docs/                      # Comprehensive documentation
│   ├── GETTING-STARTED.md    # New developer guide
│   ├── FEATURES.md           # Feature documentation
│   ├── FLINT-OVERVIEW.md     # Philosophy and vision
│   └── architecture/         # Technical architecture docs
├── tests/                     # Vitest test suite
└── package.json              # Single package configuration
```

## Development Commands

### Building and Running

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the complete application
- `npm run start` - Start built application

### Code Quality

- `npm run lint` - Run ESLint on all source code
- `npm run typecheck` - Run TypeScript type checking
- `npm run format` - Format code with Prettier
- `npm run check` - Run both lint and typecheck

### Testing

- `npm run test` - Run tests in watch mode
- `npm run test:run` - Run tests once with coverage

### Building Distributions

- `npm run build:mac` - Build macOS application
- `npm run build:win` - Build Windows application
- `npm run build:linux` - Build Linux application
- `npm run build:unpack` - Build without packaging (testing)

### Cleaning

- `npm run clean` - Remove build artifacts and caches

## Technology Stack

### Frontend

- **Svelte 5** - Modern reactive UI framework with runes
- **TypeScript** - Type-safe development
- **CodeMirror 6** - Advanced code/markdown editor
- **CSS Grid** - Responsive layout system

### Backend

- **Electron** - Cross-platform desktop framework
- **Node.js** - JavaScript runtime
- **SQLite** - Local database for notes and metadata
- **AI SDK** - AI provider integration via Gateway

### AI Integration

- **Model Context Protocol (MCP)** - Standardized AI tool integration
- **Multi-provider Support** - Anthropic, OpenAI, OpenRouter
- **Streaming Responses** - Real-time AI interactions
- **Prompt Caching** - Optimized token usage

## Key Features

- **Agent-Assisted Note-Taking** - AI helps with organization, not replacement
- **Plain-Text Notes** - Standard markdown with YAML frontmatter
- **Wikilink Support** - Bidirectional linking with `[[Note Title]]` syntax
- **Multi-Vault Workspaces** - Isolated note collections
- **Custom Note Types** - Extensible schemas for different content
- **Daily Notes** - Dedicated daily journal view
- **Inbox System** - Quick capture with gradual organization
- **Workflow Automation** - Repeatable AI-assisted workflows
- **Custom Functions** - User-defined JavaScript functions for agents
- **Full-Text Search** - Fast search across all notes
- **Auto-Update** - Seamless application updates
- **Local-First** - Your data stays on your machine

## Architecture Highlights

### Three-Column Layout

- **Left Sidebar** - Navigation, pinned notes, temporary tabs
- **Main View** - Note editor with CodeMirror
- **Right Sidebar** - AI assistant, metadata editor, backlinks

### Modern Svelte 5 Patterns

- **Runes** - `$state`, `$derived`, `$effect` for reactivity
- **Props** - Modern `$props()` syntax
- **Event Handlers** - Native `onclick` vs legacy `on:click`
- **File System Persistence** - All state saved to disk

### Electron Architecture

- **Main Process** - Service coordination, AI integration, storage
- **Renderer Process** - Svelte UI with isolated context
- **Preload Bridge** - Secure IPC communication
- **Storage Services** - File-based state persistence

## Documentation

### For New Developers

- **[Getting Started](docs/GETTING-STARTED.md)** - Step-by-step setup guide
- **[Features Guide](docs/FEATURES.md)** - Comprehensive feature documentation
- **[CLAUDE.md](CLAUDE.md)** - AI coding assistant guidelines

### Philosophy and Vision

- **[Flint Overview](docs/FLINT-OVERVIEW.md)** - Philosophy and core beliefs
- **[Core Concepts](docs/architecture/CORE-CONCEPTS.md)** - Fundamental concepts

### Technical Architecture

- **[Architecture](docs/architecture/ARCHITECTURE.md)** - System architecture
- **[Design](docs/architecture/DESIGN.md)** - UI design and components
- **[FlintNote API](docs/architecture/FLINT-NOTE-API.md)** - Server API reference
- **[Database Architecture](docs/architecture/DATABASE-ARCHITECTURE.md)** - Data persistence

### Feature-Specific Docs

- See `docs/architecture/` for detailed documentation on:
  - Workflows and automation
  - Custom functions
  - Backlinks and wikilinks
  - Navigation and state management
  - Code evaluation
  - And many more...

## Contributing

Flint is open source and welcomes contributions! Key guidelines:

### Coding Standards

- **Modern Svelte 5** - Use runes (`$state`, `$derived`, etc.)
- **TypeScript** - Avoid `any` types
- **Format First** - Run `npm run format` before commits
- **Test Coverage** - Write tests for new features

### Development Workflow

1. Create a feature branch
2. Make changes with clear commits
3. Run `npm run check` to validate
4. Test manually and with automated tests
5. Submit pull request with description

### Important Notes

- Don't run `npm run dev` during automated tasks
- Handle backward compatibility for existing users
- Use migration system for breaking DB changes
- Follow the agent-first philosophy

## Philosophy

Flint is built around core principles:

1. **Agent Assistance, Not Replacement** - AI helps humans think, doesn't replace thinking
2. **Frictionless Capture** - No barriers to writing things down
3. **Plain Text First** - Data portability and user control
4. **Local-First** - Privacy and ownership
5. **Open Source** - No vendor lock-in

For a deeper understanding, read [docs/FLINT-OVERVIEW.md](docs/FLINT-OVERVIEW.md).

## License

[License information to be added]

## Community

- **Issues** - [GitHub Issues](https://github.com/flint-org/flint-ui/issues)
- **Discussions** - [GitHub Discussions](https://github.com/flint-org/flint-ui/discussions)

---

**Built with care for people who think.**
