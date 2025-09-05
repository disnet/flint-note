# Custom Functions Testing Plan

## Overview

This document outlines a comprehensive testing strategy for the Custom Functions system. Based on the current implementation status (Phase 1 & 2 complete), we need to verify that all core infrastructure and agent integration components work correctly through systematic testing.

## Current Implementation Status

**✅ Completed Components:**

- Storage layer with vault-scoped persistence
- Validation framework with TypeScript compilation and security analysis
- Execution layer with WASM sandbox integration
- Complete management API
- AI agent integration with system prompt generation
- Dynamic TypeScript type declarations
- Testing and debugging tools

**📋 Testing Gaps:**

- No systematic test coverage for implemented components
- No validation of end-to-end workflows
- No performance or security testing
- No error handling verification

## Testing Architecture

### Test Environment Setup

```typescript
// tests/custom-functions/setup/TestCustomFunctionsSetup.ts
class TestCustomFunctionsSetup extends TestApiSetup {
  private customFunctionsApi: CustomFunctionsApi;
  private tempVaultPath: string;

  async initialize() {
    await super.initialize();
    this.customFunctionsApi = new CustomFunctionsApi(this.tempDir);
    this.tempVaultPath = path.join(this.tempDir, 'test-vault');
  }

  createSampleFunction(name: string = 'testFunction'): CustomFunction {
    return {
      id: uuidv4(),
      name,
      description: 'Test function for automated testing',
      parameters: {
        input: { type: 'string', description: 'Test input' }
      },
      returnType: 'string',
      code: `
        function ${name}(input: string): string {
          return 'Test result: ' + input;
        }
      `,
      tags: ['test'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test',
        usageCount: 0,
        version: 1
      }
    };
  }
}
```

## Phase 1: Unit Testing (Foundation)

### 1.1 Storage Layer Tests

**File:** `tests/custom-functions/core/custom-functions-store.test.ts`

```typescript
describe('CustomFunctionsStore', () => {
  it('should save and load custom functions correctly');
  it('should handle multiple functions in a single vault');
  it('should create vault directory if it does not exist');
  it('should handle concurrent read/write operations');
  it('should validate function uniqueness by name');
  it('should update usage statistics correctly');
  it('should backup and restore functions');
  it('should handle corrupted storage files gracefully');
  it('should migrate old format data');
});
```

**Key Test Scenarios:**

- CRUD operations for individual functions
- Concurrent access safety
- Data persistence across application restarts
- Error recovery from corrupted files
- Storage format migrations

### 1.2 Validation Framework Tests

**File:** `tests/custom-functions/api/custom-functions-validator.test.ts`

```typescript
describe('CustomFunctionValidator', () => {
  describe('Definition Validation', () => {
    it('should accept valid TypeScript function definitions');
    it('should reject functions with syntax errors');
    it('should validate parameter type annotations');
    it('should reject reserved function names');
    it('should detect dangerous code patterns');
    it('should validate return type annotations');
  });

  describe('Security Analysis', () => {
    it('should block access to restricted globals');
    it('should prevent file system access attempts');
    it('should detect infinite loops in simple cases');
    it('should block dynamic code execution patterns');
  });
});
```

**Key Test Scenarios:**

- Valid and invalid TypeScript syntax
- Security pattern detection
- Parameter and return type validation
- Reserved name conflicts
- Edge cases with complex type definitions

### 1.3 Execution Layer Tests

**File:** `tests/custom-functions/api/custom-functions-executor.test.ts`

```typescript
describe('CustomFunctionsExecutor', () => {
  describe('Function Compilation', () => {
    it('should compile valid functions successfully');
    it('should cache compiled functions');
    it('should handle TypeScript compilation errors');
    it('should update cached functions when code changes');
  });

  describe('WASM Integration', () => {
    it('should execute custom functions in sandbox');
    it('should provide access to standard APIs');
    it('should isolate function execution contexts');
    it('should handle function execution timeouts');
    it('should properly clean up VM contexts');
  });

  describe('Namespace Injection', () => {
    it('should create customFunctions namespace');
    it('should inject all registered functions');
    it('should handle function name conflicts');
    it('should provide management methods');
  });
});
```

