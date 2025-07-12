# Testing Quick Reference Guide

A quick reference for all testing commands in the Flint Electron project.

## 🚀 Quick Commands

### Basic Testing
```bash
# Run all tests (clean output)
npm test

# Run with detailed output
npm run test:verbose

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Targeted Testing
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# All tests
npm run test:all

# Check setup
npm run test:check
```

### Interactive Testing
```bash
# Test UI (visual interface)
npm run test:ui

# Watch mode with details
npm run test:watch:verbose
```

## 🔧 Advanced Commands

### Custom Test Runner
```bash
# Unit tests with options
npx tsx src/test/run-tests.ts unit --verbose --watch

# Integration tests
npx tsx src/test/run-tests.ts integration

# Pattern matching
npx tsx src/test/run-tests.ts unit --pattern "search"

# Coverage report
npx tsx src/test/run-tests.ts all --coverage
```

### Direct Vitest Commands
```bash
# Specific test file
npx vitest run src/main/services/__tests__/flintApiService.test.ts

# Pattern matching
npx vitest run --testNamePattern="FlintApiService"

# Verbose output
npx vitest run --reporter=verbose
```

## 📊 Test Results

### What You'll See (Clean Output)
```
✓ src/main/services/__tests__/flintApiService.test.ts (42 tests) 8ms
✓ src/main/services/__tests__/flintApiService.examples.test.ts (17 tests) 8ms

Test Files  2 passed (2)
Tests  59 passed (59)
Duration  263ms
```

### Coverage Results
```
File   | % Stmts | % Branch | % Funcs | % Lines
-------|---------|----------|---------|--------
All    |   91.66 |    88.23 |     100 |   91.66
```

## 🎯 Testing Scenarios

### Development Workflow
```bash
# Start development with tests
npm run test:watch

# Run tests before commit
npm test

# Check coverage
npm run test:coverage
```

### Debugging Issues
```bash
# Detailed output for debugging
npm run test:verbose

# Run specific test
npx vitest run --testNamePattern="initialization"

# Check test setup
npm run test:check
```

### CI/CD Pipeline
```bash
# Full test suite
npm run test:all --coverage

# Unit tests only (fast)
npm run test:unit

# Integration tests (requires setup)
RUN_INTEGRATION_TESTS=true npm run test:integration
```

## 📁 Test Files

- `flintApiService.test.ts` - 42 unit tests
- `flintApiService.examples.test.ts` - 17 example patterns  
- `flintApiService.integration.test.ts` - 22 integration tests

## 🔍 Test Categories

**Unit Tests (59 active)**
- Service initialization & configuration
- All CRUD operations
- Search functionality
- Error handling
- Utility methods

**Integration Tests (22 available)**
- Real workspace interaction
- End-to-end workflows
- Performance testing
- Error recovery

**Example Tests (17 patterns)**
- Mock usage patterns
- Real-world scenarios
- Error simulation
- Performance testing

## ⚡ Quick Troubleshooting

**No tests found?**
```bash
npm run test:check
```

**Tests failing?**
```bash
npm run test:verbose
```

**Coverage too low?**
```bash
npm run test:coverage
```

**Integration tests failing?**
```bash
# Expected - they need real Flint workspace
RUN_INTEGRATION_TESTS=true npm run test:integration
```

## 🎨 Output Options

**Clean (Default)**: Concise summary, no JSON spam
**Verbose**: Detailed test-by-test breakdown
**UI**: Visual interface for interactive testing
**Coverage**: Detailed coverage metrics

Choose the right output for your needs!