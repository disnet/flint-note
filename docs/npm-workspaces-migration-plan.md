# Migration Plan: Moving @flint-note/server to NPM Workspaces

## Current State Analysis

### Current Dependency Usage
The project currently depends on `@flint-note/server@^0.10.2` as an external npm package with extensive usage across:

- **Main Process** (`src/main/`): 26 import statements across 3 files
- **Preload** (`src/preload/`): 13 import statements across 2 files  
- **Renderer** (`src/renderer/`): 31 import statements across 4 files

**Key Import Patterns:**
- Core types: `Note`, `NoteMetadata`, `FlintNoteApi`
- API types from `/dist/api/types`
- Core functionality from `/dist/core/`
- Database types from `/dist/database/`
- Server types from `/dist/server/types`

## Migration Strategy

### Phase 1: Repository Setup

#### 1.1 Convert Root to Workspaces
```json
// package.json modifications
{
  "name": "flint-monorepo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  // Remove @flint-note/server dependency
  "dependencies": {
    // ... other deps (remove @flint-note/server)
  }
}
```

#### 1.2 Restructure Project Layout
```
flint-ui/
├── package.json (workspace root)
├── packages/
│   ├── electron-app/          # Current flint-electron app
│   │   ├── package.json
│   │   ├── src/
│   │   ├── electron.vite.config.ts
│   │   └── ... (all current app files)
│   └── flint-server/          # @flint-note/server source
│       ├── package.json
│       ├── src/
│       ├── dist/             # Built output
│       └── ... (server source)
├── tsconfig.json              # Root TypeScript config
└── docs/
```

### Phase 2: Move @flint-note/server Source

#### 2.1 Import Server Source
- Clone/copy the @flint-note/server source code to `packages/flint-server/`
- Maintain the existing build structure to minimize import changes
- Preserve the `/dist/` output directory structure

#### 2.2 Update Server Package Configuration
```json
// packages/flint-server/package.json
{
  "name": "@flint/server",
  "version": "0.10.2",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  // ... existing dependencies
}
```

### Phase 3: Update Electron App

#### 3.1 Move App to Workspace
```json
// packages/electron-app/package.json
{
  "name": "@flint/electron-app",
  "version": "1.0.0",
  "dependencies": {
    "@flint/server": "workspace:*",
    // ... other existing dependencies
  }
}
```

#### 3.2 Update Import Paths
Replace all import statements:
```typescript
// Before
import { FlintNoteApi } from '@flint-note/server/dist/api';
import type { Note } from '@flint-note/server';

// After  
import { FlintNoteApi } from '@flint/server/dist/api';
import type { Note } from '@flint/server';
```

### Phase 4: TypeScript Configuration

#### 4.1 Root TypeScript Config
```json
// tsconfig.json
{
  "compilerOptions": {
    "composite": true,
    "incremental": true,
    "target": "ES2020",
    "module": "commonjs",
    "declaration": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "references": [
    { "path": "./packages/flint-server" },
    { "path": "./packages/electron-app" }
  ]
}
```

#### 4.2 Package TypeScript Configs
```json
// packages/flint-server/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}

// packages/electron-app/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "references": [
    { "path": "../flint-server" }
  ],
  // ... existing electron-specific config
}
```

### Phase 5: Build System Updates

#### 5.1 Root Build Scripts
```json
// Root package.json
{
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "dev": "npm run dev --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "typecheck": "tsc --build",
    "clean": "npm run clean --workspaces --if-present"
  }
}
```

#### 5.2 Update Electron Build
```json
// packages/electron-app/package.json
{
  "scripts": {
    "prebuild": "npm run build --workspace=@flint/server",
    "build": "npm run typecheck && electron-vite build",
    // ... other scripts
  }
}
```

### Phase 6: Development Workflow Updates

#### 6.1 Parallel Development
- Server changes automatically rebuild and reflect in electron app
- Shared TypeScript project references ensure type checking across packages
- Single `npm install` at root manages all dependencies

#### 6.2 IDE Integration
- Update VS Code settings for workspace support
- Configure TypeScript to work with project references
- Set up debugging across packages

## Migration Execution Steps

### Step 1: Backup and Prepare
1. Create feature branch for migration
2. Document current working state
3. Run existing tests to ensure baseline

### Step 2: Repository Restructure
1. Update root `package.json` with workspaces config
2. Create `packages/` directory structure
3. Move current app code to `packages/electron-app/`

### Step 3: Import Server Source
1. Add @flint-note/server source to `packages/flint-server/`
2. Set up build configuration
3. Verify server builds correctly

### Step 4: Update Dependencies
1. Remove @flint-note/server from electron app dependencies
2. Add local workspace dependency `@flint/server`
3. Update all import statements (can be automated with find/replace)

### Step 5: TypeScript Integration
1. Set up project references
2. Configure composite builds
3. Test incremental compilation

### Step 6: Testing and Validation
1. Run all existing tests
2. Verify electron app builds and runs
3. Test development workflow (hot reloading, etc.)

### Step 7: Documentation Updates
1. Update README with new development setup
2. Update CLAUDE.md with new commands
3. Document the monorepo structure

## Benefits of Migration

### Development Efficiency
- **Single Repository**: All related code in one place
- **Unified Dependencies**: Shared node_modules reduces disk usage
- **Type Safety**: Direct TypeScript project references
- **Hot Reloading**: Server changes immediately available to app

### Maintenance Benefits  
- **Synchronized Releases**: Version server and app together
- **Simplified Testing**: Test integration between components easily
- **Consistent Tooling**: Same linting, formatting, and build tools

### Team Collaboration
- **Atomic Changes**: Single PR can update both server and client
- **Shared CI/CD**: Single build pipeline for entire project
- **Easier Debugging**: Full source available for debugging

## Potential Challenges and Mitigations

### Build Complexity
- **Challenge**: Managing build order between packages
- **Mitigation**: Use TypeScript project references and npm workspace build order

### Dependency Management
- **Challenge**: Ensuring consistent versions across packages
- **Mitigation**: Use workspace protocol and shared dependencies in root

### IDE Support
- **Challenge**: TypeScript language server handling large workspace
- **Mitigation**: Configure VS Code workspace settings and exclude patterns

## File Changes Required

### New Files
- Root `tsconfig.json` with project references
- `packages/electron-app/package.json`
- `packages/flint-server/package.json` 
- `packages/flint-server/tsconfig.json`

### Modified Files
- Root `package.json` (add workspaces, remove @flint-note/server dep)
- All TypeScript files with @flint-note/server imports (70+ files)
- Build configuration files
- Documentation files

### File Count Impact
- **Import Updates**: ~70 import statements across 16 files
- **Config Updates**: ~6 configuration files
- **New Structure**: Move ~200 existing files to new package structure

## Timeline Estimate

- **Phase 1-2 (Setup & Import)**: 1-2 days
- **Phase 3-4 (App Migration)**: 1 day  
- **Phase 5-6 (Build & TypeScript)**: 1 day
- **Testing & Documentation**: 1 day

**Total**: 4-5 days for complete migration

## Rollback Strategy

If issues arise during migration:
1. Keep original package.json backed up
2. Use git to revert workspace structure changes
3. Restore @flint-note/server dependency
4. Revert import path changes

The migration maintains the same external API surface, so rollback should be straightforward.