**Key Test Scenarios:**

- TypeScript compilation and caching
- WASM sandbox execution
- Function isolation and cleanup
- Namespace creation and injection
- Error handling during execution

## Phase 2: Integration Testing (Component Interaction)

### 2.1 API Integration Tests

**File:** `tests/custom-functions/integration/custom-functions-api.test.ts`

```typescript
describe('Custom Functions API Integration', () => {
  describe('End-to-End Function Lifecycle', () => {
    it('should register, validate, and execute a custom function');
    it('should update existing functions and invalidate cache');
    it('should delete functions and clean up references');
    it('should handle function dependencies correctly');
  });

  describe('Error Handling', () => {
    it('should provide detailed error messages for compilation failures');
    it('should handle runtime errors gracefully');
    it('should recover from storage failures');
    it('should validate function calls with proper error context');
  });
});
```

### 2.2 System Prompt Integration Tests

**File:** `tests/custom-functions/integration/system-prompt-integration.test.ts`

```typescript
describe('System Prompt Integration', () => {
  it('should generate system prompt with custom functions');
  it('should update prompts when functions are added/removed');
  it('should generate proper TypeScript declarations');
  it('should handle empty function lists gracefully');
  it('should format function documentation correctly');
});
```

### 2.3 Code Evaluator Integration Tests

**File:** `tests/custom-functions/integration/code-evaluator-integration.test.ts`

```typescript
describe('Code Evaluator Integration', () => {
  it('should execute code that calls custom functions');
  it('should provide proper type checking for custom functions');
  it('should handle custom function errors in evaluation context');
  it('should support async custom functions');
  it('should track custom function usage statistics');
});
```

## Phase 3: End-to-End Testing (Complete Workflows)

### 3.1 Agent Workflow Tests

**File:** `tests/custom-functions/e2e/agent-workflow.test.ts`

```typescript
describe('Agent Custom Functions Workflow', () => {
  it('should register a function via agent tools');
  it('should use registered function in subsequent evaluations');
  it('should handle function registration conflicts');
  it('should provide function testing capabilities');
  it('should list and manage functions through agent tools');
});
```

**Test Scenarios:**

- Complete agent interaction workflow
- Function registration → validation → execution → management
- Multi-session persistence
- Function sharing between agent sessions

### 3.2 Complex Function Tests

**File:** `tests/custom-functions/e2e/complex-functions.test.ts`

```typescript
describe('Complex Custom Functions', () => {
  describe('Daily Note Management', () => {
    it('should implement createOrUpdateDailyNote function');
    it('should handle existing note updates');
    it('should create new notes when needed');
    it('should work with different date formats');
  });

  describe('Multi-Step Operations', () => {
    it('should execute functions that call multiple APIs');
    it('should handle async operations correctly');
    it('should maintain proper error context across API calls');
  });
});
```

### 3.3 Performance and Reliability Tests

**File:** `tests/custom-functions/e2e/performance.test.ts`

```typescript
describe('Performance and Reliability', () => {
  it('should handle large numbers of registered functions');
  it('should execute functions with acceptable performance');
  it('should handle rapid function registration/execution cycles');
  it('should recover from system interruptions');
  it('should maintain consistency under concurrent access');
});
```

## Phase 4: Security and Edge Case Testing

### 4.1 Security Tests

**File:** `tests/custom-functions/security/security.test.ts`

```typescript
describe('Security Testing', () => {
  it('should prevent access to Node.js globals');
  it('should block file system access attempts');
  it('should prevent network access');
  it('should isolate functions from each other');
  it('should handle malformed input safely');
  it('should prevent prototype pollution attacks');
});
```

### 4.2 Error Recovery Tests

**File:** `tests/custom-functions/reliability/error-recovery.test.ts`

