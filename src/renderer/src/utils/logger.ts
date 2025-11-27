/**
 * Renderer Logger
 *
 * A simple logger for renderer-side code that can be silenced during tests.
 * Works in both browser (Electron renderer) and Node.js (vitest) environments.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class RendererLogger {
  private static instance: RendererLogger;
  private silent: boolean;

  private constructor() {
    // Check for test environment
    // In Node.js (vitest), process.env is available
    // In browser, we check for a global flag
    const isNodeTest =
      typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');
    const debugTests =
      typeof process !== 'undefined' && process.env?.DEBUG_TESTS === 'true';

    // Check for browser test flag (can be set by test setup)
    const isBrowserTest =
      typeof window !== 'undefined' &&
      (window as { __FLINT_TEST_MODE__?: boolean }).__FLINT_TEST_MODE__ === true;

    this.silent = (isNodeTest || isBrowserTest) && !debugTests;
  }

  static getInstance(): RendererLogger {
    if (!RendererLogger.instance) {
      RendererLogger.instance = new RendererLogger();
    }
    return RendererLogger.instance;
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (this.silent) {
      return;
    }

    const prefix = `[${level.toUpperCase()}]`;
    switch (level) {
      case 'error':
        console.error(prefix, ...args);
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      case 'debug':
        console.debug(prefix, ...args);
        break;
      default:
        console.log(prefix, ...args);
    }
  }

  debug(...args: unknown[]): void {
    this.log('debug', ...args);
  }

  info(...args: unknown[]): void {
    this.log('info', ...args);
  }

  warn(...args: unknown[]): void {
    this.log('warn', ...args);
  }

  error(...args: unknown[]): void {
    this.log('error', ...args);
  }

  /**
   * Set silent mode explicitly (useful for testing)
   */
  setSilent(silent: boolean): void {
    this.silent = silent;
  }

  /**
   * Check if logger is in silent mode
   */
  isSilent(): boolean {
    return this.silent;
  }
}

export const logger = RendererLogger.getInstance();
