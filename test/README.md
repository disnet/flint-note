# Test Directory Structure

This directory contains all tests for the flint-note project, organized into two main categories:

## Directory Structure

```
test/
├── unit/           # Unit tests - test individual components in isolation
│   └── helpers/    # Shared test utilities and helpers
├── integration/    # Integration tests - test end-to-end workflows
└── README.md       # This file
```

## Unit Tests (`test/unit/`)

Unit tests focus on testing individual classes and functions in isolation. They:

- Test single components without external dependencies
- Use mocked or minimal file system operations
- Run quickly and don't require full system setup
- Import and test classes directly from `../../src/`

**Files:**
- `basic.test.ts` - Basic import, configuration, and workspace tests
- `batch-operations.test.ts` - Batch note creation and update operations
- `links.test.ts` - Link management functionality
- `metadata-schema.test.ts` - Metadata schema parsing and validation
- `note-creation.test.ts` - Note creation logic and validation
- `note-deletion.test.ts` - Note deletion logic and validation
- `note-retrieval.test.ts` - Note retrieval and content parsing
- `note-type-deletion.test.ts` - Note type deletion with different strategies
- `regex-search.test.ts` - Regex search functionality
- `search-unit.test.ts` - Search manager unit tests
- `template-creation.test.ts` - Template creation and processing logic

**Shared Helpers:**
- `helpers/test-utils.ts` - Common test setup, teardown, and utility functions

## End to end integration Tests (`test/integration/`)

E2E integration tests focus on testing complete workflows and system interactions. They:

- Test full end-to-end functionality
- Spawn MCP server processes
- Use real file system operations with temporary directories
- Test the full stack including MCP protocol communication

**Files:**
- `batch-operations.test.ts` - Batch note operations through MCP server
- `command-line-args.test.ts` - Command line argument parsing and workspace setup
- `deletion-integration.test.ts` - Note and note type deletion through MCP server
- `error-handling.test.ts` - Error handling and edge cases across all operations
- `note-operations.test.ts` - Note creation, retrieval, and updates through MCP
- `note-type-management.test.ts` - Note type creation and management through MCP
- `search-integration.test.ts` - Search functionality through MCP server
- `server-basic.test.ts` - Basic server startup, shutdown, and error handling tests

**Shared Helpers:**
- `helpers/integration-utils.ts` - Common integration test utilities for server management

## Running Tests

```bash
# Run all tests
npm test

# Run only unit tests (fast)
npm run test:unit

# Run only integration tests (slower)
npm run test:integration

# Run tests with specific pattern
node --test test/unit/search-*.test.ts
```

## Writing Tests

### Unit Test Guidelines

- Import modules directly from `../../src/`
- Use shared helpers from `./helpers/test-utils.ts` for common operations
- Use consistent test framework patterns (`test`, `describe`, `beforeEach`, `afterEach`)
- Mock external dependencies when possible
- Focus on testing single functions or classes
- Keep tests fast and isolated
- Follow the project's style guide (single quotes, private fields with `#`, etc.)

### Integration Test Guidelines

- Use child process spawning to test the MCP server
- Create temporary workspaces for each test
- Test real file system operations and server communication
- Include proper cleanup of processes and temporary directories
- Test error conditions and graceful shutdown
- Use realistic timeouts for server operations
- Verify server startup messages and process states
- Handle cross-platform differences in process management

## Style Guidelines

Following the project's style guide (`STYLE.md`):

- Use single quotes for strings
- Include semicolons
- Prefer `const` over `let`
- Use private fields (`#private`) over TypeScript `private`
- Handle unused catch bindings appropriately (`catch {}`)
- Use consistent test framework patterns across all test files
- Leverage shared helpers to reduce code duplication

## Shared Test Utilities

### Unit Test Helpers (`helpers/test-utils.ts`)
- `createTestWorkspace()` - Creates a temporary workspace with all managers
- `cleanupTestWorkspace()` - Cleans up temporary directories
- `createTestNotes()` - Creates standard test notes
- `createTestNotesWithMetadata()` - Creates notes with YAML frontmatter
- `createTestNoteTypes()` - Sets up test note types with schemas
- `TestAssertions` - Common assertion helpers
- `TEST_CONSTANTS` - Shared test constants and data

### Integration Test Helpers (`helpers/integration-utils.ts`)
- `createIntegrationWorkspace()` - Creates temporary workspace for integration tests
- `cleanupIntegrationWorkspace()` - Cleans up workspace and server processes
- `startServer()` - Spawns MCP server process with proper configuration
- `stopServer()` - Gracefully shuts down server processes
- `createIntegrationTestNotes()` - Creates test notes in workspace
- `createTestNoteType()` - Creates note types with descriptions
- `waitFor()` - Utility for waiting on conditions with timeout
- `INTEGRATION_CONSTANTS` - Integration test constants and timeouts

Use these helpers to reduce duplication and ensure consistency across tests.
