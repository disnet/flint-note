# Integration Tests for flint-note

This directory contains comprehensive end-to-end integration tests for the flint-note MCP server, validating all functionality through the MCP protocol interface.

## Quick Start

```bash
# Run all integration tests
npm run test:integration

# Run specific test file
node --test test/integration/note-operations.test.ts

# Run all tests (unit + integration)
npm test
```

## Test Files Overview

### Core Tests (Phase 1 - Completed)

#### `server-basic.test.ts`
- **Purpose**: Basic server lifecycle testing
- **Coverage**: Server startup, shutdown, and error handling
- **Test Cases**: 3 tests covering server process management

#### `note-operations.test.ts` ✅
- **Purpose**: Core note CRUD operations
- **Coverage**: Note creation, retrieval, updates, and file system consistency
- **Test Cases**: 25 tests covering:
  - Note creation with various content types and metadata
  - Note retrieval by different identifier formats
  - Note updates with content preservation
  - Cross-type operations and concurrent handling
  - File system validation and consistency checks

#### `batch-operations.test.ts` ✅
- **Purpose**: Batch note creation and update operations
- **Coverage**: Batch processing, partial failure handling, performance validation
- **Test Cases**: 15 tests covering:
  - Batch note creation with mixed types and metadata
  - Batch note updates with content and metadata changes
  - Partial failure scenarios and error reporting
  - Performance validation for large batches
  - Result structure validation and success/failure counts

#### `note-type-management.test.ts` ✅
- **Purpose**: Note type lifecycle management
- **Coverage**: Note type creation, updates, information retrieval
- **Test Cases**: 20 tests covering:
  - Note type creation with descriptions, templates, agent instructions
  - Field updates (description, template, instructions, metadata_schema)
  - Information retrieval and template access
  - Directory structure validation and concurrent operations

#### `search-integration.test.ts` ✅
- **Purpose**: Search functionality validation
- **Coverage**: Text search, regex patterns, filtering, pagination
- **Test Cases**: 25 tests covering:
  - Basic text search across content and metadata
  - Type filtering and case-insensitive search
  - Regex pattern matching with complex expressions
  - Search limits, pagination, and performance testing
  - Result structure validation and concurrent searches

#### `error-handling.test.ts` ✅
- **Purpose**: Error conditions and edge cases
- **Coverage**: Parameter validation, error responses, graceful failures
- **Test Cases**: 35+ tests covering:
  - Missing and invalid parameters for all tools
  - Non-existent resource handling
  - Concurrent operation conflicts
  - File system errors and resource limits
  - Malformed request handling

### Advanced Tests (Phase 2 - Planned)

#### `template-processing.test.ts` (Planned)
- Template variable substitution
- Template processing with metadata
- Agent instruction integration

#### `metadata-integration.test.ts` (Planned)
- Metadata schema validation
- All supported field types
- YAML frontmatter processing

#### `link-management.test.ts` (Planned)
- Note linking functionality
- Relationship types and contexts
- Bidirectional link creation

### System Tests (Phase 3 - Planned)

#### `resource-access.test.ts` (Planned)
- MCP resource endpoints
- Workspace information retrieval
- Resource data accuracy

#### `agent-instructions.test.ts` (Planned)
- Agent instruction functionality
- Integration with note creation
- Instruction format validation

### Performance Tests (Phase 4 - Planned)

#### `performance.test.ts` (Planned)
- Large dataset handling
- Concurrent operation performance
- Memory usage validation

## Test Infrastructure

### MCP Client Simulation
Each test file includes a custom `MCPClient` class that:
- Handles JSON-RPC communication with the MCP server
- Provides timeout management and error handling
- Supports both successful operations and expected failures

### Helper Functions
Located in `helpers/integration-utils.ts`:
- `createIntegrationWorkspace()` - Creates isolated test environments
- `cleanupIntegrationWorkspace()` - Ensures proper cleanup
- `startServer()` / `stopServer()` - Server lifecycle management
- `createTestNoteType()` - Test data generation
- `waitFor()` - Async condition waiting

