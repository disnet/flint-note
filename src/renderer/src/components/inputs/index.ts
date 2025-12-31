/**
 * Shared input components for property editing
 *
 * These components can be used in EditorChips, DeckEditableCell, and other places
 * that need type-specific property inputs.
 */

// Simple inputs
export { default as StringInput } from './StringInput.svelte';
export { default as NumberInput } from './NumberInput.svelte';
export { default as BooleanInput } from './BooleanInput.svelte';
export { default as DateInput } from './DateInput.svelte';
export { default as SelectInput } from './SelectInput.svelte';

// Complex inputs with dropdowns
export { default as ArrayInput } from './ArrayInput.svelte';
export { default as NoteLinkInput } from './NoteLinkInput.svelte';
export { default as NoteLinksInput } from './NoteLinksInput.svelte';

// Shared dropdown components (can be used directly for custom implementations)
export { default as NoteLinkPicker } from './NoteLinkPicker.svelte';
export { default as ListDropdown } from './ListDropdown.svelte';
