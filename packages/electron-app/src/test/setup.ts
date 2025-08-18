// Test setup file for Vitest
import { vi } from 'vitest';

// Mock localStorage for browser environment tests
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  },
  writable: true
});

// Mock console to suppress noise during tests (optional)
global.console = {
  ...console,
  // Comment out if you want to see console logs during tests
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};