```typescript
describe('Error Recovery', () => {
  it('should recover from storage corruption');
  it('should handle VM crashes gracefully');
  it('should provide meaningful error messages');
  it('should maintain system stability after errors');
  it('should clean up resources after failures');
});
```

## Implementation Plan

### Phase 1: Foundation Tests (Week 1)

**Priority: High** - Verify core components work correctly

1. **Day 1-2**: Set up test infrastructure and utilities
2. **Day 3-4**: Implement storage layer tests
3. **Day 5-6**: Implement validation framework tests
4. **Day 7**: Implement execution layer tests

**Acceptance Criteria:**

- All storage operations work correctly
- Validation catches errors and security issues
- Functions execute properly in WASM sandbox
- 90%+ code coverage on core components

### Phase 2: Integration Tests (Week 2)

**Priority: High** - Verify components work together

1. **Day 1-2**: API integration tests
2. **Day 3-4**: System prompt integration tests
3. **Day 5-7**: Code evaluator integration tests

**Acceptance Criteria:**

- Complete function lifecycle works end-to-end
- System prompts generate correctly
- Code evaluation includes custom functions
- Error handling works across component boundaries

### Phase 3: End-to-End Tests (Week 3)

**Priority: Medium** - Verify complete user workflows

1. **Day 1-3**: Agent workflow tests
2. **Day 4-5**: Complex function tests
3. **Day 6-7**: Performance tests

**Acceptance Criteria:**

- Agent can register and use custom functions
- Complex multi-step functions work correctly
- Performance meets acceptable thresholds
- System handles realistic usage patterns

### Phase 4: Security and Reliability (Week 4)

**Priority: Medium** - Verify system robustness

1. **Day 1-3**: Security tests
2. **Day 4-5**: Error recovery tests
3. **Day 6-7**: Edge case handling

**Acceptance Criteria:**

- Security sandbox is effective
- System recovers from all tested failure modes
- Edge cases handled gracefully
- No data loss under normal error conditions

## Test Data and Fixtures

### Sample Functions Library

```typescript
// tests/custom-functions/fixtures/sample-functions.ts
export const sampleFunctions = {
  simpleString: /* Simple string manipulation function */,
  asyncOperation: /* Async function with Promise handling */,
  noteManagement: /* Daily note management function */,
  errorProne: /* Function designed to test error handling */,
  complexTypes: /* Function with complex parameter types */,
  securityTest: /* Function for security testing */
};
```

### Test Utilities

```typescript
// tests/custom-functions/utils/test-helpers.ts
export class CustomFunctionTestHelper {
  static async registerAndTest(setup: TestCustomFunctionsSetup, func: CustomFunction);
  static async executeWithContext(code: string, functions: CustomFunction[]);
  static generateRandomFunction(complexity: 'simple' | 'complex'): CustomFunction;
  static validateFunctionExecution(result: any, expected: any): void;
}
```

## Success Metrics

### Coverage Targets

- **Unit Tests**: >90% line coverage on all core components
- **Integration Tests**: All major component interactions covered
- **E2E Tests**: All documented user workflows tested
- **Security Tests**: All identified attack vectors tested

### Performance Benchmarks

- Function registration: <100ms for simple functions
- Function execution: <50ms overhead vs direct code
- Storage operations: <10ms for typical vault sizes
- System prompt generation: <200ms with 50+ functions

### Reliability Standards

- Zero data loss under normal error conditions
- Graceful degradation for all failure modes
- Recovery time <5s for storage corruption
- No memory leaks during extended operation

## Maintenance and Continuous Testing

### Automated Testing

- All tests run on every commit
- Performance regression detection
- Security vulnerability scanning
- Coverage reporting and tracking

### Test Maintenance

- Regular review of test relevance
- Update tests for new features
- Remove obsolete test scenarios
- Performance benchmark updates

This comprehensive testing plan will verify that the Custom Functions implementation meets all requirements and performs reliably under various conditions.
