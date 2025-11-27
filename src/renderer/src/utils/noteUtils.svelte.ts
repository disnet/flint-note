import { notesStore } from '../services/noteStore.svelte';

export function generateSafeNoteIdentifier(
  baseName: string = 'Untitled Note',
  noteType: string = 'note'
): { title: string; identifier: string } {
  const existingNotes = notesStore.notes;

  // Get existing identifiers for the specific note type
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- local computation, not reactive state
  const existingIdentifiers = new Set(
    existingNotes
      .filter((note) => note.type === noteType)
      .map((note) => {
        // Extract identifier from filename by removing .md extension
        return note.filename.replace(/\.md$/, '');
      })
  );

  // Helper function to convert title to identifier
  const toIdentifier = (title: string): string => {
    return title
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9\-_.]/g, '');
  };

  // Check if base name identifier is available
  const baseIdentifier = toIdentifier(baseName);
  if (!existingIdentifiers.has(baseIdentifier)) {
    return { title: baseName, identifier: baseIdentifier };
  }

  // Find the next available number
  let counter = 1;
  let candidateTitle: string;
  let candidateIdentifier: string;

  do {
    candidateTitle = `${baseName} ${counter}`;
    candidateIdentifier = toIdentifier(candidateTitle);
    counter++;
  } while (existingIdentifiers.has(candidateIdentifier));

  return { title: candidateTitle, identifier: candidateIdentifier };
}

// Keep the old function for backward compatibility, but mark as deprecated
export function generateSafeNoteTitle(baseName: string = 'Untitled Note'): string {
  return generateSafeNoteIdentifier(baseName).title;
}

export function titleToIdentifier(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-_.]/g, '');
}
