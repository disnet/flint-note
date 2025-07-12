#!/usr/bin/env tsx

/**
 * Test runner script for Flint Electron
 *
 * This script provides a simple way to run different types of tests
 * and can be used for CI/CD or local development.
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestOptions {
  watch?: boolean;
  coverage?: boolean;
  ui?: boolean;
  integration?: boolean;
  verbose?: boolean;
  pattern?: string;
}

class TestRunner {
  private projectRoot: string;

  constructor() {
    this.projectRoot = process.cwd();
  }

  /**
   * Run unit tests
   */
  async runUnitTests(options: TestOptions = {}): Promise<void> {
    console.log('🧪 Running unit tests...');

    const args = ['vitest'];

    if (options.watch) {
      args.push('--watch');
    } else {
      args.push('run');
    }

    if (options.coverage) {
      args.push('--coverage');
    }

    if (options.ui) {
      args.push('--ui');
    }

    if (options.verbose) {
      args.push('--reporter=verbose');
    } else {
      args.push('--reporter=default');
    }

    if (options.pattern) {
      args.push('--testNamePattern');
      args.push(options.pattern);
    }

    // Run only main test files, not integration tests
    args.push('src/main/services/__tests__/flintApiService.test.ts');
    args.push('src/main/services/__tests__/flintApiService.examples.test.ts');

    await this.runCommand('npx', args);
  }

  /**
   * Run integration tests
   */
  async runIntegrationTests(options: TestOptions = {}): Promise<void> {
    console.log('🔧 Running integration tests...');

    // Set environment variable to enable integration tests
    process.env.RUN_INTEGRATION_TESTS = 'true';

    const args = ['vitest'];

    if (options.watch) {
      args.push('--watch');
    } else {
      args.push('run');
    }

    if (options.coverage) {
      args.push('--coverage');
    }

    if (options.verbose) {
      args.push('--reporter=verbose');
    } else {
      args.push('--reporter=default');
    }

    // Only run integration tests
    args.push('src/main/services/__tests__/flintApiService.integration.test.ts');

    await this.runCommand('npx', args);
  }

  /**
   * Run all tests
   */
  async runAllTests(options: TestOptions = {}): Promise<void> {
    console.log('🚀 Running all tests...');

    // Enable integration tests
    process.env.RUN_INTEGRATION_TESTS = 'true';

    const args = ['vitest'];

    if (options.watch) {
      args.push('--watch');
    } else {
      args.push('run');
    }

    if (options.coverage) {
      args.push('--coverage');
    }

    if (options.ui) {
      args.push('--ui');
    }

    if (options.verbose) {
      args.push('--reporter=verbose');
    } else {
      args.push('--reporter=default');
    }

    if (options.pattern) {
      args.push('--testNamePattern');
      args.push(options.pattern);
    }

    await this.runCommand('npx', args);
  }

  /**
   * Run tests with UI
   */
  async runTestsWithUI(): Promise<void> {
    console.log('🎨 Starting test UI...');
    await this.runCommand('npx', ['vitest', '--ui']);
  }

  /**
   * Generate test coverage report
   */
  async generateCoverage(): Promise<void> {
    console.log('📊 Generating coverage report...');
    await this.runCommand('npx', ['vitest', 'run', '--coverage']);

    const coveragePath = join(this.projectRoot, 'coverage', 'index.html');
    if (existsSync(coveragePath)) {
      console.log(`\n📈 Coverage report generated: ${coveragePath}`);
    }
  }

  /**
   * Check test setup
   */
  checkSetup(): void {
    console.log('🔍 Checking test setup...');

    const requiredFiles = ['vitest.config.ts', 'src/test/setup.ts', 'package.json'];

    const missingFiles = requiredFiles.filter(
      (file) => !existsSync(join(this.projectRoot, file))
    );

    if (missingFiles.length > 0) {
      console.error('❌ Missing required files:');
      missingFiles.forEach((file) => console.error(`  - ${file}`));
      process.exit(1);
    }

    // Check if vitest is installed
    try {
      require.resolve('vitest');
      console.log('✅ Vitest is installed');
    } catch {
      console.error('❌ Vitest is not installed. Run: npm install -D vitest');
      process.exit(1);
    }

    console.log('✅ Test setup looks good!');
  }

  /**
   * Run a command and stream output
   */
  private async runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: this.projectRoot,
        stdio: 'inherit',
        shell: false
      });

      child.on('error', (error) => {
        console.error(`❌ Failed to run command: ${error.message}`);
        reject(error);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}`));
        }
      });
    });
  }

  /**
   * Show help information
   */
  showHelp(): void {
    console.log(`
🧪 Flint Electron Test Runner

Usage: tsx src/test/run-tests.ts [command] [options]

Commands:
  unit          Run unit tests only
  integration   Run integration tests only
  all           Run all tests (default)
  ui            Run tests with UI
  coverage      Generate coverage report
  check         Check test setup
  help          Show this help

Options:
  --watch       Watch for changes
  --verbose     Detailed test output (default: clean summary)
  --pattern     Test name pattern to match

Examples:
  tsx src/test/run-tests.ts unit --watch
  tsx src/test/run-tests.ts integration --verbose
  tsx src/test/run-tests.ts all --coverage
  tsx src/test/run-tests.ts ui
  tsx src/test/run-tests.ts --pattern "FlintApiService"

Note: Default output is clean and concise. Use --verbose for detailed test information.

Environment Variables:
  RUN_INTEGRATION_TESTS=true   Enable integration tests
  CI=true                      Enable CI mode
`);
  }
}

/**
 * Parse command line arguments
 */
function parseArgs(): { command: string; options: TestOptions } {
  const args = process.argv.slice(2);

  let command = 'all';
  const options: TestOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (!arg.startsWith('--')) {
      command = arg;
      continue;
    }

    switch (arg) {
      case '--watch':
        options.watch = true;
        break;
      case '--coverage':
        options.coverage = true;
        break;
      case '--ui':
        options.ui = true;
        break;
      case '--integration':
        options.integration = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--pattern':
        options.pattern = args[++i];
        break;
    }
  }

  return { command, options };
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const runner = new TestRunner();
  const { command, options } = parseArgs();

  try {
    switch (command) {
      case 'unit':
        await runner.runUnitTests(options);
        break;
      case 'integration':
        await runner.runIntegrationTests(options);
        break;
      case 'all':
        await runner.runAllTests(options);
        break;
      case 'ui':
        await runner.runTestsWithUI();
        break;
      case 'coverage':
        await runner.generateCoverage();
        break;
      case 'check':
        runner.checkSetup();
        break;
      case 'help':
      case '--help':
      case '-h':
        runner.showHelp();
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        runner.showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export { TestRunner, parseArgs };
