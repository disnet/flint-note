# Flint

**Ignite Deep Knowledge**

Flint is a note-taking app that helps you capture ideas, connect them together, and make them part of how you think.

- **[Download](https://flintnote.com#download)**
- **[Documentation](https://flintnote.com/docs)**
- **[Community](https://discord.gg/flint-note)**

---

## Philosophy

Flint is built on core principles:

2. **Frictionless Capture** - No barriers to writing things down
1. **AI but good** - AI to help with structural tasks while humans remain responsible for thinking
3. **Plain Text First** - Markdown files you own, no proprietary formats
4. **Local-First** - Your data stays on your machine
5. **Open Source** - No vendor lock-in, community-driven development

For a deeper understanding, read [docs/FLINT-OVERVIEW.md](docs/FLINT-OVERVIEW.md).


## Quick start

Flint is built with Electron, Svelte 5, and TypeScript as a local-first desktop application.

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

```
flint-note/
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
- `npm run check` - Run lint and typecheck
- `npm run test` - Run tests in watch mode
- `npm run test:run` - Run tests once

### Building Distributions

- `npm run build:mac` - Build macOS application
- `npm run build:win` - Build Windows application
- `npm run build:linux` - Build Linux application
- `npm run build:unpack` - Build without packaging (testing)
- `npm run clean` - Remove build artifacts and caches

## Technology Stack

### Frontend

- **Svelte 5**
- **TypeScript**
- **CodeMirror 6**

### Backend

- **Electron** - Cross-platform desktop framework
- **Node.js** - JavaScript runtime
- **SQLite** - Local database for notes and metadata
- **AI SDK** - AI provider integration via Gateway

## Documentation

- **[Getting Started](docs/GETTING-STARTED.md)** - Step-by-step setup guide
- **[Features Guide](docs/FEATURES.md)** - Comprehensive feature documentation
- **[Flint Overview](docs/FLINT-OVERVIEW.md)** - Philosophy and core beliefs
- **[Core Concepts](docs/architecture/CORE-CONCEPTS.md)** - Fundamental concepts
- **[Architecture](docs/architecture/ARCHITECTURE.md)** - System architecture
- **[Design](docs/architecture/DESIGN.md)** - UI design and components
- **[FlintNote API](docs/architecture/FLINT-NOTE-API.md)** - Server API reference
- **[Database Architecture](docs/architecture/DATABASE-ARCHITECTURE.md)** - Data persistence

## Contributing

Flint is open source and welcomes contributions!

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

Flint is licensed under the [GNU General Public License v3.0](LICENSE).

This means:
- ✅ You can use, study, modify, and distribute Flint
- ✅ You can use Flint commercially
- ⚠️ If you distribute modified versions, they must also be open source under GPL-3.0
- ⚠️ No warranty is provided

## Community & Support

- **Website** - [flintnote.com](https://flintnote.com)
- **Documentation** - [flintnote.com/docs](https://flintnote.com/docs)
- **Discord** - [Join the community](https://discord.gg/flint)
- **Issues** - Report bugs and request features on GitHub Issues
- **Discussions** - Ask questions and share ideas on GitHub Discussions

## Status

Flint is currently in **open beta**. Expect some bugs and unfinished polish as development continues. We welcome feedback and contributions!

---

**Built with care for people who think deeply.**
