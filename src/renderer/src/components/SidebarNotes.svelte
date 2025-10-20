<script lang="ts">
  import { onMount } from 'svelte';
  import { sidebarNotesStore } from '../stores/sidebarNotesStore.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte';
  import {
    noteDocumentRegistry,
    type NoteDocument
  } from '../stores/noteDocumentRegistry.svelte';
  import SidebarNoteItem from './SidebarNoteItem.svelte';

  // Map of noteId -> NoteDocument for sidebar notes
  let sidebarDocs = $state<Map<string, NoteDocument>>(new Map());

  // Track original titles for cancel/revert
  const originalTitles = new Map<string, string>();

  // Track the note IDs to detect changes
  let previousNoteIds: string[] = [];

  // Open documents for all sidebar notes
  $effect(() => {
    const notes = sidebarNotesStore.notes;
    const currentNoteIds = notes.map((n) => n.noteId);

    // Only proceed if the note list actually changed
    const hasChanged =
      currentNoteIds.length !== previousNoteIds.length ||
      currentNoteIds.some((id, i) => id !== previousNoteIds[i]);

    if (!hasChanged) {
      return;
    }

    previousNoteIds = currentNoteIds;

    // Perform async operations outside the reactive context
    (async () => {
      const newDocs = new Map<string, NoteDocument>();

      // Open documents for all current sidebar notes
      for (const note of notes) {
        const editorId = `sidebar-${note.noteId}`;
        const doc = await noteDocumentRegistry.open(note.noteId, editorId);
        newDocs.set(note.noteId, doc);
      }

      // Close documents that are no longer in sidebar
      const oldDocs = sidebarDocs;
      for (const [noteId] of oldDocs) {
        if (!newDocs.has(noteId)) {
          const editorId = `sidebar-${noteId}`;
          noteDocumentRegistry.close(noteId, editorId);
        }
      }

      sidebarDocs = newDocs;
    })();
  });

  // Cleanup: close all documents when component is destroyed
  onMount(() => {
    return () => {
      for (const [noteId] of sidebarDocs) {
        const editorId = `sidebar-${noteId}`;
        noteDocumentRegistry.close(noteId, editorId);
      }
    };
  });

  function handleDisclosureToggle(noteId: string): void {
    sidebarNotesStore.toggleExpanded(noteId);
  }

  async function handleRemoveNote(noteId: string): Promise<void> {
    // Close the document before removing from sidebar
    const editorId = `sidebar-${noteId}`;
    noteDocumentRegistry.close(noteId, editorId);

    await sidebarNotesStore.removeNote(noteId);
  }

  function handleContentChange(noteId: string, content: string): void {
    const doc = sidebarDocs.get(noteId);
    if (doc) {
      // Update shared document - this automatically syncs to other editors
      doc.updateContent(content);
    }
  }

  function handleTitleFocus(noteId: string, currentTitle: string): void {
    // Save original title when editing starts
    originalTitles.set(noteId, currentTitle);
  }

  async function handleTitleBlur(noteId: string, newTitle: string): Promise<void> {
    const originalTitle = originalTitles.get(noteId);
    if (originalTitle !== undefined && newTitle !== originalTitle) {
      const doc = sidebarDocs.get(noteId);
      if (doc) {
        // Update shared document - this automatically syncs to other editors
        // Note: With immutable note IDs, the ID never changes during a rename
        await doc.updateTitle(newTitle);
      }
    }
    originalTitles.delete(noteId);
  }

  function handleTitleKeyDown(event: KeyboardEvent, noteId: string): void {
    const target = event.target as HTMLInputElement;

    if (event.key === 'Enter') {
      event.preventDefault();
      target.blur(); // Trigger blur which will save
    } else if (event.key === 'Escape') {
      event.preventDefault();
      const originalTitle = originalTitles.get(noteId);
      if (originalTitle !== undefined) {
        target.value = originalTitle; // Revert to original
      }
      originalTitles.delete(noteId);
      target.blur();
    }
  }

  async function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean,
    shiftKey?: boolean
  ): Promise<void> {
    // Use centralized wikilink service for navigation
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate, shiftKey);
  }
</script>

<div class="sidebar-notes">
  <div class="sidebar-notes-header">
    <h3>Sidebar Notes</h3>
  </div>

  <div class="notes-list">
    {#if sidebarNotesStore.notes.length === 0}
      <div class="empty-state">
        <p>No notes in sidebar</p>
        <p class="hint">Use "Add to Sidebar" in the note editor to add notes here</p>
      </div>
    {:else}
      {#each sidebarNotesStore.notes as note (note.noteId)}
        {@const doc = sidebarDocs.get(note.noteId)}
        {#if doc}
          <SidebarNoteItem
            {doc}
            isExpanded={note.isExpanded}
            onDisclosureToggle={() => handleDisclosureToggle(note.noteId)}
            onRemove={() => handleRemoveNote(note.noteId)}
            onTitleFocus={(currentTitle) => handleTitleFocus(note.noteId, currentTitle)}
            onTitleBlur={(newTitle) => handleTitleBlur(note.noteId, newTitle)}
            onTitleKeyDown={(e) => handleTitleKeyDown(e, note.noteId)}
            onContentChange={(content) => handleContentChange(note.noteId, content)}
            onWikilinkClick={handleWikilinkClick}
          />
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  .sidebar-notes {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .sidebar-notes-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .sidebar-notes-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .notes-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-state p {
    margin: 0.5rem 0;
  }

  .empty-state .hint {
    font-size: 0.85rem;
    color: var(--text-tertiary);
  }
</style>
