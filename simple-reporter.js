// dot-full-stack-reporter.mjs
export default async function* dotReporter(source) {
  const state = {
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: []
  };

  for await (const event of source) {
    switch (event.type) {
      case 'test:pass':
        state.passed++;
        yield '.';
        break;
      case 'test:fail': {
        // Only filter out the specific "subtest failed" parent failures
        // Keep all other failures to ensure we don't lose legitimate test failures
        const isParentSuiteFailure =
          event.data.details?.error?.message?.includes('subtest failed');

        if (!isParentSuiteFailure) {
          state.failed++;
          state.failures.push(event.data);
          yield 'F';
        } else {
          // Don't count parent failures in the stats, but still show some indicator
          yield 'F';
        }
        break;
      }
      case 'test:skip':
        state.skipped++;
        yield 'S';
        break;
    }
  }

  yield '\n\n';

  // Show full failure details with complete stack traces
  if (state.failures.length > 0) {
    yield 'FAILURES:\n';
    yield '='.repeat(80) + '\n\n';

    for (let i = 0; i < state.failures.length; i++) {
      const failure = state.failures[i];
      yield `${i + 1}) ${failure.name}\n`;

      if (failure.file) {
        yield `   File: ${failure.file}\n`;
      }

      if (failure.details?.error) {
        const error = failure.details.error;
        yield `   Message: ${error.message}\n`;

        if (error.code) {
          yield `   Code: ${error.code}\n`;
        }

        // Show expected vs actual for assertion errors
        if (error.expected !== undefined && error.actual !== undefined) {
          yield `   Expected: ${formatValue(error.expected)}\n`;
          yield `   Actual:   ${formatValue(error.actual)}\n`;
          if (error.operator) {
            yield `   Operator: ${error.operator}\n`;
          }
        }

        // Full stack trace
        if (error.stack) {
          yield '   Stack Trace:\n';
          const stackLines = error.stack.split('\n');

          for (const line of stackLines) {
            if (line.trim()) {
              yield `     ${line}\n`;
            }
          }
        }
      }

      yield '\n' + '-'.repeat(80) + '\n\n';
    }
  }

  // Summary
  const total = state.passed + state.failed + state.skipped;
  yield 'Test Results:\n';
  yield `  Passed: ${state.passed}\n`;
  yield `  Failed: ${state.failed}\n`;

  if (state.skipped > 0) {
    yield `  Skipped: ${state.skipped}\n`;
  }

  yield `  Total: ${total}\n`;

  if (state.failed === 0) {
    yield '\n🎉 All tests passed!\n';
  } else {
    yield `\n❌ ${state.failed} test(s) failed\n`;
  }
}

function formatValue(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
        .split('\n')
        .map(line => '     ' + line)
        .join('\n');
    } catch {
      return String(value);
    }
  }
  return String(value);
}
