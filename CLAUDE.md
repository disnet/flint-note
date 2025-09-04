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
- `npm run test` - Run tests in watch mode
- `npm run test:run` - Run tests once

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

- don't run the development server

- we currently have no users to unless told otherwise assume we can and should ignore backward compatibility or migration concerns

## Testing Structure

The project uses **Vitest** for testing with a structured approach:

### Test Organization

- Tests are located in `tests/` directory (separate from `src/`)
- Test files follow naming convention: `*.test.ts` or `*.spec.ts`
- Structure mirrors source code: `tests/server/api/`, `tests/server/core/`, etc.

### Testing Framework

- **Vitest** with Node.js environment
- Global test functions available (`describe`, `it`, `expect`, `beforeEach`, `afterEach`)
- Isolated test environments with temporary directories and databases

### Test Utilities

- `TestApiSetup` class provides isolated test environments
- Automatic cleanup of test data and temporary files
- Database testing with real SQLite instances in temporary locations

### ESLint for Tests

Test files have relaxed ESLint rules allowing:

- `any` types for mocking and flexibility
- Functions without explicit return types
- Unused variables for partial test implementations
- Non-null assertions and empty functions for test scenarios

### Running Tests

- `npm run test` - Interactive watch mode
- `npm run test:run` - Single run with coverage

## Svelte + Electron IPC Guidelines

**CRITICAL: Always use `$state.snapshot()` when sending Svelte reactive objects through IPC**

- Svelte's `$state` objects contain internal reactivity metadata that breaks structured cloning
- Before any `window.api?.someMethod(data)` call, wrap reactive data: `$state.snapshot(data)`
- This applies to: stores, reactive variables, derived values, any Svelte runes
- **Error symptoms**: "An object could not be cloned" when calling IPC methods
- **Standard pattern**:

  ```typescript
  // ❌ WRONG - Direct state serialization fails
  await window.api?.saveData(this.reactiveState);

  // ✅ CORRECT - Use $state.snapshot for IPC
  const serializable = $state.snapshot(this.reactiveState);
  await window.api?.saveData(serializable);
  ```
- when finishing a significant task (excluding things like linting/formatting), write a concicse summary (one bullet point) in PROJECT-LOG.md
