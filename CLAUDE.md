# Flint UI Project

## Project Overview

This is a **unified Electron application** containing a Svelte-based UI and the integrated Flint note server. The project uses a single package structure for simplified development and building.

## Automerge-Based Architecture

The app uses Automerge for local-first data storage with CRDT-based data structures:

- **Entry point**: `src/renderer/src/App.svelte`
- **Data storage**: Automerge with IndexedDB (`src/renderer/src/lib/automerge/`)
- **State management**: Unified state module in `state.svelte.ts`

See `docs/AUTOMERGE-MIGRATION.md` for architecture details and history.

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
├── sync-server/                # Separate Bun project for cloud sync
│   ├── src/
│   │   ├── index.ts           # Express server entry point
│   │   ├── db.ts              # SQLite database (bun:sqlite)
│   │   ├── auth/              # Bluesky ATProto OAuth, sessions, invite codes
│   │   └── sync/              # Sync implementation
│   │       ├── lean-sync-server.ts  # WebSocket sync (one-doc-at-a-time)
│   │       ├── doc-storage.ts       # Document binary storage
│   │       ├── file-storage.ts      # Binary file storage (PDFs, images, etc.)
│   │       ├── file-routes.ts       # REST API for file upload/download
│   │       ├── vault-access.ts      # Document access control
│   │       ├── document-registration.ts # Document registration API
│   │       └── diagnostics.ts       # Server diagnostics endpoints
│   └── tests/
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

- `docs/FLINT-OVERVIEW.md` - Design philosophy and core concepts
- `docs/ARCHITECTURE.md` - Electron system architecture documentation
- `docs/FLINT-NOTE-API.md` - Server API documentation
- `docs/LEAN-SYNC-SERVER.md` - Lean sync server architecture and wire protocol

### Source Code

- `src/main/` - Electron main process with AI and note services
- `src/preload/` - Preload scripts for secure IPC
- `src/renderer/` - Svelte UI application
- `src/server/` - Integrated note server with API, database, and core logic

### Sync Server

- `sync-server/` - **Separate Bun project** (not part of the Electron build)
- Runtime: Bun, deployed to Fly.io
- Auth: Bluesky ATProto OAuth with session cookies and invite codes
- DB: SQLite via `bun:sqlite` (`data/flint-sync.db`)
- Dev: `cd sync-server && bun run dev`
- Tests: `cd sync-server && bun test`
- See `docs/LEAN-SYNC-SERVER.md` for full architecture details

#### Lean Sync (WebSocket)

Custom one-doc-at-a-time sync replaces automerge-repo's `Repo` on the server (~800MB → ~1MB peak for 2k notes). Speaks the same CBOR wire protocol as automerge-repo — **client requires zero changes**.

- Uses `Automerge.receiveSyncMessage()` / `generateSyncMessage()` low-level API
- Document cache with 30s TTL and WASM memory management (`Automerge.free()`)
- Per-user per-document locks for concurrent access safety
- Sync state memory cache (write-through to SQLite `sync_states` table)
- Real-time fan-out: changes pushed to all other connections for the same user
- Server-initiated sync: after client's initial burst, server pushes docs the client hasn't synced

#### File Sync (REST)

Content-addressed binary file storage for PDFs, EPUBs, images, webpages:

- `PUT /api/files/:fileType/:hash` — Upload with SHA-256 hash verification
- `GET /api/files/:fileType/:hash` — Download with immutable caching
- `GET /api/files/manifest/:vaultId` — List files for a vault
- Conversation JSON storage at `/api/files/conversation/:vaultId/:conversationId`

#### DB Schema (key tables)

- `vault_access` — Maps users to vault document URLs
- `content_doc_access` — Maps users to content document URLs
- `sync_states` — Persisted Automerge sync states per (user, doc, peer)
- `file_metadata` — Content-addressed file registry
- `conversation_metadata` — Conversation file registry
- `sessions`, `allowed_users`, `invite_codes` — Auth tables

### Website

- `website/` - Static website directory (deployed to Cloudflare Pages)
  - `index.html` - Main landing page

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

- we currently have users so make sure to handle backward compatibility or migration concerns

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

## Automerge Object Cloning Guidelines

**CRITICAL: Always use `clone()` when assigning objects inside `docHandle.change()` blocks**

