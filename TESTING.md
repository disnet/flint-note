# Testing Guide for Flint Electron

This guide covers how to test the FlintApiService and other components in the Flint Electron application.

## Table of Contents

- [Setup](#setup)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Testing FlintApiService](#testing-flintapiservice)
- [Mock Helpers](#mock-helpers)
- [Integration Tests](#integration-tests)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## Setup

The project uses [Vitest](https://vitest.dev/) as the testing framework, which provides:

- Fast execution with native ES modules support
- TypeScript support out of the box
- Jest-compatible API
- Built-in coverage reporting
- UI for interactive test running

### Configuration

Tests are configured in `vitest.config.ts` with:

- Node.js environment for main process tests
- TypeScript support
- Path aliases for imports
- Coverage reporting with c8
- Global test setup in `src/test/setup.ts`

## Running Tests

### Basic Commands

```bash
# Run all tests once (clean output)
npm test
npm run test:run

# Run tests with detailed output
npm run test:verbose

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run tests in watch mode
npm run test:watch

# Run tests in watch mode with detailed output
npm run test:watch:verbose

# Run tests with UI
npm run test:ui

# Generate coverage report (clean output)
npm run test:coverage

# Check test setup
npm run test:check

# Run specific test file
npx vitest run src/main/services/__tests__/flintApiService.test.ts

# Run tests matching a pattern
npx vitest run --testNamePattern="FlintApiService"
```

### Advanced Test Runner

Use the custom test runner for more control:

```bash
# Run unit tests only (clean output)
npm run test:unit
npx tsx src/test/run-tests.ts unit

# Run unit tests with detailed output
npx tsx src/test/run-tests.ts unit --verbose

# Run integration tests
npm run test:integration
npx tsx src/test/run-tests.ts integration

# Run all tests with coverage
npm run test:all
npx tsx src/test/run-tests.ts all --coverage

# Run tests with pattern matching
npx tsx src/test/run-tests.ts --pattern "search"

# Check test setup
npm run test:check
npx tsx src/test/run-tests.ts check
```

## Test Structure

### File Organization

```
src/
├── main/
│   └── services/
│       ├── __tests__/
│       │   ├── flintApiService.test.ts           # Unit tests
│       │   ├── flintApiService.integration.test.ts # Integration tests
│       │   └── flintApiService.examples.test.ts  # Example patterns
│       └── flintApiService.ts
├── test/
│   ├── setup.ts                    # Global test setup
│   ├── helpers/
│   │   └── flintApiServiceMock.ts  # Mock helpers
│   └── run-tests.ts                # Custom test runner
└── renderer/
    └── __tests__/                  # Renderer process tests
```

### Test Categories

1. **Unit Tests**: Test individual functions and methods in isolation
2. **Integration Tests**: Test service with real or realistic dependencies
3. **Example Tests**: Demonstrate testing patterns and real-world scenarios

## Testing FlintApiService

### Basic Unit Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FlintApiService } from '../flintApiService';

describe('FlintApiService', () => {
  let service: FlintApiService;

  beforeEach(() => {
    service = new FlintApiService({
      workspacePath: '/test/workspace'
    });
  });

  it('should initialize successfully', async () => {
    await service.initialize();
    expect(service.isReady()).toBe(true);
  });

  it('should get note by identifier', async () => {
    await service.initialize();
    const note = await service.getNote('test-note');
    expect(note).toBeDefined();
  });
});
```

### Using Mock Helpers

```typescript
import { mockFlintApiService, mockScenarios } from '../../../test/helpers/flintApiServiceMock';

describe('FlintApiService with Mocks', () => {
  it('should handle empty vault scenario', async () => {
    const service = mockScenarios.emptyVault();
    await service.initialize();

    const note = await service.getNote('any-note');
    expect(note).toBeNull();
  });

  it('should work with custom notes', async () => {
    const customNotes = [
      {
        identifier: 'my-note',
        title: 'My Note',
        content: 'Test content'
      }
    ];

    const service = mockFlintApiService()
      .withNotes(customNotes)
      .build();

    await service.initialize();
    const note = await service.getNote('my-note');
    expect(note.title).toBe('My Note');
  });
});
```

## Mock Helpers

The testing framework provides comprehensive mock helpers in `src/test/helpers/flintApiServiceMock.ts`.

### Pre-built Mock Scenarios

```typescript
import { mockScenarios } from '../../../test/helpers/flintApiServiceMock';

// Service with no notes
const emptyService = mockScenarios.emptyVault();

// Service with connection errors
const errorService = mockScenarios.connectionErrors();

// Service with large dataset
const largeDataService = mockScenarios.largeDataset(1000);

// Service with slow responses
const slowService = mockScenarios.slowResponses(2000);
```

### Custom Mock Builder

```typescript
import { mockFlintApiService } from '../../../test/helpers/flintApiServiceMock';

const service = mockFlintApiService()
  .withNotes(customNotes)
  .withVault({ id: 'test-vault', name: 'Test Vault' })
  .connectionTest(true)
  .build();
```

### Available Mock Methods

- `mockFlintApiService()` - Create a basic mock service
- `.withNotes(notes)` - Set specific notes to return
- `.withVault(vault)` - Set vault information
- `.notReady()` - Make service report as not ready
- `.failInitialization(error)` - Make initialization fail
- `.failNoteOperations(error)` - Make note operations fail
- `.emptySearchResults()` - Return empty search results
- `.connectionTest(success, error)` - Set connection test result

## Integration Tests

Integration tests use real Flint workspace structures but are skipped by default. Enable them with:

```bash
# Enable integration tests
export RUN_INTEGRATION_TESTS=true
npm run test

# Or use the test runner
npx tsx src/test/run-tests.ts integration
```

### Integration Test Example

```typescript
describe('FlintApiService Integration', () => {
  let testWorkspace: string;
  let service: FlintApiService;

  beforeAll(async () => {
    // Create temporary workspace
    testWorkspace = await mkdtemp(join(tmpdir(), 'flint-test-'));
    service = new FlintApiService({ workspacePath: testWorkspace });
    await service.initialize();
  });

  it('should perform full note lifecycle', async () => {
    // Create note
    await service.createSimpleNote('test', 'integration-note', 'Content');

    // Get note
    const note = await service.getNote('integration-note');
    expect(note).toBeDefined();

    // Update note
    await service.updateNoteContent('integration-note', 'Updated content');

    // Search for note
    const results = await service.searchNotes('integration');
    expect(results.notes.length).toBeGreaterThan(0);
  });
});
```

## Best Practices

### 1. Test Organization

- Group related tests in `describe` blocks
- Use descriptive test names that explain the behavior
- Keep tests focused on single behaviors
- Use `beforeEach` for common setup

### 2. Mocking

- Mock external dependencies (Flint API, file system, etc.)
- Use the provided mock helpers for consistency
- Reset mocks between tests
- Test both success and failure scenarios

### 3. Assertions

- Use specific expectations rather than generic ones
- Test error messages and error types
- Verify side effects (function calls, state changes)
- Use `toThrow` for testing error conditions

### 4. Async Testing

```typescript
// Good: Use async/await
it('should handle async operations', async () => {
  const result = await service.getNote('test');
  expect(result).toBeDefined();
});

// Good: Test error handling
it('should handle errors', async () => {
  await expect(service.getNote('')).rejects.toThrow('Invalid identifier');
});
```

### 5. Test Data

- Use the provided test data sets for consistency
- Create realistic test data that matches production patterns
- Use factories for generating test data

```typescript
import { testDataSets } from '../../../test/helpers/flintApiServiceMock';

// Use provided sample data
const service = mockFlintApiService()
  .withNotes(testDataSets.sampleNotes)
  .build();
```

## Coverage Reports

Generate and view coverage reports:

```bash
# Generate coverage
npm run test:coverage

# View HTML report (opens in browser)
open coverage/index.html
```

Coverage targets are set in `vitest.config.ts` and focused on `flintApiService.ts`:
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

The coverage report shows clean, focused results for the FlintApiService only.

## Troubleshooting

### Common Issues

1. **Tests fail with "Module not found"**
   - Check import paths and aliases in `vitest.config.ts`
   - Ensure test files are in the correct directory structure

2. **Mocks not working**
   - Verify mock setup in `src/test/setup.ts`
   - Check that mocks are cleared between tests
   - Use `vi.clearAllMocks()` in `beforeEach`

3. **Integration tests skipped**
   - Set `RUN_INTEGRATION_TESTS=true` environment variable
   - Check that Flint dependencies are properly installed

4. **Slow test performance**
   - Use mocks instead of real services where possible
   - Check for timeouts in long-running operations
   - Consider using `vi.useFakeTimers()` for time-dependent tests

### Debug Mode

Run tests with debug output:

```bash
# Verbose output (detailed test information)
npm run test:verbose

# Debug specific test
npx vitest run --reporter=verbose src/main/services/__tests__/flintApiService.test.ts

# Clean output (default - concise summary)
npm test
npm run test:run
```

### VS Code Integration

For VS Code users, install the Vitest extension for:
- Inline test results
- Debug test functionality
- Coverage highlighting

## Example Workflows

### Testing a New Feature

1. Write failing tests first (TDD approach)
2. Implement the feature
3. Ensure tests pass
4. Add edge case tests
5. Check coverage

### Testing Error Scenarios

```typescript
it('should handle network errors gracefully', async () => {
  const service = mockScenarios.connectionErrors();
  await service.initialize();

  await expect(service.getNote('test')).rejects.toThrow('Connection failed');

  const connectionTest = await service.testConnection();
  expect(connectionTest.success).toBe(false);
});
```

### Performance Testing

```typescript
it('should handle large datasets efficiently', async () => {
  const service = mockScenarios.largeDataset(10000);
  await service.initialize();

  const start = Date.now();
  const results = await service.searchNotes('test');
  const duration = Date.now() - start;

  expect(results.notes).toHaveLength(10000);
  expect(duration).toBeLessThan(1000); // Should complete in under 1 second
});
```

## Contributing

When adding new tests:

1. Follow the existing patterns and structure
2. Add tests for both success and failure cases
3. Update mock helpers if needed
4. Document any new testing patterns
5. Ensure tests are isolated and deterministic

For questions or issues with testing, refer to the [Vitest documentation](https://vitest.dev/) or check existing test examples in the codebase.
