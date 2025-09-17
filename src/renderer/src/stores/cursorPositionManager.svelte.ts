import { cursorPositionStore } from '../services/cursorPositionStore.svelte.js';

export interface CursorPosition {
  noteId: string;
  position: number;
  selectionStart?: number;
  selectionEnd?: number;
  lastUpdated: string;
}

export class CursorPositionManager {
  private cursorSaveTimeout: number | null = null;

  constructor(private debounceDelay = 1000) {}

  debouncedSaveCursorPosition(noteId: string, position: CursorPosition): void {
    if (this.cursorSaveTimeout) {
      clearTimeout(this.cursorSaveTimeout);
    }

    this.cursorSaveTimeout = window.setTimeout(async () => {
      try {
        await cursorPositionStore.setCursorPosition(noteId, position);
      } catch (error) {
        console.warn('Failed to save cursor position:', error);
      }
    }, this.debounceDelay);
  }

  async saveCursorPositionImmediately(
    noteId: string,
    position: CursorPosition
  ): Promise<void> {
    try {
      await cursorPositionStore.saveCurrentCursorPosition(noteId, position);
    } catch (error) {
      console.warn('Failed to save cursor position immediately:', error);
      throw error;
    }
  }

  async saveCursorPositionOnContentChange(
    noteId: string,
    position: CursorPosition
  ): Promise<void> {
    try {
      await cursorPositionStore.setCursorPositionOnContentChange(noteId, position);
    } catch (error) {
      console.warn('Failed to save cursor position on content change:', error);
      throw error;
    }
  }

  async getCursorPosition(noteId: string): Promise<CursorPosition | null> {
    try {
      return await cursorPositionStore.getCursorPosition(noteId);
    } catch (error) {
      console.warn('Failed to get cursor position:', error);
      return null;
    }
  }

  createCursorPosition(
    noteId: string,
    anchor: number,
    from?: number,
    to?: number
  ): CursorPosition {
    return {
      noteId,
      position: anchor,
      selectionStart: from !== to ? from : undefined,
      selectionEnd: from !== to ? to : undefined,
      lastUpdated: new Date().toISOString()
    };
  }

  destroy(): void {
    if (this.cursorSaveTimeout) {
      clearTimeout(this.cursorSaveTimeout);
    }
  }
}
