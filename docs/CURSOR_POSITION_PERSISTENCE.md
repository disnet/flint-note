# Cursor Position Persistence Implementation Plan

## Overview

This document outlines the implementation plan for persisting and restoring cursor positions in the note editor. The cursor position should be restored seamlessly when switching between notes and when the app restarts, with no visible cursor jumps or flickers.

## Current Architecture

The app uses:
- **CodeMirror 6** as the editor in `NoteEditor.svelte` 
- **Vault-specific storage** via `VaultDataStorageService`
- **Note management** through `activeNoteStore`, `noteStore`, and `noteNavigationService`
- **Existing persistence APIs** like `loadActiveNote`/`saveActiveNote`

## Requirements

1. **Persistence**: Cursor position should persist across note switches and app restarts
2. **Seamless Restoration**: When reopening a note, the CodeMirror instance should be initialized with both text content AND cursor position together - no visible cursor jumps
3. **Performance**: No noticeable performance impact during typing or navigation
4. **Vault Isolation**: Cursor positions should be isolated per vault

## Data Model & Storage Strategy

### Cursor Position Data Structure
```typescript
interface CursorPosition {
  noteId: string;
  position: number;          // Absolute character offset from start
  selectionStart?: number;   // For text selections (start of selection)
  selectionEnd?: number;     // For text selections (end of selection)
  lastUpdated: string;       // ISO timestamp
}

interface CursorPositionsData {
  version: string;
  vaultId: string;
  positions: Record<string, CursorPosition>;  // noteId -> position
  lastUpdated: string;
}
```

### Storage Implementation
- Extend `VaultDataStorageService` with cursor position methods
- Store in `vault-data/{vaultId}/cursor-positions.json`
- Follow existing patterns from pinned notes storage
- Clean up old positions periodically (positions older than 30 days)

## Implementation Phases

### Phase 1: Storage Infrastructure

#### 1.1 Extend VaultDataStorageService
```typescript
// Add to VaultDataStorageService
async loadCursorPositions(vaultId: string): Promise<Record<string, CursorPosition>>
async saveCursorPositions(vaultId: string, positions: Record<string, CursorPosition>): Promise<void>
async getCursorPosition(vaultId: string, noteId: string): Promise<CursorPosition | null>
async setCursorPosition(vaultId: string, noteId: string, position: CursorPosition): Promise<void>
```

#### 1.2 Add IPC APIs
- Extend preload API with cursor position methods
- Add main process handlers in `index.ts`
- Follow existing patterns from pinned notes APIs

#### 1.3 Create Cursor Position Store
```typescript
// New file: cursorPositionStore.svelte.ts
class CursorPositionStore {
  // In-memory cache of cursor positions for current vault
  // Methods to get/set positions
  // Vault switching support
  // Debounced persistence
}
```

### Phase 2: Seamless Editor Integration

#### 2.1 Pre-load Cursor Position
**Critical for seamless restoration**: Before creating CodeMirror instance, fetch the cursor position alongside the note content.

```typescript
// In NoteEditor.svelte - loadNote() method
async function loadNote(note: NoteMetadata): Promise<void> {
  try {
    error = null;
    const noteService = getChatService();

    if (await noteService.isReady()) {
      // Load BOTH content and cursor position before creating editor
      const [noteResult, cursorPosition] = await Promise.all([
        noteService.getNote({ identifier: note.id }),
        cursorPositionStore.getCursorPosition(note.id)
      ]);
      
      noteData = noteResult;
      noteContent = noteResult?.content ?? '';
      
      // Store cursor position for use in updateEditorContent()
      pendingCursorPosition = cursorPosition;
      
      updateEditorContent();
    } else {
      throw new Error('Note service not ready');
    }
  } catch (err) {
    // error handling...
  }
}
```

#### 2.2 Initialize CodeMirror with Cursor Position
Modify the editor creation/update logic to set initial cursor position during content initialization:

```typescript
// In NoteEditor.svelte - updateEditorContent() method
function updateEditorContent(): void {
  if (editorView && noteContent !== undefined) {
    const currentDoc = editorView.state.doc.toString();
    if (currentDoc !== noteContent) {
      const changes = {
        from: 0,
        to: currentDoc.length,
        insert: noteContent
      };
      
      // Calculate cursor position for new content
      let selection = undefined;
      if (pendingCursorPosition) {
        const position = Math.min(pendingCursorPosition.position, noteContent.length);
        
        if (pendingCursorPosition.selectionStart !== undefined && 
            pendingCursorPosition.selectionEnd !== undefined) {
          // Restore selection range
          const start = Math.min(pendingCursorPosition.selectionStart, noteContent.length);
          const end = Math.min(pendingCursorPosition.selectionEnd, noteContent.length);
          selection = { anchor: start, head: end };
        } else {
          // Restore cursor position
          selection = { anchor: position, head: position };
        }
        
        // Clear pending position
        pendingCursorPosition = null;
      }
      
      // Apply content and cursor position in single transaction
      editorView.dispatch({
        changes,
        selection,
        scrollIntoView: !!selection
      });
      
      hasChanges = false;
    }
  }
}
```

