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
  | { type: 'vault.switched'; vaultId: string };

/**
 * Publishes a note event to all renderer processes
 * This is the main process side of the event sourcing architecture
 */
export function publishNoteEvent(event: NoteEvent): void {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach((window) => {
    window.webContents.send('note-event', event);
  });
}
