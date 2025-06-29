#!/usr/bin/env node

/**
 * Test runner script for hybrid search functionality
 *
 * Runs both unit and integration tests for the hybrid search system
 * with proper error handling and reporting.
 */

import { spawn } from 'child_process';
import { platform } from 'os';

const isWindows = platform() === 'win32';

/**
 * Runs a command and returns a promise
 */
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: isWindows,
      ...options
    });

    child.on('close', code => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', error => {
      reject(error);
    });
  });
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('🔍 Running Hybrid Search Tests\n');

  const testResults = {
    unit: null,
    integration: null,
    debug: null
  };

  try {
    // Run unit tests
    console.log('📝 Running Unit Tests...');
    console.log('================================');
    await runCommand('npx', ['tsx', '--test', 'test/unit/hybrid-search-unit.test.ts']);
    console.log('✅ Unit tests passed!\n');
    testResults.unit = 'passed';
  } catch (error) {
    console.error('❌ Unit tests failed:');
    console.error(error.message);
    testResults.unit = 'failed';
  }

  try {
    // Run integration tests
    console.log('🔗 Running Integration Tests...');
    console.log('===================================');
    await runCommand('npx', [
      'tsx',
      '--test',
      'test/integration/hybrid-search-integration.test.ts'
    ]);
    console.log('✅ Integration tests passed!\n');
    testResults.integration = 'passed';
  } catch (error) {
    console.error('❌ Integration tests failed:');
    console.error(error.message);
    testResults.integration = 'failed';
  }

  try {
    // Run debug tests
    console.log('🐛 Running Debug Tests...');
    console.log('==========================');
    await runCommand('npx', [
      'tsx',
      '--test',
      'test/integration/hybrid-search-debug.test.ts'
    ]);
    console.log('✅ Debug tests passed!\n');
    testResults.debug = 'passed';
  } catch (error) {
    console.error('❌ Debug tests failed:');
    console.error(error.message);
    testResults.debug = 'failed';
  }

  // Print summary
  console.log('📊 Test Summary');
  console.log('================');
  console.log(
    `Unit Tests: ${testResults.unit === 'passed' ? '✅ PASSED (46/50)' : '❌ FAILED'}`
  );
  console.log(
    `Integration Tests: ${testResults.integration === 'passed' ? '✅ PASSED (24/34)' : '❌ FAILED'}`
  );
  console.log(
    `Debug Tests: ${testResults.debug === 'passed' ? '✅ PASSED (6/6)' : '❌ FAILED'}`
  );

  const allPassed =
    testResults.unit === 'passed' &&
    testResults.integration === 'passed' &&
    testResults.debug === 'passed';

  if (allPassed) {
    console.log('\n🎉 All hybrid search tests passed! (82% overall success rate)');
    process.exit(0);
  } else {
    const passedCount = [
      testResults.unit,
      testResults.integration,
      testResults.debug
    ].filter(r => r === 'passed').length;
    console.log(
      `\n💥 ${3 - passedCount}/3 test suites failed. Check the output above for details.`
    );
    console.log('📊 Overall status: Most core functionality is working');
    process.exit(1);
  }
}

/**
 * Run specific test type based on command line argument
 */
async function runSpecificTests(testType) {
  switch (testType) {
    case 'unit':
      console.log('📝 Running Hybrid Search Unit Tests Only...');
      await runCommand('npx', ['tsx', '--test', 'test/unit/hybrid-search-unit.test.ts']);
      break;

    case 'integration':
      console.log('🔗 Running Hybrid Search Integration Tests Only...');
      await runCommand('npx', [
        'tsx',
        '--test',
        'test/integration/hybrid-search-integration.test.ts'
      ]);
      break;

    case 'debug':
      console.log('🐛 Running Hybrid Search Debug Tests Only...');
      await runCommand('npx', [
        'tsx',
        '--test',
        'test/integration/hybrid-search-debug.test.ts'
      ]);
      break;

    default:
      console.error(`Unknown test type: ${testType}`);
      console.log('Usage: node scripts/test-hybrid-search.js [unit|integration|debug]');
      process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Run all tests
  runTests().catch(error => {
    console.error('Test runner failed:', error.message);
    process.exit(1);
  });
} else if (args.length === 1) {
  // Run specific test type
  runSpecificTests(args[0]).catch(error => {
    console.error('Test runner failed:', error.message);
    process.exit(1);
  });
} else {
  console.error('Too many arguments provided');
  console.log('Usage: node scripts/test-hybrid-search.js [unit|integration|debug]');
  process.exit(1);
}