### Test Data Strategy
- **Isolated Workspaces**: Each test gets a clean temporary workspace
- **Comprehensive Datasets**: Rich test data with metadata, templates, and relationships
- **Realistic Scenarios**: Tests mirror actual usage patterns
- **Concurrent Operations**: Validates thread safety and race conditions

## Test Execution

### Running Tests
```bash
# All integration tests
npm run test:integration

# Specific test file
node --test test/integration/note-operations.test.ts

# Pattern matching
node --test test/integration/*-operations*.test.ts

# With debugging output
DEBUG=* npm run test:integration
```

### Test Environment
- **Node.js**: Requires Node.js 18+ with native test runner
- **Temporary Workspaces**: Tests use isolated temporary directories
- **Server Processes**: Each test spawns its own MCP server instance
- **Cleanup**: Automatic cleanup of processes and temporary files

## Coverage Status

### MCP Tools Coverage ✅ COMPLETE
- ✅ `create_note` - Full validation including metadata, templates, and batch operations
- ✅ `get_note` - All identifier formats and error conditions
- ✅ `update_note` - Content updates, metadata preservation, and batch operations
- ✅ `create_note_type` - All components and validation
- ✅ `update_note_type` - All field updates and error handling
- ✅ `get_note_type_info` - Complete information retrieval
- ✅ `get_note_type_template` - Template access and validation
- ✅ `list_note_types` - Listing and structure validation
- ✅ `search_notes` - All search features and performance


### MCP Resources Coverage (Phase 3)
- ⏳ `flint-note://types` - Note types resource
- ⏳ `flint-note://recent` - Recent notes resource  
- ⏳ `flint-note://stats` - Workspace statistics resource

### Error Handling Coverage ✅ COMPLETE
- ✅ Parameter validation for all tools
- ✅ Missing required field handling
- ✅ Invalid data format handling
- ✅ Non-existent resource handling
- ✅ Concurrent operation conflicts
- ✅ File system error scenarios
- ✅ Malformed request handling

## Performance Benchmarks

### Current Performance (Phase 1)
- **Note Creation**: < 50ms average (single), < 200ms for 10-note batches
- **Note Retrieval**: < 20ms average
- **Search Operations**: < 100ms for 50+ notes
- **Type Management**: < 30ms average
- **Concurrent Operations**: Handles 5+ simultaneous requests
- **Batch Operations**: < 500ms for 20-note batches, handles partial failures gracefully

### Target Performance (Phase 4)
- **Tool Response**: < 100ms for simple operations
- **Search Response**: < 500ms for 100+ notes
- **Memory Usage**: Stable during concurrent operations
- **File Handle Management**: No leaks or zombie processes
- **Large Batch Operations**: < 2s for 50+ note batches with detailed error reporting

## Best Practices

### Writing Integration Tests
1. **Isolation**: Each test gets a clean workspace
2. **Cleanup**: Always use `afterEach` for proper cleanup
3. **Realistic Data**: Use comprehensive test datasets
4. **Error Testing**: Validate both success and failure scenarios
5. **Concurrency**: Test concurrent operations where applicable

### Debugging Tests
1. **Server Logs**: Check server stderr output for errors
2. **File System**: Inspect temporary directories during development
3. **MCP Protocol**: Validate JSON-RPC request/response format
4. **Timeouts**: Adjust timeouts for debugging sessions

### Adding New Tests
1. Follow the established pattern in existing test files
2. Use the shared helper functions for consistency
3. Include both positive and negative test cases
4. Add performance validation for new features
5. Update this README with new test coverage

## Continuous Integration

### CI/CD Integration
- Tests run on all pull requests
- Separate job for integration tests (longer running)
- Cross-platform testing (Linux, macOS, Windows)
- Node.js version matrix testing

### Quality Gates
- All integration tests must pass
- No zombie processes or file handle leaks
- Memory usage within acceptable limits
- Test execution time under 5 minutes total

This comprehensive integration test suite ensures the flint-note MCP server works correctly in real-world scenarios and provides confidence for continued development and deployment.