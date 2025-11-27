<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BaseNoteView from './BaseNoteView.svelte';
  import type { NoteViewProps } from './ViewRegistry';
  import EpubReader, { type SelectionInfo } from './epub/EpubReader.svelte';
  import type { TocItem, EpubMetadata, EpubLocation, EpubHighlight } from './epub/types';
  import { parseHighlightsFromContent, updateContentWithHighlights } from './epub/types';
  import EpubToc from './epub/EpubToc.svelte';
  import EpubProgress from './epub/EpubProgress.svelte';
  import EpubHighlights from './epub/EpubHighlights.svelte';
  import EditorHeader from '../../components/EditorHeader.svelte';
  import NoteActionBar from '../../components/NoteActionBar.svelte';
  import MetadataView from '../../components/MetadataView.svelte';
  import { workspacesStore } from '../../stores/workspacesStore.svelte.js';
  import { notesShelfStore } from '../../stores/notesShelfStore.svelte.js';
  import { reviewStore } from '../../stores/reviewStore.svelte.js';
  import { getChatService } from '../../services/chatService.js';
  import { messageBus } from '../../services/messageBus.svelte.js';
  import type { Note } from '@/server/core/notes';

  let {
    activeNote,
    noteContent,
    metadata,
    onContentChange,
    onMetadataChange,
    onSave
  }: NoteViewProps = $props();

  // State
  let epubReader: EpubReader | null = $state(null);
  let toc = $state<TocItem[]>([]);
  let epubMetadata = $state<EpubMetadata | null>(null);
  let showToc = $state(false);
  let showHighlights = $state(false);
  let currentCfi = $state('');
  let progress = $state(0);
  let currentSection = $state(0);
  let totalSections = $state(0);

  // Highlight state
  let highlights = $state<EpubHighlight[]>([]);
  let currentSelection = $state<SelectionInfo | null>(null);

  // Debounce timer for metadata updates
  let metadataUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedProgress = $state(0);
  let lastSavedCfi = $state('');

  // Capture note ID on mount - activeNote can change before onDestroy runs!
  let mountedNoteId: string | null = null;
  // Track the latest content for this note (updated via effect)
  let latestNoteContent: string = '';

  onMount(() => {
    mountedNoteId = (activeNote?.id as string) || null;
    latestNoteContent = noteContent || '';
    console.log('[EPUB] Component mounted for note:', mountedNoteId);
  });

  // Keep track of the latest content while the component is mounted
  $effect(() => {
    // Only update if it's for our mounted note
    if (activeNote?.id === mountedNoteId) {
      latestNoteContent = noteContent || '';
    }
  });

  // Parse highlights from note content on mount
  $effect(() => {
    if (noteContent) {
      highlights = parseHighlightsFromContent(noteContent);
    }
  });

  // Extract EPUB path from metadata
  let epubPath = $derived((metadata.flint_epubPath as string) || '');

  // System fields that cannot be modified through metadata update
  // NOTE: This must be kept in sync with SYSTEM_FIELDS in src/server/core/system-fields.ts
  const SYSTEM_FIELDS = [
    // New flint_* prefixed fields
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
    // EPUB-specific system fields (managed by the epub reader)
    'flint_epubPath',
    'flint_epubTitle',
    'flint_epubAuthor',
    'flint_currentCfi',
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

  // Helper to filter out system fields from metadata
  function filterSystemFields(meta: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (!SYSTEM_FIELDS.includes(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }

  // Helper to extract author name from various formats foliate-js might return
  // Could be: string, string[], { name: string }, { name: string }[]
  function extractAuthorName(author: unknown): string {
    if (!author) return '';
    if (typeof author === 'string') return author;
    if (Array.isArray(author)) {
      return author
        .map((a) => (typeof a === 'string' ? a : (a as { name?: string })?.name || ''))
        .filter(Boolean)
        .join(', ');
    }
    if (typeof author === 'object' && author !== null) {
      return (author as { name?: string }).name || '';
    }
    return String(author);
  }

  // Store a snapshot of epub-specific metadata for saving on unmount
  let epubMetadataSnapshot: Record<string, unknown> = {};

  // Update snapshot when metadata changes
  $effect(() => {
    epubMetadataSnapshot = filterSystemFields($state.snapshot(metadata));
  });

  // Debounced metadata save
  function saveMetadata(cfi: string, prog: number, forUnmount = false): void {
    // Use mounted note ID for unmount saves, otherwise use active note
    const noteId = forUnmount ? mountedNoteId : (activeNote?.id as string);

    if (!noteId) {
      console.warn('[EPUB] Cannot save position - no note ID');
      return;
    }

    // Ensure progress is a valid number
    const validProgress = isNaN(prog) ? lastSavedProgress : prog;

    console.log('[EPUB] Saving position:', {
      cfi,
      progress: validProgress,
      noteId,
      forUnmount
    });

    // Use snapshot for unmount, otherwise use current metadata
    const baseMetadata = forUnmount
      ? epubMetadataSnapshot
      : filterSystemFields($state.snapshot(metadata));

    const updatedMetadata = {
      ...baseMetadata,
      flint_currentCfi: cfi,
      flint_progress: Math.round(validProgress),
      flint_lastRead: new Date().toISOString()
    };

    lastSavedProgress = validProgress;
    lastSavedCfi = cfi;

    if (forUnmount) {
      // On unmount, save directly via API to ensure it persists
      // The callback might be stale at this point
      const content = latestNoteContent || '';
      console.log(
        '[EPUB] Saving via direct API call for unmount, content length:',
        content.length
      );
      window.api
        ?.updateNote({
          identifier: noteId,
          content: content,
          metadata: updatedMetadata as Record<string, unknown>,
          silent: true
        })
        .then(() => {
          console.log('[EPUB] Direct API save successful');
        })
        .catch((err) => {
          console.error('[EPUB] Direct API save failed:', err);
        });
    } else {
      // During normal operation, use the callback
      onMetadataChange(updatedMetadata);
    }
  }

  // Handle EPUB navigation events
  function handleRelocate(cfi: string, prog: number, location: EpubLocation): void {
    console.log('[EPUB] handleRelocate called:', { cfi, progress: prog, location });
    currentCfi = cfi;
    // Ensure progress is valid
    progress = isNaN(prog) ? progress : prog;
    currentSection = location.index;
    totalSections = location.totalLocations || 0;

    // Debounce metadata updates - only save after user stops navigating for 1 second
    // Also only save if progress changed significantly (more than 1%)
    if (metadataUpdateTimer) {
      clearTimeout(metadataUpdateTimer);
    }

    const progressDiff = Math.abs(prog - lastSavedProgress);
    if (!isNaN(prog) && progressDiff >= 1) {
      metadataUpdateTimer = setTimeout(() => {
        saveMetadata(cfi, prog);
      }, 1000);
    }
  }

  // Cleanup timer on destroy
  onDestroy(() => {
    if (metadataUpdateTimer) {
      clearTimeout(metadataUpdateTimer);
    }
    // Always save final position if it changed - use mounted values!
    if (currentCfi && currentCfi !== lastSavedCfi && mountedNoteId) {
      console.log('[EPUB] Saving final position on unmount for note:', mountedNoteId);
      saveMetadata(currentCfi, progress, true);
    }
  });

  function handleTocLoaded(tocItems: TocItem[]): void {
    toc = tocItems;
  }

  function handleMetadataLoaded(meta: EpubMetadata): void {
    epubMetadata = meta;

    // Update note metadata with EPUB metadata if not already set
    if (!metadata.flint_epubTitle && meta.title) {
      // Use $state.snapshot() to ensure the object is serializable for IPC
      // Filter out system fields that can't be modified
      const baseMetadata = filterSystemFields($state.snapshot(metadata));
      const updatedMetadata = {
        ...baseMetadata,
        flint_epubTitle: meta.title,
        flint_epubAuthor: extractAuthorName(meta.author)
      };
      onMetadataChange(updatedMetadata);
    }
  }

  function handleEpubError(error: Error): void {
    console.error('EPUB error:', error);
  }

  // Highlight handlers
  function handleTextSelected(selection: SelectionInfo | null): void {
    currentSelection = selection;
  }

  function addHighlight(): void {
    if (!currentSelection || !epubReader) return;

    const id = `h-${Date.now().toString(36)}`;
    const newHighlight: EpubHighlight = {
      id,
      cfi: currentSelection.cfi,
      text: currentSelection.text,
      createdAt: new Date().toISOString()
    };

    // Add to reader
    epubReader.addHighlight(id);

    // Update highlights array
    highlights = [...highlights, newHighlight];

    // Update note content with new highlight
    const newContent = updateContentWithHighlights(noteContent || '', highlights);
    onContentChange(newContent);

    // Clear selection
    currentSelection = null;
  }

  function deleteHighlight(id: string): void {
    // Remove from reader
    if (epubReader) {
      epubReader.removeHighlight(id);
    }

    // Update highlights array
    highlights = highlights.filter((h) => h.id !== id);

    // Update note content
    const newContent = updateContentWithHighlights(noteContent || '', highlights);
    onContentChange(newContent);
  }

  async function navigateToHighlight(cfi: string): Promise<void> {
    if (epubReader) {
      await epubReader.goToCfi(cfi);
      showHighlights = false;
    }
  }

  // Navigation handlers
  async function handleTocNavigate(href: string): Promise<void> {
    if (epubReader) {
      await epubReader.goToHref(href);
      showToc = false;
    }
  }

  async function handlePrev(): Promise<void> {
    if (epubReader) {
      await epubReader.prevPage();
    }
  }

  async function handleNext(): Promise<void> {
    if (epubReader) {
      await epubReader.nextPage();
    }
  }

  // Initialize with saved CFI
  let initialCfi = $derived((metadata.flint_currentCfi as string) || '');

  // Book display info (author shown in EPUB actions bar)
  let bookAuthor = $derived(
    (metadata.flint_epubAuthor as string) || extractAuthorName(epubMetadata?.author) || ''
  );

  // Note title (editable) - use flint_title from metadata as canonical source
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

      // Refresh note data
      const result = await noteService.getNote({ identifier: noteId });
      noteData = result;
    } catch (err) {
      console.error('Error updating metadata:', err);
      throw err;
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
    <div class="epub-note-view">
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

      <!-- EPUB-specific actions bar -->
      <div class="epub-actions">
        {#if bookAuthor}
          <span class="book-author">by {bookAuthor}</span>
        {/if}
        <div class="epub-buttons">
          <button
            class="epub-button"
            class:active={showHighlights}
            onclick={() => {
              showHighlights = !showHighlights;
              if (showHighlights) showToc = false;
            }}
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
          <button
            class="epub-button"
            class:active={showToc}
            onclick={() => {
              showToc = !showToc;
              if (showToc) showHighlights = false;
            }}
            aria-label="Toggle table of contents"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 5H17M3 10H17M3 15H12"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>TOC</span>
          </button>
        </div>
      </div>

      <!-- Main content area -->
      <div class="epub-content">
        <!-- TOC sidebar (overlay) -->
        {#if showToc}
          <div class="toc-overlay">
            <EpubToc
              {toc}
              currentHref={currentCfi}
              onNavigate={handleTocNavigate}
              onClose={() => (showToc = false)}
            />
          </div>
        {/if}

        <!-- Highlights sidebar (overlay) -->
        {#if showHighlights}
          <div class="highlights-overlay">
            <EpubHighlights
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
          {#if epubPath}
            <EpubReader
              bind:this={epubReader}
              {epubPath}
              {initialCfi}
              {highlights}
              onRelocate={handleRelocate}
              onTocLoaded={handleTocLoaded}
              onMetadataLoaded={handleMetadataLoaded}
              onTextSelected={handleTextSelected}
              onError={handleEpubError}
            />
          {:else}
            <div class="no-epub">
              <div class="no-epub-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path
                    d="M8 6C8 4.89543 8.89543 4 10 4H30L40 14V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V6Z"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <path d="M30 4V14H40" stroke="currentColor" stroke-width="2" />
                  <path
                    d="M16 24H32M16 30H28M16 36H24"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </div>
              <p>No EPUB file linked to this note</p>
              <p class="hint">Import an EPUB file to get started</p>
            </div>
          {/if}
        </div>
      </div>

      <!-- Footer with progress -->
      {#if epubPath}
        <EpubProgress
          {progress}
          {currentSection}
          {totalSections}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      {/if}
    </div>
  {/snippet}
</BaseNoteView>

<style>
  .epub-note-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary, #fff);
  }

  /* Header container */
  .header-container {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0 0.5rem;
  }

  /* Metadata section */
  .metadata-section-container {
    display: flex;
    justify-content: flex-start;
    width: 100%;
    padding: 0 0.5rem;
  }

  /* EPUB-specific actions bar */
  .epub-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
    gap: 0.5rem;
  }

  .book-author {
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    font-style: italic;
  }

  .epub-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .epub-button {
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
  }

  .epub-button:hover {
    background: var(--bg-secondary, #f5f5f5);
    border-color: var(--border-light, #e0e0e0);
    color: var(--text-primary, #333);
  }

  .epub-button.active {
    background: var(--bg-secondary, #f5f5f5);
    border-color: var(--accent-primary, #007bff);
    color: var(--text-primary, #333);
  }

  /* Main content */
  .epub-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .toc-overlay,
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

  /* No EPUB state */
  .no-epub {
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

  .no-epub-icon {
    color: var(--text-muted, #999);
    opacity: 0.5;
  }

  .no-epub p {
    margin: 0;
  }

  .no-epub .hint {
    font-size: 0.875rem;
  }
</style>
