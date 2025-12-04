<script lang="ts">
  import BaseNoteView from './BaseNoteView.svelte';
  import type { NoteViewProps } from './ViewRegistry';
  import DeckWidget from '../deck/DeckWidget.svelte';
  import type { DeckConfig } from '../deck/types';
  import {
    parseDeckYaml,
    serializeDeckConfig,
    createEmptyDeckConfig
  } from '../deck/yaml-utils';
  import EditorHeader from '../../components/EditorHeader.svelte';
  import { workspacesStore } from '../../stores/workspacesStore.svelte.js';
  import { notesShelfStore } from '../../stores/notesShelfStore.svelte.js';
  import { reviewStore } from '../../stores/reviewStore.svelte.js';
  import { getChatService } from '../../services/chatService.js';
  import { messageBus } from '../../services/messageBus.svelte.js';
  import { wikilinkService } from '../../services/wikilinkService.svelte';

  let {
    activeNote,
    noteContent,
    metadata,
    onContentChange,
    onMetadataChange,
    onSave
  }: NoteViewProps = $props();

  // Parse deck config from note content (which is YAML)
  let config = $derived.by(() => {
    if (!noteContent) return createEmptyDeckConfig();
    const parsed = parseDeckYaml(noteContent);
    return parsed || createEmptyDeckConfig();
  });

  // Handle config changes from DeckWidget
  function handleConfigChange(newConfig: DeckConfig): void {
    const yamlContent = serializeDeckConfig(newConfig);
    onContentChange(yamlContent);
  }

  // Handle note open from DeckWidget
  function handleNoteOpen(noteId: string): void {
    wikilinkService.handleWikilinkClick(noteId, '', false, false);
  }

  // Note title (editable) - use flint_title from metadata as canonical source
  let noteTitle = $derived((metadata.flint_title as string) || 'Untitled Deck');

  // Action bar state
  let reviewEnabled = $state(false);
  let isLoadingReview = $state(false);

  // Load review status when note changes
  $effect(() => {
    (async () => {
      const noteId = activeNote?.id as string;
      if (noteId) {
        try {
          const isReviewEnabled = await reviewStore.isReviewEnabled(noteId);
          reviewEnabled = isReviewEnabled;
        } catch (err) {
          console.error('Failed to load review status:', err);
          reviewEnabled = false;
        }
      }
    })();
  });

  // Title change handler - uses renameNote since title is a system field
  async function handleTitleChange(newTitle: string): Promise<void> {
    const noteId = activeNote?.id as string;
    if (!noteId) return;

    // Skip if unchanged (compare against canonical flint_title)
    if (newTitle === metadata.flint_title) return;

    try {
      const noteService = getChatService();
      const vault = await noteService.getCurrentVault();
      if (!vault) {
        console.error('No vault available');
        return;
      }

      const result = await noteService.renameNote({
        vaultId: vault.id,
        identifier: noteId,
        newIdentifier: newTitle
      });

      if (result.success) {
        // Get the updated note to get the new filename
        const updatedNote = await noteService.getNote({
          identifier: result.new_id || noteId
        });

        if (updatedNote) {
          // Publish rename event so the note cache and UI update
          messageBus.publish({
            type: 'note.renamed',
            oldId: noteId,
            newId: result.new_id || noteId,
            title: newTitle,
            filename: updatedNote.filename || ''
          });
        }
      }
    } catch (err) {
      console.error('Error renaming note:', err);
    }
  }

  // Action bar handlers
  async function handlePinToggle(): Promise<void> {
    const noteId = activeNote?.id as string;
    if (noteId) {
      await workspacesStore.togglePin(noteId);
    }
  }

  async function handleAddToShelf(): Promise<void> {
    const noteId = activeNote?.id as string;
    if (noteId) {
      await notesShelfStore.addNote(noteId, noteTitle, noteContent || '');
    }
  }

  async function handleReviewToggle(): Promise<void> {
    const noteId = activeNote?.id as string;
    if (!noteId) return;

    isLoadingReview = true;
    try {
      if (reviewEnabled) {
        await reviewStore.disableReview(noteId);
        reviewEnabled = false;
      } else {
        await reviewStore.enableReview(noteId);
        reviewEnabled = true;
      }
    } catch (err) {
      console.error('Error toggling review:', err);
    } finally {
      isLoadingReview = false;
    }
  }

  async function handleArchiveNote(): Promise<void> {
    const noteId = activeNote?.id as string;
    if (!noteId) return;

    try {
      const noteService = getChatService();
      const vault = await noteService.getCurrentVault();
      if (!vault) {
        console.error('No vault available');
        return;
      }
      await noteService.archiveNote({
        vaultId: vault.id,
        identifier: noteId
      });
    } catch (err) {
      console.error('Error archiving note:', err);
    }
  }

  async function handleTypeChange(newType: string): Promise<void> {
    const noteId = activeNote?.id as string;
    if (!noteId) return;

    try {
      const noteService = getChatService();
      await noteService.moveNote({
        identifier: noteId,
        newType: newType
      });
    } catch (err) {
      console.error('Error changing note type:', err);
    }
  }
</script>

<BaseNoteView
  {activeNote}
  {noteContent}
  {metadata}
  {onContentChange}
  {onMetadataChange}
  {onSave}
>
  {#snippet children({
    handleContentChange: _handleContentChange,
    handleSave: _handleSave
  })}
    <div class="deck-note-view">
      <!-- Standard note header -->
      <EditorHeader
        title={noteTitle}
        noteType={activeNote.type as string}
        onTitleChange={handleTitleChange}
        onTypeChange={handleTypeChange}
        isPinned={workspacesStore.isPinned(activeNote.id as string)}
        isOnShelf={notesShelfStore.isOnShelf(activeNote.id as string)}
        previewMode={false}
        {reviewEnabled}
        {isLoadingReview}
        suggestionsEnabled={false}
        onPinToggle={handlePinToggle}
        onAddToShelf={handleAddToShelf}
        onPreviewToggle={() => {}}
        onReviewToggle={handleReviewToggle}
        onArchiveNote={handleArchiveNote}
      />

      <!-- Deck content -->
      <div class="deck-content">
        <DeckWidget
          {config}
          onConfigChange={handleConfigChange}
          onNoteOpen={handleNoteOpen}
        />
      </div>
    </div>
  {/snippet}
</BaseNoteView>

<style>
  .deck-note-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary, #fff);
  }

  /* Deck content */
  .deck-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 0.5rem;
  }
</style>
