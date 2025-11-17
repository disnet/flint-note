# Getting Started with Flint Development

Welcome to Flint! This guide will help you set up your development environment and understand the codebase structure.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Project Structure Overview](#project-structure-overview)
- [Development Workflow](#development-workflow)
- [Understanding the Architecture](#understanding-the-architecture)
- [Making Your First Changes](#making-your-first-changes)
- [Testing](#testing)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ installed
- **npm** 9+ (comes with Node.js)
- **Git** for version control
- A code editor (VS Code recommended)
- Basic knowledge of:
  - TypeScript
  - Svelte (Svelte 5 preferred)
  - Electron basics

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd flint-ui
```

### 2. Install Dependencies

```bash
npm install
```

This will install all dependencies for the Electron app and the integrated note server.

### 3. Verify Installation

```bash
# Run type checking
npm run typecheck

# Run linting
npm run lint

# Run tests
npm run test:run
```

If all commands pass, you're ready to develop!

### 4. Start Development Server

```bash
npm run dev
```

This will:

1. Start the Electron application in development mode
2. Enable hot reload for the Svelte UI
3. Watch for changes in main process code

## Project Structure Overview

### High-Level Organization

```
flint-ui/
├── src/
│   ├── main/          # Electron main process (Node.js)
│   ├── preload/       # IPC bridge (secure)
│   ├── renderer/      # Svelte UI (browser)
│   └── server/        # Note server library
├── tests/             # Vitest test suite
├── docs/              # Documentation
└── out/               # Build output (gitignored)
```

### Main Process (`src/main/`)

The main process is the heart of the Electron application:

**Key Files:**

- `index.ts` - Application entry point, window management, IPC handlers
- `ai-service.ts` - AI integration via Model Context Protocol
- `note-service.ts` - Note CRUD operations wrapper
- `tool-service.ts` - Agent tool system
- `workflow-service.ts` - Workflow automation
- `storage-service.ts` - Base file storage
- `secure-storage-service.ts` - API key management
- `vault-data-storage-service.ts` - Vault-specific data
- `settings-storage-service.ts` - Global settings

**Service Initialization Order:**

1. Note Service
2. Secure Storage Service
3. AI Service (depends on Note Service and Secure Storage)
4. Tool Service (depends on AI Service)
5. Workflow Service

### Preload (`src/preload/`)

The preload script creates a secure bridge between main and renderer:

- **Security**: Uses `contextBridge` to expose limited API
- **Type Safety**: Provides TypeScript interfaces
- **IPC Methods**: Exposes all backend functionality to renderer

### Renderer (`src/renderer/src/`)

The Svelte 5 UI application:

**Directory Structure:**

```
renderer/src/
├── components/        # Svelte components
├── stores/           # Reactive state management
├── services/         # Frontend service layer
├── utils/            # Utility functions
├── assets/           # CSS, fonts, images
├── config/           # Configuration files
└── lib/              # Shared libraries
```

**Key Components:**

- `App.svelte` - Root component
- `LeftSidebar.svelte` - Navigation
- `MainView.svelte` - Note editor
- `RightSidebar.svelte` - AI assistant
- `Agent.svelte` - Chat interface
- `CodeMirrorEditor.svelte` - Note editor

**Key Stores (Svelte 5 Runes):**

- `notesStore.svelte.ts` - Note data (not persisted)
- `activeNoteStore.svelte.ts` - Active note tracking
- `unifiedChatStore.svelte.ts` - AI conversations
- `temporaryTabsStore.svelte.ts` - Arc-style tabs
- `workflowStore.svelte.ts` - Workflow state
- `customFunctionsStore.svelte.ts` - User-defined functions
- `settingsStore.svelte.ts` - App settings
- `modelStore.svelte.ts` - AI model selection

### Server (`src/server/`)

The integrated note server library:

```
server/
├── api/              # FlintNoteApi class
├── core/             # Core business logic
│   ├── note-manager.ts
│   ├── note-type-manager.ts
│   └── workspace-manager.ts
├── database/         # SQLite operations
└── types/            # TypeScript definitions
```

## Development Workflow

### Modern Svelte 5 Patterns

Flint uses Svelte 5's latest features. Here are the key patterns:

#### Runes for State Management

```typescript
// ✅ Correct - Modern Svelte 5
let count = $state(0);
let doubled = $derived(count * 2);

$effect(() => {
  console.log('Count changed:', count);
});

// ❌ Avoid - Legacy Svelte 4
import { writable } from 'svelte/store';
const count = writable(0);
```

#### Props

```typescript
// ✅ Correct - Modern Svelte 5
let { activeNote, onClose }: Props = $props();

// ❌ Avoid - Legacy Svelte 4
export let activeNote;
export let onClose;
```

#### Event Handlers

```typescript
// ✅ Correct - Native events
<button onclick={handleClick}>Click</button>

// ❌ Avoid - Legacy syntax
<button on:click={handleClick}>Click</button>
```

#### Events via Props (No Event Dispatchers)

```typescript
// ✅ Correct - Props for callbacks
interface Props {
  onSave: (data: string) => void;
}

let { onSave }: Props = $props();

// ❌ Avoid - createEventDispatcher
import { createEventDispatcher } from 'svelte';
const dispatch = createEventDispatcher();
```

### IPC Communication

Always use `$state.snapshot()` when sending reactive data through IPC:

```typescript
// ✅ Correct
const data = $state({ notes: [], active: null });
await window.api?.saveData($state.snapshot(data));

// ❌ Wrong - Will fail with "object could not be cloned"
await window.api?.saveData(data);
```

### File Naming Conventions

- **Svelte Components**: `ComponentName.svelte`
- **TypeScript Files**: `fileName.ts`
- **Svelte TypeScript Files**: `fileName.svelte.ts` (can use runes)
- **Test Files**: `fileName.test.ts` or `fileName.spec.ts`

### Code Style

Always format before committing:

```bash
npm run format
```

This ensures consistent code style across the project.

## Understanding the Architecture

### Data Flow

```
┌─────────────────────────────────────────────────┐
│            Renderer Process (Svelte)            │
│  ┌──────────┐  ┌────────┐  ┌─────────────────┐ │
│  │Components│→ │ Stores │→ │ Frontend Services│ │
│  └──────────┘  └────────┘  └─────────────────┘ │
└───────────────────────┬─────────────────────────┘
                        │ IPC (via preload)
                        ▼
┌─────────────────────────────────────────────────┐
│            Main Process (Node.js)               │
│  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  IPC Handlers│→ │ Services (AI, Note, etc.)│ │
│  └──────────────┘  └──────────────────────────┘ │
└───────────────────────┬─────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────┐
│              External Services                  │
│  ┌──────────────┐  ┌───────────┐  ┌──────────┐ │
│  │ AI Providers │  │ File System│  │  SQLite  │ │
│  └──────────────┘  └───────────┘  └──────────┘ │
└─────────────────────────────────────────────────┘
```

### State Persistence

All application state is persisted to the file system:

**File System Structure:**

```
{userData}/
├── secure/                    # Encrypted API keys
├── settings/                  # Global settings
│   ├── app-settings.json
│   ├── model-preferences.json
│   └── slash-commands.json
└── vault-data/               # Vault-specific data
    ├── default/
    │   ├── conversations.json
    │   ├── temporary-tabs.json
    │   └── active-note.json
    └── vault-{id}/
        └── ...
```

**Store Pattern:**

```typescript
class PersistedStore {
  private data = $state(defaultData);
  private isLoading = $state(true);

  constructor() {
    this.initialize();
  }

  private async initialize() {
    this.isLoading = true;
    const stored = await window.api?.loadData();
    if (stored) this.data = stored;
    this.isLoading = false;
  }

  async update(newData) {
    this.data = newData;
    await window.api?.saveData($state.snapshot(newData));
  }
}
```

## Making Your First Changes

### Example: Adding a New UI Component

1. **Create the component**

```bash
touch src/renderer/src/components/MyNewComponent.svelte
```

2. **Implement using Svelte 5**

```svelte
<script lang="ts">
  interface Props {
    title: string;
    onAction: () => void;
  }

  let { title, onAction }: Props = $props();
  let count = $state(0);
</script>

<div class="my-component">
  <h2>{title}</h2>
  <p>Count: {count}</p>
  <button onclick={() => count++}>Increment</button>
  <button onclick={onAction}>Action</button>
</div>

<style>
  .my-component {
    padding: 1rem;
  }
</style>
```

3. **Use in parent component**

```svelte
<script lang="ts">
  import MyNewComponent from './MyNewComponent.svelte';
</script>

<MyNewComponent title="Hello" onAction={() => console.log('Action!')} />
```

### Example: Adding an IPC Handler

1. **Add handler in main process** (`src/main/index.ts`)

```typescript
ipcMain.handle('my-new-operation', async (_event, data: string) => {
  // Process data
  const result = await someService.process(data);
  return result;
});
```

2. **Expose in preload** (`src/preload/index.ts`)

```typescript
const api = {
  // ... existing methods
  myNewOperation: (data: string): Promise<Result> =>
    ipcRenderer.invoke('my-new-operation', data)
};
```

3. **Use in renderer**

```typescript
const result = await window.api?.myNewOperation('some data');
```

## Testing

Flint uses **Vitest** for testing:

### Running Tests

```bash
# Watch mode (interactive)
npm run test

# Single run with coverage
npm run test:run
```

### Writing Tests

Tests are located in `tests/` directory:

```typescript
// tests/server/core/note-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NoteManager } from '../../../src/server/core/note-manager';

describe('NoteManager', () => {
  let noteManager: NoteManager;

  beforeEach(async () => {
    // Setup isolated test environment
    noteManager = new NoteManager(testWorkspace);
    await noteManager.initialize();
  });

  it('should create a note', async () => {
    const note = await noteManager.createNote({
      type: 'general',
      title: 'test-note',
      content: '# Test'
    });

    expect(note.id).toBe('general/test-note.md');
    expect(note.title).toBe('test-note');
  });
});
```

### Test Utilities

- `TestApiSetup` - Provides isolated test environments
- Automatic cleanup of temporary files and databases
- Global test functions (no imports needed)

## Common Tasks

### Adding a New Feature

1. **Plan the feature** - Document in `docs/` if significant
2. **Create necessary files** - Components, stores, services
3. **Implement backend** - Add services, IPC handlers if needed
4. **Implement frontend** - Create UI components
5. **Add tests** - Unit tests for logic, integration tests for flows
6. **Update documentation** - Update relevant docs
7. **Test manually** - Run the app and verify
8. **Run checks** - `npm run check`

### Debugging

#### Renderer Process

Use Chrome DevTools:

- Press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux)
- Or add `debugger;` statements in renderer code

#### Main Process

Add breakpoints in VS Code:

1. Add `"node": ["--inspect=5858"]` to `electron-vite.config.ts`
2. Use VS Code's debugger with Node.js configuration
3. Or use `console.log()` statements

### Managing Database Migrations

When changing the database schema:

1. **Create migration** in `src/server/database/migration-manager.ts`
2. **Increment version number**
3. **Test migration** with existing data
4. **Document breaking changes**

Example migration:

```typescript
{
  version: 5,
  name: 'add-new-column',
  up: async (db) => {
    await db.run('ALTER TABLE notes ADD COLUMN new_field TEXT');
  },
  down: async (db) => {
    // Optional: rollback logic
  }
}
```

### Working with Workflows

Workflows are AI-assisted automation sequences:

**Location:** `src/main/workflow-service.ts`

**Frontend Store:** `src/renderer/src/stores/workflowStore.svelte.ts`

**Example Workflow:**

```typescript
{
  id: 'daily-review',
  name: 'Daily Review',
  description: 'Review and summarize today\'s notes',
  steps: [
    { type: 'search', query: 'created:today' },
    { type: 'ai-process', instruction: 'Summarize these notes' },
    { type: 'create-note', type: 'summary' }
  ]
}
```

### Custom Functions

Users can define JavaScript functions for AI agents:

**Location:** `src/main/tool-service.ts`

**Frontend Store:** `src/renderer/src/stores/customFunctionsStore.svelte.ts`

Functions are evaluated in a secure sandbox using QuickJS.

## Troubleshooting

### Build Errors

**Problem:** TypeScript errors after pulling changes

```bash
# Clean and reinstall
npm run clean
rm -rf node_modules
npm install
```

**Problem:** Electron won't start

```bash
# Rebuild native modules
npm rebuild
```

### Runtime Issues

**Problem:** IPC methods not working

- Check preload script exposes the method
- Verify IPC handler exists in main process
- Check for typos in method names

**Problem:** State not persisting

- Ensure you're using `$state.snapshot()` for IPC
- Check file permissions in userData directory
- Verify storage service is initialized

**Problem:** AI features not working

- Check API keys are set in settings
- Verify MCP server is running (check logs)
- Ensure note service initialized before AI service

### Getting Help

1. **Check documentation** - `docs/` directory
2. **Read code comments** - Many files have detailed comments
3. **Search issues** - GitHub issues may have answers
4. **Ask questions** - GitHub Discussions or team chat

## Next Steps

Now that you're set up:

1. **Explore the codebase** - Read through key files mentioned above
2. **Read architecture docs** - `docs/architecture/` directory
3. **Try making small changes** - Fix a bug or add a small feature
4. **Read existing code** - Learn patterns from well-written components
5. **Contribute** - Pick up an issue labeled "good first issue"

## Additional Resources

- **[FEATURES.md](FEATURES.md)** - Detailed feature documentation
- **[Architecture](architecture/ARCHITECTURE.md)** - System architecture
- **[Design](architecture/DESIGN.md)** - UI design guidelines
- **[FlintNote API](architecture/FLINT-NOTE-API.md)** - Server API reference
- **[Svelte 5 Docs](https://svelte.dev/docs)** - Official Svelte documentation
- **[Electron Docs](https://www.electronjs.org/docs)** - Official Electron documentation

---

Welcome to Flint development! We're excited to have you here. 🎉