- Automerge documents use proxies internally. When you try to insert an object that already exists in an Automerge document into another location, you get: `RangeError: Cannot create a reference to an existing document object`
- Use the `clone()` and `cloneIfObject()` utilities from `./utils` to create fresh plain objects
- **Error symptoms**: "Cannot create a reference to an existing document object" during state mutations
- **Standard pattern**:

  ```typescript
  import { clone, cloneIfObject } from './utils';

  // ❌ WRONG - Direct assignment may reference existing document objects
  docHandle.change((doc) => {
    doc.config = externalConfig;
    doc.items = externalItems;
  });

  // ✅ CORRECT - Use clone() for objects/arrays
  docHandle.change((doc) => {
    doc.config = clone(externalConfig);
    doc.items = clone(externalItems);
  });

  // ✅ CORRECT - Use cloneIfObject() in loops with mixed types
  for (const [key, value] of Object.entries(props)) {
    note.props[key] = cloneIfObject(value);
  }

  // ✅ OK - Spread for simple string arrays (primitives don't need cloning)
  doc.tags = [...externalTags];
  ```

- when planning migrations or breaking changes don't use progressive rollout strategy since we don't have that capability yet
- we we need to deal with breaking changes to the DB schema we have version aware migration code in the migration-manager
- do not try to run the app (e.g. npm run dev). ask the user to run it if you need to check something

## Web App & Mobile Guidelines

The app runs both as an Electron desktop app and as a web app (PWA). The web version has additional mobile/touch considerations:

### Platform Detection

- `src/renderer/src/lib/platform.svelte.ts` - `isWeb()` detects web vs Electron
- `src/renderer/src/stores/deviceState.svelte.ts` - Reactive viewport detection:
  - `isMobile`: < 768px
  - `isTablet`: 768px - 1024px
  - `isDesktop`: > 1024px
  - `useMobileLayout`: Combines mobile detection for UI decisions

### Mobile Drawer Pattern

On mobile, the sidebar is a full-screen drawer that slides in from the left:

- Sidebar renders outside `app-layout` on mobile (avoids CSS transform issues with `position: fixed`)
- Main content slides right to reveal sidebar underneath
- Edge swipe from left opens drawer (when closed)
- Selecting an item auto-closes drawer

**Key files**:

- `src/renderer/src/stores/sidebarState.svelte.ts` - `mobileDrawerOpen` state
- `src/renderer/src/lib/gestures.svelte.ts` - Touch swipe utilities
- `src/renderer/src/components/MainView.svelte` - Mobile layout integration

### Touch Interaction Guidelines

- **Long-press to drag**: On mobile, drag-to-reorder requires 300ms long-press (allows normal scrolling)
- **Prevent native menus**: Use `-webkit-touch-callout: none` and document-level `contextmenu` prevention
- **No tap highlight**: Use `-webkit-tap-highlight-color: transparent`
- **Hover states**: Wrap in `@media (hover: hover)` to avoid sticky hover on touch
- **Active states**: Prevent flash with `@media (hover: none) { .item:active { background: transparent } }`
- **Always-visible controls**: Show action buttons (like "...") always on touch devices

### Safe Area Handling

For notch/dynamic island support:

- Viewport: `<meta name="viewport" content="..., viewport-fit=cover">`
- CSS variables: `--safe-area-top`, `--safe-area-bottom`, etc. (defined in base.css)
- Apply padding to full-screen elements: `padding-top: var(--safe-area-top, 0px)`
- Dynamic theme-color: Update `<meta name="theme-color">` based on visible content

### Mobile-Specific CSS Patterns

```css
/* Only show hover on devices with hover capability */
@media (hover: hover) {
  .item:hover {
    background: var(--bg-hover);
  }
}

/* Prevent :active flash on touch */
@media (hover: none) {
  .item:active {
    background: transparent;
  }
}

/* Always show controls on touch devices */
@media (hover: none) {
  .action-button {
    display: flex;
  }
}
```

### Key Mobile Components

- `src/renderer/src/components/MobileFAB.svelte` - Context-sensitive floating action button
- `src/renderer/src/components/MobileDrawer.svelte` - Drawer wrapper component
- `src/renderer/src/stores/deviceState.svelte.ts` - Device/viewport detection
