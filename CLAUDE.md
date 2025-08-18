# Flint UI Project

## Project Overview

This is a **monorepo** containing a Svelte-based Electron UI application and the Flint note server. The project uses npm workspaces to manage both packages together.

## Monorepo Structure

```
flint-ui/
├── package.json                 # Root workspace configuration
├── packages/
│   ├── electron-app/           # @flint-note/electron-app - Main UI application
│   │   ├── package.json        # Depends on @flint-note/server via local workspace
│   │   ├── src/                # Svelte UI source code
│   │   └── ...                 # Electron configuration and build files
│   └── flint-server/           # @flint-note/server - Note API server
│       ├── package.json        # Local workspace package
│       ├── src/                # Server TypeScript source
│       ├── dist/               # Built output for app consumption
│       └── ...                 # Server configuration and tests
└── docs/                       # Shared documentation
```

## Development Commands

### Root Level (builds both packages)
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

## System Layout

### Documentation
- `docs/DESIGN.md` - UI design documentation
- `docs/ARCHITECTURE.md` - Electron system architecture documentation
- `docs/FLINT-NOTE-API.md` - Server API documentation

### Packages
- `packages/electron-app/` - Main Svelte + Electron application
- `packages/flint-server/` - Note server with API, database, and core logic

## Coding guidlines

- use modern svelte 5 syntax
  - `$state`, `$props`, `$derived`, `$derived.by`
  - use `onclick` etc. -- avoid `on:click`
  - events should be via props -- do not use `createEventDispatcher`
- when creating summaries of work being done put them in the `docs/` directory
- when creating new ts files in the renderer prefer creating .svelte.ts files so they can use runes
- avoid `any` type

- before running linting and typechecking after editing a bunch of files run `npm run format` to fix up formatting
