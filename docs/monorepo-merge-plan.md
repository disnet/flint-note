# Flint-Server to Electron App Merge Plan

## Overview

This document outlines the plan to merge the flint-server package into the electron app and eliminate the monorepo structure. This will simplify the build process and resolve electron-builder compatibility issues.

## Current Structure Analysis

**Current Dependencies:**

- Electron app depends on `@flint-note/server` as a workspace dependency
- 35+ import statements from various server modules
- Server has its own dependencies: `@modelcontextprotocol/sdk`, `js-yaml`, `sqlite3`
- Distinct build processes and configurations

**Current Monorepo Structure:**

```
flint-ui/
├── package.json                 # Root workspace configuration
├── packages/
│   ├── electron-app/           # @flint-note/electron-app
│   └── flint-server/           # @flint-note/server
```

## Target Structure

After the merge, the project will have a single package structure:

```
flint-ui/
├── package.json                # Single package configuration
├── src/
│   ├── main/                   # Existing Electron main process
│   ├── preload/                # Existing preload scripts
│   ├── renderer/               # Existing Svelte UI
│   └── server/                 # NEW: Merged flint-server code
│       ├── api/                # From packages/flint-server/src/api/
│       ├── core/               # From packages/flint-server/src/core/
│       ├── database/           # From packages/flint-server/src/database/
│       ├── server/             # From packages/flint-server/src/server/
│       ├── types/              # From packages/flint-server/src/types/
│       └── utils/              # From packages/flint-server/src/utils/
├── test/                       # Consolidated tests
├── docs/                       # Existing documentation
└── [other config files]        # Build configs, etc.
```

## Implementation Steps

### 1. Directory Structure Changes

1. **Move electron app to root:**
   - Move `packages/electron-app/*` to root level
   - Move `packages/electron-app/src/*` to `src/`

2. **Merge server code:**
   - Copy `packages/flint-server/src/` to `src/server/`
   - Preserve directory structure within server

3. **Consolidate tests:**
   - Move `packages/flint-server/test/` to `test/server/`
   - Move `packages/electron-app/src/test/` to `test/app/`

### 2. Package.json Consolidation

**Dependencies to merge from flint-server:**

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "js-yaml": "^4.1.0",
    "sqlite3": "^5.1.7"
  },
  "devDependencies": {
    "@types/js-yaml": "^4.0.0",
    "@types/sqlite3": "^3.1.11",
    "tsx": "^4.20.3"
  }
}
```

**Scripts to consolidate:**

- Merge build, dev, test, and utility scripts
- Remove workspace-specific commands
- Update paths to reflect new structure

### 3. Import Path Updates

Replace all `@flint-note/server` imports with relative paths:

**Files requiring updates (~35+ locations):**

- `src/preload/index.ts`
- `src/main/tool-service.ts`
- `src/main/index.ts`
- `src/main/note-service.ts`
- `src/renderer/src/services/electronChatService.ts`
- `src/renderer/src/services/types.ts`
- `src/renderer/src/env.d.ts`
- `src/renderer/src/components/TypeInfoOverlay.svelte`
- `src/renderer/src/components/NoteEditor.svelte`
- `src/renderer/src/components/VaultSwitcher.svelte`

**Example transformations:**

```typescript
// Before
import { FlintNoteApi } from '@flint-note/server/dist/api';
import type { Note } from '@flint-note/server';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

// After
import { FlintNoteApi } from '../server/api';
import type { Note } from '../server/types';
import type { MetadataSchema } from '../server/core/metadata-schema';
```

### 4. Build Configuration Updates

**TypeScript Configuration:**

- Update `tsconfig.json` to include server source paths
- Remove workspace references
- Consolidate type checking for all source

**Electron-Vite Configuration:**

- Update `electron.vite.config.ts` to handle server code compilation
- Ensure server code is properly bundled with main process

**Build Scripts:**

- Remove prebuild workspace dependencies
- Update build pipeline to compile server alongside app
- Ensure proper output directory structure

### 5. Test Configuration Updates

**Test Setup:**

- Consolidate test configurations from both packages
- Update test imports to use new relative paths
- Merge test utilities and helpers
- Update test scripts in package.json

**Test Structure:**

```
test/
├── app/                    # Former electron-app tests
│   ├── config/
│   └── lib/
├── server/                 # Former flint-server tests
│   ├── unit/
│   └── integration/
└── shared/                 # Common test utilities
```

### 6. Root Directory Cleanup

1. **Remove monorepo artifacts:**
   - Delete `packages/` directory
   - Remove workspace configuration from any remaining package.json
   - Clean up workspace-specific scripts

2. **Update documentation:**
   - Update CLAUDE.md to reflect new structure
   - Update any references to workspace commands
   - Update development documentation

## Benefits of This Approach

1. **Simplified Build Process**: Single package.json and build pipeline
2. **Electron Builder Compatibility**: Eliminates workspace-related issues
3. **Easier Development**: All code in one place with consistent tooling
4. **Reduced Complexity**: No workspace dependency management
5. **Better IDE Support**: Single project root for better IntelliSense

## Potential Challenges

1. **Import Path Updates**: ~35+ files need import path changes
2. **Build Configuration**: TypeScript/Vite configs need adjustment
3. **Test Setup**: Test configurations need consolidation
4. **Dependency Conflicts**: Need to resolve any version mismatches
5. **Git History**: Server code history will be preserved but moved

## Validation Steps

After implementation:

1. **Build Verification:**
   - `npm run build` succeeds
   - `npm run dev` works correctly
   - Electron app launches and functions

2. **Type Checking:**
   - `npm run typecheck` passes
   - No import resolution errors
   - All type exports accessible

3. **Testing:**
   - All existing tests continue to pass
   - Test scripts work with new structure
   - Coverage reports generate correctly

4. **Functionality:**
   - Server API functionality intact
   - Electron-server communication works
   - All UI features operational

## Timeline

This is a structural refactoring that should preserve all existing functionality while simplifying the project organization.
