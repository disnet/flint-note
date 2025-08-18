# Migration Plan: Moving @flint-note/server to NPM Workspaces

## ✅ MIGRATION STATUS: PHASES 1-5 COMPLETE

**Completed:** Repository Setup, Server Import, Electron App Migration, TypeScript Integration, and Build System Updates  
**Next:** Documentation & Testing

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

---

## ✅ IMPLEMENTATION PROGRESS

### ✅ Phase 1: Repository Setup (COMPLETED)

**Status:** ✅ Complete  
**Date:** August 18, 2025

#### Completed Tasks:
1. ✅ **Root package.json converted to workspaces**
   - Changed name from `flint-electron` to `flint-monorepo`
   - Added `workspaces: ["packages/*"]`
   - Removed all application dependencies from root
   - Kept minimal dev dependencies (prettier, typescript)

2. ✅ **Directory structure created**
   - Created `packages/` directory
   - All app files moved to `packages/electron-app/`

3. ✅ **TypeScript configuration updated**
   - Root tsconfig.json configured with project references
   - Workspace-specific tsconfig.json files created

### ✅ Phase 2: Server Import (COMPLETED)

**Status:** ✅ Complete  
**Date:** August 18, 2025  

#### Completed Tasks:
1. ✅ **@flint-note/server source imported**
   - Server source code copied to `packages/flint-server/`
   - Package name kept as `@flint-note/server` (maintaining namespace consistency)
   - All existing build structure preserved

2. ✅ **Server builds successfully**
   - TypeScript compilation working
   - `dist/` output directory structure maintained
   - All type definitions generated correctly

### ✅ Phase 3: Electron App Migration (COMPLETED)

**Status:** ✅ Complete  
**Date:** August 18, 2025

#### Completed Tasks:
1. ✅ **Electron app package configuration**
   - Package renamed to `@flint-note/electron-app`
   - All original dependencies preserved
   - Workspace dependency added: `"@flint-note/server": "file:../flint-server"`

2. ✅ **Import statements preserved**
   - **Decision:** Kept all imports as `@flint-note/server` (no changes needed)
   - Maintaining namespace consistency across the monorepo
   - All 70+ import statements work without modification

3. ✅ **Workspace dependency resolution working**
   - `npm install` successful with local file dependencies
   - TypeScript compilation successful across both packages
   - Build process working for both packages

#### Current Working Structure:
```
flint-ui/
├── package.json (flint-monorepo, workspaces enabled)
├── packages/
│   ├── electron-app/          # @flint-note/electron-app
│   │   ├── package.json       # depends on @flint-note/server via file:../flint-server
│   │   ├── src/
│   │   └── ... (all app files)
│   └── flint-server/          # @flint-note/server
│       ├── package.json       # local workspace package
│       ├── src/
│       ├── dist/              # built output
│       └── ... (server source)
└── docs/
```

#### Verified Working Features:
- ✅ **Cross-package builds:** `npm run build` builds both packages
- ✅ **Type checking:** `npm run typecheck` validates both packages  
- ✅ **Dependency resolution:** Electron app correctly imports from local server
- ✅ **Development workflow:** Server changes immediately available to app

### ✅ Phase 4: TypeScript Integration (COMPLETED)

**Status:** ✅ Complete  
**Date:** August 18, 2025

#### Completed Tasks:
1. ✅ **Set up project references between packages**
   - Root tsconfig.json already had project references configured
   - Updated flint-server tsconfig.json to extend root configuration
   - Verified electron-app references flint-server correctly

2. ✅ **Configure composite builds**
   - Added `composite: true` and `incremental: true` to flint-server tsconfig.json
   - Maintained existing composite builds in electron-app configs
   - Fixed rootDir conflict with test files by removing explicit rootDir

3. ✅ **Test incremental compilation**
   - Verified `tsc --build` correctly detects changed files
   - Confirmed build order respects project dependencies
   - Tested clean and rebuild cycle works correctly

4. ✅ **Optimize TypeScript build performance**
   - Added optimized build scripts to root package.json:
     - `build:tsc`: Efficient incremental builds with `tsc --build`
     - `build:clean`: Clean all build outputs
     - `typecheck:incremental`: Dry-run to check what would build
   - All packages support incremental compilation with .tsbuildinfo files

### ✅ Phase 5: Build System Updates (COMPLETED)

**Status:** ✅ Complete  
**Date:** August 18, 2025

#### Completed Tasks:
1. ✅ **Updated root build scripts for better workspace orchestration**
   - Added sequential build command: `npm run build` (server → app)
   - Added individual package builds: `build:server`, `build:app`
   - Added parallel build option: `build:parallel`
   - Enhanced clean operations with `build:clean`, `clean:all`

2. ✅ **Configured build dependencies (server before app)**
   - Root `build` script ensures server builds before app
   - Added `prebuild` script to electron-app package.json
   - `build:app` script automatically builds server first

3. ✅ **Set up parallel development workflow**
   - Added `dev:parallel` for concurrent development
   - Added `dev:watch` for build-then-develop workflow
   - Individual dev scripts: `dev:server`, `dev:app`
   - Maintained sequential `dev` script for primary workflow

4. ✅ **Added workspace-specific clean scripts**
   - Individual clean scripts: `clean:server`, `clean:app`
   - Enhanced `clean:all` for comprehensive cleanup
   - Added `clean:modules` for dependency cleanup
   - Updated electron-app with proper clean script

#### Enhanced Build Scripts Available:
```json
{
  "build": "server → app (sequential)",
  "build:server": "build server only", 
  "build:app": "build server then app",
  "build:parallel": "build both concurrently",
  "dev": "build server → run app dev",
  "dev:parallel": "run both dev modes",
  "dev:watch": "build server → run parallel dev",
  "clean:server": "clean server build artifacts",
  "clean:app": "clean app build artifacts", 
  "clean:all": "clean all build artifacts",
  "clean:modules": "clean all node_modules"
}
```

### 📋 Phase 6: Documentation & Testing (PENDING)

**Status:** 📋 Pending

#### Remaining Tasks:
- [ ] Update README with new development setup
- [ ] Update CLAUDE.md with new commands
- [ ] Test all existing functionality
- [ ] Document the monorepo structure
- [ ] Validate development workflow

---

## Current Benefits Achieved

### ✅ Development Efficiency
- **Single Repository:** All related code now in one place
- **Unified Dependencies:** Shared node_modules reduces disk usage
- **Type Safety:** Direct local package references working
- **Immediate Changes:** Server modifications immediately available to app

### ✅ Maintenance Benefits  
- **Synchronized Development:** Both packages can be developed together
- **Consistent Tooling:** Same formatting and basic build tools
- **Atomic Changes:** Single commit can update both server and client

### ✅ Technical Benefits
- **Working Workspace Dependencies:** Local file: protocol functioning correctly
- **Preserved Import Paths:** No breaking changes to existing codebase
- **Build Compatibility:** All existing build processes still work
- **Type Checking:** Cross-package type validation working

## Next Steps

1. **Complete Phase 6:** Update documentation and validate entire workflow
2. **Optional:** Consider adding package for shared types/utilities if needed

The core migration is **functionally complete** - both packages build, type-check, and work together as a monorepo with enhanced build system orchestration. Only documentation and testing validation remains.