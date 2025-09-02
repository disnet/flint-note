/**
 * FlintNote Server - Core API Entry Point
 *
 * Direct programmatic access to FlintNote functionality.
 * Use this for embedding FlintNote in applications like Electron.
 */

// Export the main API class
export { FlintNoteApi, type FlintNoteApiConfig } from './api/flint-note-api.js';

// Export all API types for consumers
export * from './api/index.js';

// Export core types that might be needed directly
export type { NoteMetadata } from './types/index.js';
export type { VaultInfo } from './utils/global-config.js';
export type { SearchResult } from './database/search-manager.js';
