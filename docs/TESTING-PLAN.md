# Testing Plan for Flint UI

## Overview

This document outlines a strategic testing plan for the Flint UI application. Given that the UI is still under development, we're focusing on testing stable, pure utility functions and business logic components rather than deep end-to-end testing.

## Current State Analysis

**No existing test infrastructure found:**

- No test files in the codebase
- No testing framework configured (Jest, Vitest, etc.)
- No test scripts in package.json

## Testing Strategy

### Phase 1: Foundation & Pure Functions (Start Here)

Focus on testing utility functions and business logic that have minimal dependencies and stable interfaces.

#### High-Value Targets:

1. **Cost Utilities** (`src/renderer/src/lib/costUtils.svelte.ts`)
   - Pure mathematical functions for micro-cent conversions
   - Critical for financial accuracy
   - Easy to test with predictable inputs/outputs

2. **Wikilink Parser** (`src/renderer/src/lib/wikilinks.svelte.ts`)
   - Complex parsing logic with clear test cases
   - Core functionality for note linking
   - Can test `parseWikilinks()` and `findNoteByIdentifier()` functions

3. **Model Store Logic** (`src/renderer/src/stores/modelStore.svelte.ts`)
   - Business logic for model selection and validation
   - Local storage interaction can be mocked

### Phase 2: Service Layer Testing

Once foundation is established, move to service layer components:

1. **Note Navigation Service** (`src/renderer/src/services/noteNavigationService.svelte.ts`)
   - Business rules for note opening and tab management
   - Clear state transitions to test

2. **Note Service** (`src/main/note-service.ts`)
   - API wrapper with initialization logic
   - Can test with mocked Flint API

### Phase 3: Component Integration (Future)

When UI stabilizes, add component testing for:

1. **Search Components** (SearchBar, SearchOverlay)
2. **Note Editor Components**
3. **Sidebar Components**

## Recommended Testing Framework

**Vitest** is recommended because:

- Excellent TypeScript support
- Fast execution with Vite
- Compatible with existing Electron/Vite setup
- Good mocking capabilities for Svelte runes
- Similar API to Jest for easy adoption

## Implementation Plan

### Step 1: Setup Testing Infrastructure

```bash
npm install --save-dev vitest @vitest/ui jsdom @testing-library/svelte
```

Add to `package.json`:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts']
  }
});
```

### Step 2: Start with Cost Utils Tests

Create `src/test/lib/costUtils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  microCentsToDollars,
  formatCostFromMicroCents,
  dollarsToMicroCents
} from '../../renderer/src/lib/costUtils.svelte';

describe('costUtils', () => {
  describe('microCentsToDollars', () => {
    it('should convert micro-cents to dollars correctly', () => {
      expect(microCentsToDollars(1_000_000)).toBe(1);
      expect(microCentsToDollars(123_456)).toBe(0.123456);
    });
  });

  // More tests...
});
```

### Step 3: Test Wikilink Parser

Create tests for:

- Basic wikilink parsing `[[Note Title]]`
- Pipe syntax parsing `[[id|Display Title]]`
- Note existence checking
- Edge cases (empty brackets, malformed links)

### Step 4: Test Model Store

Create tests for:

- Model selection validation
- Local storage persistence
- Invalid model handling

## Testing Guidelines

### Best Practices:

1. **Test behavior, not implementation** - Focus on what functions do, not how
2. **Mock external dependencies** - File system, APIs, local storage
3. **Test edge cases** - Empty inputs, invalid data, error conditions
4. **Keep tests isolated** - Each test should be independent
5. **Use descriptive test names** - Make failures easy to understand

### What NOT to Test (Initially):

1. **Svelte component rendering** - UI is still changing rapidly
2. **Electron main process** - Complex setup, better tested later
3. **AI service integration** - External dependencies, integration concerns
4. **File system operations** - Better suited for integration tests

## Success Metrics

### Phase 1 Success:

- [ ] Testing framework configured and running
- [ ] 90%+ test coverage for cost utilities
- [ ] Comprehensive wikilink parser tests
- [ ] Model store business logic tests
- [ ] CI integration (run tests on commit)

### Phase 2 Success:

- [ ] Service layer components tested
- [ ] Mocking strategy established for complex dependencies
- [ ] Test coverage reporting configured

## Benefits of This Approach

1. **Immediate Value** - Catch bugs in critical financial calculations
2. **Confidence** - Tests provide safety net for refactoring
3. **Documentation** - Tests serve as usage examples
4. **Foundation** - Establishes testing culture and practices
5. **Gradual Expansion** - Can grow testing coverage as UI stabilizes

## Maintenance Strategy

- Run tests on every commit (GitHub Actions)
- Require tests for new utility functions
- Review test coverage monthly
- Update tests when business logic changes
- Add component tests as UI patterns stabilize

This plan provides a solid foundation for testing while respecting the current development phase and avoiding premature testing of rapidly changing UI components.
