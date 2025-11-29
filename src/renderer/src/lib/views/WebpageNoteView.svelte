<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BaseNoteView from './BaseNoteView.svelte';
  import type { NoteViewProps } from './ViewRegistry';
  import WebpageReader from './webpage/WebpageReader.svelte';
  import type {
    WebpageHighlight,
    WebpageSelectionInfo,
    WebpageMetadata
  } from './webpage/types';
  import {
    parseWebpageHighlightsFromContent,
    updateWebpageContentWithHighlights
  } from './webpage/types';
  import WebpageHighlights from './webpage/WebpageHighlights.svelte';
  import EditorHeader from '../../components/EditorHeader.svelte';
  import NoteActionBar from '../../components/NoteActionBar.svelte';
  import MetadataView from '../../components/MetadataView.svelte';
  import { workspacesStore } from '../../stores/workspacesStore.svelte.js';
  import { notesShelfStore } from '../../stores/notesShelfStore.svelte.js';
  import { reviewStore } from '../../stores/reviewStore.svelte.js';
  import { getChatService } from '../../services/chatService.js';
  import { messageBus } from '../../services/messageBus.svelte.js';
  import type { Note } from '@/server/core/notes';
  import { logger } from '../../utils/logger';

  let {
    activeNote,
    noteContent,
    metadata,
    onContentChange,
    onMetadataChange,
    onSave
  }: NoteViewProps = $props();

  // State
  let webpageReader: WebpageReader | null = $state(null);
  let webpageMetadata = $state<WebpageMetadata | null>(null);
  let showHighlights = $state(false);
  let progress = $state(0);

  // Highlight state
  let highlights = $state<WebpageHighlight[]>([]);
  let currentSelection = $state<WebpageSelectionInfo | null>(null);

  // Debounce timer for metadata updates
  let metadataUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedProgress = $state(0);

  // Capture note ID on mount
  let mountedNoteId: string | null = null;
  let latestNoteContent: string = '';

  onMount(() => {
    mountedNoteId = (activeNote?.id as string) || null;
    latestNoteContent = noteContent || '';
    logger.debug('[Webpage] Component mounted for note:', mountedNoteId);
  });

  // Keep track of the latest content while the component is mounted
  $effect(() => {
    if (activeNote?.id === mountedNoteId) {
      latestNoteContent = noteContent || '';
    }
  });

  // Parse highlights from note content on mount
  $effect(() => {
    if (noteContent) {
      highlights = parseWebpageHighlightsFromContent(noteContent);
    }
  });

  // Extract webpage path from metadata
  let webpagePath = $derived((metadata.flint_webpagePath as string) || '');

  // System fields that cannot be modified through metadata update
  const SYSTEM_FIELDS = [
    'flint_id',
    'flint_title',
    'flint_type',
    'flint_kind',
    'flint_created',
    'flint_updated',
    'flint_path',
    'flint_content',
    'flint_content_hash',
    'flint_size',
    'flint_filename',
    'flint_archived',
    // Webpage-specific system fields
    'flint_webpagePath',
    'flint_webpageOriginalPath',
    'flint_progress',
    'flint_lastRead',
    // Legacy fields
    'id',
    'title',
    'type',
    'created',
    'updated',
    'path',
    'content',
    'content_hash',
    'size',
    'filename',
    'archived'
  ];

  function filterSystemFields(meta: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (!SYSTEM_FIELDS.includes(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  // Store a snapshot of webpage-specific metadata for saving on unmount
  let webpageMetadataSnapshot: Record<string, unknown> = {};

  $effect(() => {
    webpageMetadataSnapshot = filterSystemFields($state.snapshot(metadata));
  });

  // Debounced metadata save
  function saveMetadata(prog: number, forUnmount = false): void {
    const noteId = forUnmount ? mountedNoteId : (activeNote?.id as string);

    if (!noteId) {
      console.warn('[Webpage] Cannot save progress - no note ID');
      return;
    }

    const validProgress = isNaN(prog) ? lastSavedProgress : prog;

    logger.debug('[Webpage] Saving progress:', {
      progress: validProgress,
      noteId,
      forUnmount
    });

    const baseMetadata = forUnmount
      ? webpageMetadataSnapshot
      : filterSystemFields($state.snapshot(metadata));

    const updatedMetadata = {
      ...baseMetadata,
      flint_progress: Math.round(validProgress),
      flint_lastRead: new Date().toISOString()
    };

    lastSavedProgress = validProgress;

    if (forUnmount) {
      const content = latestNoteContent || '';
      window.api
        ?.updateNote({
          identifier: noteId,
          content: content,
          metadata: updatedMetadata as Record<string, unknown>,
          silent: true
        })
        .then(() => {
          logger.debug('[Webpage] Direct API save successful');
        })
        .catch((err) => {
          console.error('[Webpage] Direct API save failed:', err);
        });
    } else {
      onMetadataChange(updatedMetadata);
    }
  }

  // Handle scroll position changes
  function handleRelocate(prog: number): void {
    progress = isNaN(prog) ? progress : prog;

    if (metadataUpdateTimer) {
      clearTimeout(metadataUpdateTimer);
    }

    const progressDiff = Math.abs(prog - lastSavedProgress);
    if (!isNaN(prog) && progressDiff >= 5) {
      metadataUpdateTimer = setTimeout(() => {
        saveMetadata(prog);
      }, 2000);
    }
  }

  onDestroy(() => {
    if (metadataUpdateTimer) {
      clearTimeout(metadataUpdateTimer);
    }
    if (progress !== lastSavedProgress && mountedNoteId) {
      logger.debug('[Webpage] Saving final progress on unmount for note:', mountedNoteId);
      saveMetadata(progress, true);
    }
  });

  function handleMetadataLoaded(meta: WebpageMetadata | null): void {
    webpageMetadata = meta;

    // Set from webpage metadata if not already set
    if (meta && metadata.flint_webpageTitle == null && meta.title) {
      const baseMetadata = filterSystemFields($state.snapshot(metadata));
      const updatedMetadata = {
        ...baseMetadata,
        flint_webpageTitle: meta.title,
        flint_webpageSiteName: meta.siteName || metadata.flint_webpageSiteName || '',
        flint_webpageAuthor: meta.byline || metadata.flint_webpageAuthor || ''
      };
      onMetadataChange(updatedMetadata);
    }
  }

  function handleWebpageError(error: Error): void {
    console.error('Webpage error:', error);
  }

  // Highlight handlers
  function handleTextSelected(selection: WebpageSelectionInfo | null): void {
    currentSelection = selection;
  }

  function addHighlight(): void {
    if (!currentSelection) return;

    const id = `h-${Date.now().toString(36)}`;
    const newHighlight: WebpageHighlight = {
      id,
      textContent: currentSelection.text,
      prefix: currentSelection.prefix,
      suffix: currentSelection.suffix,
      startOffset: currentSelection.startOffset,
      endOffset: currentSelection.endOffset,
      createdAt: new Date().toISOString()
    };

    // Update highlights array
    highlights = [...highlights, newHighlight];

    // Update note content with new highlight
    const newContent = updateWebpageContentWithHighlights(noteContent || '', highlights);
    onContentChange(newContent);

    // Clear selection
    currentSelection = null;

    // Refresh highlights in reader
    if (webpageReader) {
      webpageReader.refreshHighlights();
    }
  }

  function deleteHighlight(id: string): void {
    highlights = highlights.filter((h) => h.id !== id);

    const newContent = updateWebpageContentWithHighlights(noteContent || '', highlights);
    onContentChange(newContent);

    if (webpageReader) {
      webpageReader.refreshHighlights();
    }
  }

  function navigateToHighlight(_highlight: WebpageHighlight): void {
    // For now, just close the highlights panel
    // TODO: Implement scroll-to-highlight
    showHighlights = false;
  }

  // Display info
  let articleTitle = $derived(
    (metadata.flint_webpageTitle as string) ?? webpageMetadata?.title ?? ''
  );
  let articleSiteName = $derived(
    (metadata.flint_webpageSiteName as string) ?? webpageMetadata?.siteName ?? ''
  );
  let sourceUrl = $derived((metadata.flint_webpageUrl as string) ?? '');

  function handleArticleTitleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newTitle = input.value;
    const baseMetadata = filterSystemFields($state.snapshot(metadata));
    onMetadataChange({
      ...baseMetadata,
      flint_webpageTitle: newTitle
    });
  }

  // Note title
  let noteTitle = $derived((metadata.flint_title as string) || 'Untitled');

  // Action bar state
  let metadataExpanded = $state(false);
  let reviewEnabled = $state(false);
  let isLoadingReview = $state(false);
  let noteData = $state<Note | null>(null);

  // Load note data and review status when note changes
  $effect(() => {
    (async () => {
      const noteId = activeNote?.id as string;
      if (noteId) {
        try {
          const noteService = getChatService();
          if (await noteService.isReady()) {
            const [noteResult, isReviewEnabled] = await Promise.all([
              noteService.getNote({ identifier: noteId }),
              reviewStore.isReviewEnabled(noteId)
            ]);
            noteData = noteResult;
            reviewEnabled = isReviewEnabled;
          }
        } catch (err) {
          console.error('Failed to load note data:', err);
          reviewEnabled = false;
        }
      }
    })();
  });

  // Title change handler
  async function handleTitleChange(newTitle: string): Promise<void> {
    const noteId = activeNote?.id as string;
    if (!noteId) return;

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
        const updatedNote = await noteService.getNote({
          identifier: result.new_id || noteId
        });

        if (updatedNote) {
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

  function toggleMetadata(): void {
    metadataExpanded = !metadataExpanded;
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

  async function handleMetadataUpdate(
    updatedMetadata: Record<string, unknown>
  ): Promise<void> {
    const noteId = activeNote?.id as string;
    if (!noteId || !noteData) return;

    try {
      const noteService = getChatService();
      await noteService.updateNote({
        identifier: noteId,
        content: noteContent || '',
        metadata: $state.snapshot(
          updatedMetadata
        ) as import('@/server/types').NoteMetadata
      });

      const result = await noteService.getNote({ identifier: noteId });
      noteData = result;
    } catch (err) {
      console.error('Error updating metadata:', err);
      throw err;
    }
  }

  function openSourceUrl(): void {
    if (sourceUrl) {
      window.open(sourceUrl, '_blank');
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
    <div class="webpage-note-view">
      <!-- Standard note header -->
      <div class="header-container">
        <EditorHeader title={noteTitle} onTitleChange={handleTitleChange} />

        <NoteActionBar
          noteType={activeNote.type as string}
          onTypeChange={handleTypeChange}
          isPinned={workspacesStore.isPinned(activeNote.id as string)}
          isOnShelf={notesShelfStore.isOnShelf(activeNote.id as string)}
          {metadataExpanded}
          previewMode={false}
          {reviewEnabled}
          {isLoadingReview}
          suggestionsEnabled={false}
          onPinToggle={handlePinToggle}
          onAddToShelf={handleAddToShelf}
          onMetadataToggle={toggleMetadata}
          onPreviewToggle={() => {}}
          onReviewToggle={handleReviewToggle}
          onArchiveNote={handleArchiveNote}
        />
      </div>

      <!-- Metadata section -->
      <div class="metadata-section-container">
        <MetadataView
          note={noteData}
          expanded={metadataExpanded}
          onMetadataUpdate={handleMetadataUpdate}
        />
      </div>

      <!-- Webpage-specific actions bar -->
      <div class="webpage-actions">
        <div class="article-info">
          <input
            type="text"
            class="article-title"
            value={articleTitle}
            placeholder="Article title"
            onchange={handleArticleTitleChange}
          />
          {#if articleSiteName}
            <span class="article-site">from {articleSiteName}</span>
          {/if}
        </div>
        <div class="webpage-buttons">
          {#if sourceUrl}
            <button
              class="webpage-button"
              onclick={openSourceUrl}
              aria-label="Open source URL"
              title={sourceUrl}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 2H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V10"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
                <path
                  d="M9 2H14V7"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <path
                  d="M14 2L7 9"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
              <span>Source</span>
            </button>
          {/if}
          <button
            class="webpage-button"
            class:active={showHighlights}
            onclick={() => (showHighlights = !showHighlights)}
            aria-label="Toggle highlights"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 4H17V16H3V4Z"
                stroke="currentColor"
                stroke-width="2"
                fill="rgba(255, 235, 59, 0.3)"
              />
              <path d="M5 8H15M5 12H12" stroke="currentColor" stroke-width="2" />
            </svg>
            <span>Highlights ({highlights.length})</span>
          </button>
        </div>
      </div>

      <!-- Main content area -->
      <div class="webpage-content">
        <!-- Highlights sidebar (overlay) -->
        {#if showHighlights}
          <div class="highlights-overlay">
            <WebpageHighlights
              {highlights}
              onNavigate={navigateToHighlight}
              onDelete={deleteHighlight}
              onClose={() => (showHighlights = false)}
            />
          </div>
        {/if}

        <!-- Selection popup for adding highlights -->
        {#if currentSelection}
          <div
            class="selection-popup"
            style="left: {currentSelection.position.x}px; top: {currentSelection.position
              .y + 8}px;"
          >
            <button class="highlight-button" onclick={addHighlight}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 3H14V13H2V3Z"
                  stroke="currentColor"
                  stroke-width="1.5"
                  fill="rgba(255, 235, 59, 0.5)"
                />
              </svg>
              Highlight
            </button>
          </div>
        {/if}

        <!-- Reader panel -->
        <div class="reader-panel">
          {#if webpagePath}
            <WebpageReader
              bind:this={webpageReader}
              {webpagePath}
              {highlights}
              onRelocate={handleRelocate}
              onMetadataLoaded={handleMetadataLoaded}
              onTextSelected={handleTextSelected}
              onError={handleWebpageError}
            />
          {:else}
            <div class="no-webpage">
              <div class="no-webpage-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="18" stroke="currentColor" stroke-width="2" />
                  <path
                    d="M8 24H40M24 8C28 12 30 18 30 24C30 30 28 36 24 40M24 8C20 12 18 18 18 24C18 30 20 36 24 40"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                </svg>
              </div>
              <p>No webpage linked to this note</p>
              <p class="hint">Import a webpage to get started</p>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/snippet}
</BaseNoteView>

<style>
  .webpage-note-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary, #fff);
  }

  .header-container {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0 0.5rem;
  }

  .metadata-section-container {
    display: flex;
    justify-content: flex-start;
    width: 100%;
    padding: 0 0.5rem;
  }

  .webpage-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
    gap: 0.5rem;
  }

  .article-info {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    min-width: 0;
    overflow: hidden;
  }

  .article-title {
    font-size: 0.85rem;
    color: var(--text-primary, #333);
    font-weight: 500;
    background: transparent;
    border: none;
    outline: none;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    field-sizing: content;
    min-width: 4ch;
  }

  .article-title:hover,
  .article-title:focus {
    background: var(--bg-secondary, #f5f5f5);
  }

  .article-title::placeholder {
    color: var(--text-muted, #999);
    font-weight: normal;
  }

  .article-site {
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    font-style: italic;
    white-space: nowrap;
  }

  .webpage-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .webpage-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    color: var(--text-secondary, #666);
    font-size: 0.8rem;
    transition: all 0.15s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .webpage-button:hover {
    background: var(--bg-secondary, #f5f5f5);
    border-color: var(--border-light, #e0e0e0);
    color: var(--text-primary, #333);
  }

  .webpage-button.active {
    background: var(--bg-secondary, #f5f5f5);
    border-color: var(--accent-primary, #007bff);
    color: var(--text-primary, #333);
  }

  .webpage-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .highlights-overlay {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    z-index: 10;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }

  .selection-popup {
    position: absolute;
    transform: translateX(-50%);
    z-index: 20;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-medium, #ccc);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 0.5rem;
  }

  .highlight-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 235, 59, 0.2);
    border: 1px solid rgba(255, 235, 59, 0.5);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--text-primary, #333);
    transition: all 0.15s ease;
  }

  .highlight-button:hover {
    background: rgba(255, 235, 59, 0.4);
    border-color: rgba(255, 235, 59, 0.8);
  }

  .reader-panel {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--bg-primary, #fff);
  }

  .no-webpage {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--text-muted, #999);
    padding: 2rem;
    text-align: center;
  }

  .no-webpage-icon {
    color: var(--text-muted, #999);
    opacity: 0.5;
  }

  .no-webpage p {
    margin: 0;
  }

  .no-webpage .hint {
    font-size: 0.875rem;
  }
</style>
