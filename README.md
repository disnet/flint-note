# Flint UI Monorepo

A monorepo containing the Flint note-taking application built with Electron and Svelte, along with its core server components.

## Overview

This repository contains:
- **@flint-note/electron-app**: Svelte-based Electron UI application
- **@flint-note/server**: Core note server with API, database, and business logic

The project uses npm workspaces to manage both packages together, enabling unified development and atomic changes across the entire stack.

## Quick Start

```bash
# Install all dependencies
npm install

# Build both packages
npm run build

# Start development mode
npm run dev
```

## Project Structure

```
flint-ui/
├── packages/
│   ├── electron-app/           # Main UI application
│   └── flint-server/           # Note server and API
├── docs/                       # Shared documentation
└── package.json               # Workspace configuration
```

## Development Commands

### Root Level Commands
- `npm run build` - Build server, then electron app (sequential)
- `npm run build:parallel` - Build both packages concurrently
- `npm run dev` - Build server, then start app development server
- `npm run dev:parallel` - Run both server and app in dev mode concurrently
- `npm run lint` - Run linter across all workspaces
- `npm run typecheck` - Run TypeScript checking with project references
- `npm run format` - Format code across all packages
- `npm run clean:all` - Clean all build artifacts

### Individual Package Commands
- `npm run build:server` - Build @flint-note/server only
- `npm run build:app` - Build server, then electron app
- `npm run dev:server` - Run server in watch mode
- `npm run dev:app` - Run electron app in dev mode

## Architecture

The application uses a monorepo architecture where the Electron UI directly consumes the local server package via workspace dependencies. This enables:

- **Unified Development**: Changes to server types immediately reflect in the UI
- **Type Safety**: Full TypeScript integration across packages
- **Atomic Changes**: Single commits can update both server and client
- **Simplified Dependencies**: Shared tooling and consistent versions

## Documentation

- `docs/DESIGN.md` - UI design documentation
- `docs/ARCHITECTURE.md` - System architecture details
- `docs/FLINT-NOTE-API.md` - Server API documentation
