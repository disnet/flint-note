# Flint UI Project

## Project Overview

This is a **unified Electron application** containing a Svelte-based UI and the integrated Flint note server. The project uses a single package structure for simplified development and building.

## Project Structure

```
flint-ui/
├── package.json                 # Single package configuration
├── src/
│   ├── main/                   # Electron main process
│   ├── preload/                # Electron preload scripts
│   ├── renderer/               # Svelte UI application
│   │   ├── index.html         # Main HTML file
│   │   └── src/               # Svelte source code
│   │       ├── components/    # Svelte components
│   │       ├── services/      # API and service layers
│   │       ├── stores/        # Svelte stores
│   │       └── utils/         # Utility functions
│   └── server/                 # Integrated note server
│       ├── api/               # Server API layer
│       ├── core/              # Core note logic
│       ├── database/          # Database management
│       ├── server/            # Server handlers
│       ├── types/             # Type definitions
│       └── utils/             # Server utilities
├── test/                       # Consolidated tests
│   ├── app/                   # App-specific tests
│   └── server/                # Server tests
├── docs/                       # Project documentation
└── [config files]             # Build configs, TypeScript, etc.
```

## Development Commands

- `npm run build` - Build the complete application
- `npm run dev` - Start development server
- `npm run lint` - Run linter on all source code
- `npm run typecheck` - Run TypeScript checking
- `npm run format` - Format code across all files
- `npm run clean` - Clean build artifacts
- `npm run test` - Run Vitest tests for UI components
- `npm run test:server` - Run server tests
- `npm run test:unit` - Run server unit tests
- `npm run test:integration` - Run server integration tests

## System Layout

### Documentation

- `docs/DESIGN.md` - UI design documentation
- `docs/ARCHITECTURE.md` - Electron system architecture documentation
- `docs/FLINT-NOTE-API.md` - Server API documentation

### Source Code

- `src/main/` - Electron main process with AI and note services
- `src/preload/` - Preload scripts for secure IPC
- `src/renderer/` - Svelte UI application
- `src/server/` - Integrated note server with API, database, and core logic

## Coding guidlines

- use modern svelte 5 syntax
  - `$state`, `$props`, `$derived`, `$derived.by`
  - use `onclick` etc. -- avoid `on:click`
  - events should be via props -- do not use `createEventDispatcher`
- when creating summaries of work being done put them in the `docs/` directory
- when creating new ts files in the renderer prefer creating .svelte.ts files so they can use runes
- avoid `any` type

- before running linting and typechecking after editing a bunch of files run `npm run format` to fix up formatting