#### 2.3 Track Cursor Changes
```typescript
// Add to CodeMirror extensions in createEditor()
EditorView.updateListener.of((update) => {
  if (update.selectionSet && !update.docChanged) {
    // Only cursor/selection moved - debounce save
    debouncedSaveCursorPosition();
  }
  if (update.docChanged) {
    hasChanges = true;
    noteContent = update.state.doc.toString();
    debouncedSave();
    // Also save cursor position when content changes
    debouncedSaveCursorPosition();
  }
})
```

### Phase 3: Note Navigation Integration

#### 3.1 Save Position Before Note Switch
```typescript
// In NoteEditor.svelte - add cleanup method
async function saveCurrentCursorPosition(): Promise<void> {
  if (editorView && note) {
    const selection = editorView.state.selection.main;
    const position: CursorPosition = {
      noteId: note.id,
      position: selection.anchor,
      selectionStart: selection.from !== selection.to ? selection.from : undefined,
      selectionEnd: selection.from !== selection.to ? selection.to : undefined,
      lastUpdated: new Date().toISOString()
    };
    
    await cursorPositionStore.setCursorPosition(note.id, position);
  }
}

// Call saveCurrentCursorPosition() before note switches
// Integrate with noteNavigationService
```

#### 3.2 App Lifecycle Integration
```typescript
// In activeNoteStore or main app component
async function onBeforeUnload(): Promise<void> {
  // Save all pending cursor positions before app closes
  await cursorPositionStore.flushPendingSaves();
}

async function onAppStart(): Promise<void> {
  // Restore active note with cursor position
  const activeNote = await activeNoteStore.restoreActiveNote();
  if (activeNote) {
    // Position will be restored via normal loadNote() flow
  }
}
```

### Phase 4: Edge Case Handling

#### 4.1 Content Change Adaptation
- When note content is significantly modified (by agents), validate cursor positions
- If position is beyond new content length, place cursor at end
- Provide intelligent adjustment for common content changes

#### 4.2 Multi-Selection Support
- Store multiple cursor positions if CodeMirror has multiple selections
- Restore complex selection ranges properly

#### 4.3 Cleanup and Maintenance
- Periodically clean up cursor positions for deleted notes
- Remove positions older than 30 days to prevent storage bloat
- Handle vault switching properly (clear positions for old vault)

## Performance Considerations

### Debounced Updates
- **Cursor Movement**: Save position 1000ms after cursor stops moving
- **Content Changes**: Save position 500ms after typing stops
- **Note Switches**: Immediate save before switching

### Memory Management
- Keep cursor positions in memory during session
- Only persist to disk on debounced intervals and app events
- Clear memory cache when switching vaults

### Storage Optimization
- Compress old position data
- Limit storage to most recent 1000 positions per vault
- Batch multiple position updates when possible

## Technical Implementation Details

### CodeMirror Integration Points
1. **EditorState.create()**: Initialize with cursor position when creating editor
2. **EditorView.dispatch()**: Set content and position atomically
3. **EditorView.updateListener**: Track cursor and selection changes
4. **Selection API**: Store and restore selection ranges

### File Changes Required
- `src/main/vault-data-storage-service.ts`: Add cursor position methods
- `src/main/index.ts`: Add IPC handlers
- `src/preload/index.ts`: Add API methods
- `src/renderer/src/services/cursorPositionStore.svelte.ts`: New store
- `src/renderer/src/components/NoteEditor.svelte`: Integration logic
- `src/renderer/src/env.d.ts`: Type definitions

## Benefits

1. **Seamless UX**: No visible cursor jumps when reopening notes
2. **Persistent State**: Cursor position survives app restarts and note switches
3. **Performance**: Minimal impact on typing and navigation performance
4. **Robust**: Handles edge cases and content changes gracefully
5. **Consistent**: Follows existing codebase patterns and storage architecture

## Success Metrics

1. **No Visual Jumps**: Cursor appears in correct position immediately when note opens
2. **Performance**: No measurable impact on editor responsiveness
3. **Reliability**: Position restoration works across all note navigation scenarios
4. **Persistence**: Positions survive app restarts and vault switches