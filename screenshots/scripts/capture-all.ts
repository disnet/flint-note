/**
 * Run all screenshot capture scripts
 *
 * This file re-exports all capture tests so they can be run together.
 *
 * Usage:
 *   npm run screenshots          # Run all captures
 *   npm run screenshots:editor   # Run only editor captures
 *   npm run screenshots:debug    # Debug mode with inspector
 */

// Re-export all capture tests
export * from './capture-onboarding';
export * from './capture-editor';
export * from './capture-settings';
export * from './capture-features';
export * from './capture-chat';
export * from './capture-notes';
