import { BrowserWindow } from 'electron';
import type { NoteMetadata } from '../server/types';

// Event type definitions - must match renderer's NoteEvent type
export type NoteEvent =
  | { type: 'note.created'; note: NoteMetadata }
  | { type: 'note.updated'; noteId: string; updates: Partial<NoteMetadata> }
  | { type: 'note.deleted'; noteId: string }
  | { type: 'note.renamed'; oldId: string; newId: string }
  | { type: 'note.moved'; noteId: string; oldType: string; newType: string }
  | {
      type: 'note.linksChanged';
      noteId: string;
      addedLinks?: string[];
      removedLinks?: string[];
    }
  | { type: 'notes.bulkRefresh'; notes: NoteMetadata[] }
  | { type: 'vault.switched'; vaultId: string }
  | { type: 'noteType.created'; typeName: string }
  | { type: 'noteType.updated'; typeName: string }
  | { type: 'noteType.deleted'; typeName: string };

/**
 * Publishes a note event to all renderer processes
 * This is the main process side of the event sourcing architecture
 */
export function publishNoteEvent(event: NoteEvent): void {
  // Skip event publishing in test environment
  const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  if (isTestEnv) {
    return;
  }

  // BrowserWindow may not be available in all environments
  try {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((window) => {
      window.webContents.send('note-event', event);
    });
  } catch (error) {
    // Silently fail if BrowserWindow is not available
    console.warn('Failed to publish note event:', error);
  }
}
