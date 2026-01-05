/**
 * Wikilink stabilization - converts title-based wikilinks to stable ID-based format
 *
 * When a note is created with a title that matches existing title-based wikilinks,
 * those links are converted from [[Title]] to [[n-xxxxxxxx]] format to prevent
 * breakage when notes are renamed.
 */

import { getAllNotes, getNoteContent, updateNoteContent } from './state.svelte';

// Regex to match wikilinks: [[identifier]] or [[identifier|displayText]]
const WIKILINK_REGEX = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;

// Pattern to detect ID-based links (already stable)
const ID_PATTERN = /^(n|conv|type)-[a-f0-9]+$/i;

/**
 * Check if an identifier is already an ID-based link
 */
function isIdBasedLink(identifier: string): boolean {
  return ID_PATTERN.test(identifier.trim());
}

/**
 * Check if a wikilink identifier matches a given title (case-insensitive)
 */
function matchesTitle(identifier: string, targetTitle: string): boolean {
  if (isIdBasedLink(identifier)) return false;
  return identifier.toLowerCase().trim() === targetTitle.toLowerCase().trim();
}

/**
 * Stabilize wikilinks in content by replacing title-based links with ID-based links
 *
 * @param content - The note content to process
 * @param noteId - The ID of the target note (e.g., "n-abc12345")
 * @param noteTitle - The title of the target note
 * @returns Object with stabilized content and whether any changes were made
 */
export function stabilizeWikilinksInContent(
  content: string,
  noteId: string,
  noteTitle: string
): { stabilized: string; changesMade: boolean } {
  if (!noteTitle.trim()) {
    return { stabilized: content, changesMade: false };
  }

  let changesMade = false;

  const stabilized = content.replace(
    WIKILINK_REGEX,
    (match, identifier: string, displayText?: string) => {
      if (matchesTitle(identifier, noteTitle)) {
        changesMade = true;
        // If there was custom display text, preserve it; otherwise just use the ID
        if (displayText) {
          return `[[${noteId}|${displayText}]]`;
        }
        return `[[${noteId}]]`;
      }
      return match;
    }
  );

  return { stabilized, changesMade };
}

/**
 * Scan all notes and stabilize title-based wikilinks that match the given note title
 *
 * This is called when a new note is created to update any existing links
 * that reference the note by title.
 *
 * @param newNoteId - The ID of the newly created note
 * @param newNoteTitle - The title of the newly created note
 */
export async function stabilizeWikilinksGlobally(
  newNoteId: string,
  newNoteTitle: string
): Promise<void> {
  if (!newNoteTitle.trim()) return;

  const allNotes = getAllNotes();
  const notesToProcess = allNotes.filter(
    (note) => !note.archived && note.id !== newNoteId
  );

  // Process in batches for performance
  const BATCH_SIZE = 5;
  for (let i = 0; i < notesToProcess.length; i += BATCH_SIZE) {
    const batch = notesToProcess.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (note) => {
        try {
          const content = await getNoteContent(note.id);
          if (!content) return;

          const { stabilized, changesMade } = stabilizeWikilinksInContent(
            content,
            newNoteId,
            newNoteTitle
          );

          if (changesMade) {
            await updateNoteContent(note.id, stabilized);
          }
        } catch (err) {
          console.warn(`[Wikilinks] Failed to stabilize links in ${note.id}:`, err);
        }
      })
    );
  }
}
