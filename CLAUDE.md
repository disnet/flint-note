# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build and Development
- `npm run build` - Build TypeScript to dist/ and make executables
- `npm run build:watch` - Build with watch mode for development
- `npm run dev` - Start development server with watch mode using tsx
- `npm run clean` - Remove dist/ directory

### Testing
- `npm test` - Run all tests (unit + integration)
- `npm run test:unit` - Run only unit tests
- `npm run test:integration` - Run only integration tests
- `npm run test -- --test-name-pattern="pattern to narrow down tests"` - Run tests matching the provided pattern

### Code Quality
- `npm run lint` - Lint TypeScript files with ESLint
- `npm run format` - Format code with Prettier
- `npm run type-check` - Run TypeScript type checking without emitting files

### Production
- `npm start` - Build and start production server
- `npm run start:prod` - Start production server (requires pre-built dist/)
- `npm run cli:prod` - Run production CLI (requires pre-built dist/)

### Development CLI
- `npm run cli` - Run CLI in development mode with tsx

### MCP Inspector
- `npm run inspector` - Launch MCP inspector for debugging (sets DANGEROUSLY_OMIT_AUTH=true)

## Architecture Overview

### Core Components

**MCP Server (`src/index.ts`, `src/server.ts`)**
- Model Context Protocol server providing AI agents access to notes
- Exposes tools for note CRUD, note type management, search, and vault operations
- Implements multi-vault system for organizing different note collections

**Note Management (`src/core/notes.ts`)**
- Core note operations: create, read, update, delete
- Supports batch operations for efficiency
- Implements content hash system for optimistic locking
- Handles metadata validation against note type schemas

**Note Types (`src/core/note-types.ts`)**
- Manages note type definitions with agent instructions and metadata schemas
- Each note type has its own directory with `_description.md` defining behavior
- Supports rich metadata schemas with validation constraints

**Search System (`src/core/search.ts`, `src/database/`)**
- Hybrid file + SQLite search architecture
- Multiple search interfaces: simple text, advanced structured, SQL queries
- Full-text search with FTS5, metadata filtering, and content ranking

**Workspace Management (`src/core/workspace.ts`)**
- Multi-vault system for organizing note collections
- Platform-specific configuration storage
- Automatic vault initialization with default note types

**CLI Interface (`src/cli.ts`)**
- Command-line interface for vault management
- Supports vault creation, switching, note operations, and bulk operations

### Key Architectural Patterns

**Agent-First Design**
- Every note type includes agent instructions defining AI behavior
- Metadata schemas provide structured data validation
- System responds with contextual guidance for AI agents

**File-Based Storage with Database Indexing**
- Notes stored as markdown files with YAML frontmatter
- SQLite index enables complex queries while preserving file accessibility
- Content hash system prevents concurrent edit conflicts

**Multi-Vault Organization**
- Global configuration manages multiple vault registry
- Each vault has independent note types and configuration
- Seamless switching between work, personal, research contexts

## Code Style Guidelines

### TypeScript Conventions
- Use JavaScript private fields (`#private`) instead of TypeScript `private` keyword
- Single quotes for strings, semicolons required
- Prefer `const` over `let`
- Prefix unused variables with `_`
- Use empty catch bindings when error unused: `catch {}` vs `catch (error) {}`

### Project Standards
- ESM modules (type: "module" in package.json)
- Node.js 18+ required
- Modern flat ESLint configuration
- Prettier for code formatting

## Development Workflow

### Running Tests
Always run the full test suite before committing:
```bash
npm run type-check && npm run lint && npm test
```

### Working with Vaults
The system supports multiple vaults. Default vault operations:
- Configuration in `~/.config/flint-note/` (Unix) or `%APPDATA%\flint-note` (Windows)
- Use CLI commands for vault management: `npm run cli -- list`, `npm run cli -- create`, etc.

### MCP Development
- Use `npm run inspector` to debug MCP tool interactions
- Test with MCP clients like Claude Desktop by configuring server path
- All MCP tools support both single and batch operations

### Search Development
- Three search interfaces: simple, advanced, SQL
- SQLite schema in `src/database/schema.ts`
- Search index automatically syncs with file changes

## Important Implementation Details

### Content Hash System
- All note updates require content_hash parameter for conflict prevention
- Always call `get_note` before `update_note` to obtain current hash
- Supports optimistic locking for concurrent access safety

### Note Renaming
- Use `rename_note` tool to change note display titles (preserves filenames and links)
- The `title` field in YAML frontmatter is the user-visible name
- Filenames remain unchanged to maintain stable wikilink references
- When asked to rename a note, ALWAYS use `rename_note` instead of `update_note`

### Metadata Validation
- Schemas support string, number, boolean, date, array, select field types
- Constraints include min/max, patterns, required fields, selection options
- Validation occurs on create/update with detailed error messages

### Batch Operations
- `create_note` and `update_note` tools accept both single objects and arrays
- Each batch update requires individual content hashes
- Partial failures handled gracefully with detailed error reporting

### File Structure Conventions
- Note types are directories with `_description.md` files
- Notes are markdown files with YAML frontmatter
- `.flint-note/` directory contains configuration and indexes
- Default note types: daily, reading, todos, projects, goals
