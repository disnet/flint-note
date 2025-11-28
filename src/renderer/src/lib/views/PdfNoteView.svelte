<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BaseNoteView from './BaseNoteView.svelte';
  import type { NoteViewProps } from './ViewRegistry';
  import PdfReader from './pdf/PdfReader.svelte';
  import type {
    PdfOutlineItem,
    PdfMetadata,
    PdfLocation,
    PdfHighlight,
    PdfSelectionInfo
  } from './pdf/types';
  import {
    parsePdfHighlightsFromContent,
    updatePdfContentWithHighlights
  } from './pdf/types';
  import PdfToc from './pdf/PdfToc.svelte';
  import PdfHighlights from './pdf/PdfHighlights.svelte';
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
  let pdfReader: PdfReader | null = $state(null);
  let outline = $state<PdfOutlineItem[]>([]);
  let pdfMetadata = $state<PdfMetadata | null>(null);
  let showToc = $state(false);
  let showHighlights = $state(false);
  let currentPage = $state(1);
  let totalPages = $state(1);
  let progress = $state(0);

  // Highlight state
  let highlights = $state<PdfHighlight[]>([]);
  let currentSelection = $state<PdfSelectionInfo | null>(null);

  // Zoom state
  const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const DEFAULT_ZOOM_INDEX = 4; // 1.5 (150%)
  let zoomIndex = $state(DEFAULT_ZOOM_INDEX);
  let zoomScale = $derived(ZOOM_LEVELS[zoomIndex]);

  // Debounce timer for metadata updates
  let metadataUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedProgress = $state(0);
  let lastSavedPage = $state(1);

  // Capture note ID on mount
  let mountedNoteId: string | null = null;
  let latestNoteContent: string = '';
  let cleanupMenuListener: (() => void) | null = null;

  onMount(() => {
    mountedNoteId = (activeNote?.id as string) || null;
    latestNoteContent = noteContent || '';

    // Parse highlights from content
    highlights = parsePdfHighlightsFromContent(noteContent || '');

    // Enable pdf menu items
    window.api?.setMenuActivePdf(true);

    // Listen for menu actions
    cleanupMenuListener =
      window.api?.onMenuAction((action: string) => {
        if (action === 'reader-prev') {
          handlePrev();
        } else if (action === 'reader-next') {
          handleNext();
        }
      }) || null;
  });

  // Keep track of the latest content while the component is mounted
  $effect(() => {
    if (activeNote?.id === mountedNoteId) {
      latestNoteContent = noteContent || '';
    }
  });

  // Extract PDF path from metadata
  let pdfPath = $derived((metadata.flint_pdfPath as string) || '');

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
    // PDF-specific system fields (path is system-managed, title/author are user-editable)
    'flint_pdfPath',
    'flint_currentPage',
    'flint_totalPages',
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

  // Store a snapshot of pdf-specific metadata for saving on unmount
  let pdfMetadataSnapshot: Record<string, unknown> = {};

  $effect(() => {
    pdfMetadataSnapshot = filterSystemFields($state.snapshot(metadata));
  });

  // Debounced metadata save
  function saveMetadata(page: number, prog: number, forUnmount = false): void {
    const noteId = forUnmount ? mountedNoteId : (activeNote?.id as string);

    if (!noteId) {
      return;
    }

    const validProgress = isNaN(prog) ? lastSavedProgress : prog;

    const baseMetadata = forUnmount
      ? pdfMetadataSnapshot
      : filterSystemFields($state.snapshot(metadata));

    const updatedMetadata = {
      ...baseMetadata,
      flint_currentPage: page,
      flint_totalPages: totalPages,
      flint_progress: Math.round(validProgress),
      flint_lastRead: new Date().toISOString()
    };

    lastSavedProgress = validProgress;
    lastSavedPage = page;

    if (forUnmount) {
      const content = latestNoteContent || '';
      window.api
        ?.updateNote({
          identifier: noteId,
          content: content,
          metadata: updatedMetadata as Record<string, unknown>,
          silent: true
        })
        .catch((err) => {
          console.error('[PDF] Direct API save failed:', err);
        });
    } else {
      onMetadataChange(updatedMetadata);
    }
  }

  // Handle PDF navigation events
  function handleRelocate(page: number, prog: number, location: PdfLocation): void {
    currentPage = page;
    totalPages = location.totalPages;
    progress = isNaN(prog) ? progress : prog;

    if (metadataUpdateTimer) {
      clearTimeout(metadataUpdateTimer);
    }

    const progressDiff = Math.abs(prog - lastSavedProgress);
    if (!isNaN(prog) && progressDiff >= 1) {
      metadataUpdateTimer = setTimeout(() => {
        saveMetadata(page, prog);
      }, 1000);
    }
  }

  onDestroy(() => {
    if (metadataUpdateTimer) {
      clearTimeout(metadataUpdateTimer);
    }
    if (currentPage !== lastSavedPage && mountedNoteId) {
      saveMetadata(currentPage, progress, true);
    }
    window.api?.setMenuActivePdf(false);
    if (cleanupMenuListener) {
      cleanupMenuListener();
    }
  });

  function handleOutlineLoaded(items: PdfOutlineItem[]): void {
    outline = items;
  }

  function handleMetadataLoaded(meta: PdfMetadata): void {
    pdfMetadata = meta;

    // Only set from PDF metadata if not already set (check for undefined/null, not empty string)
    if (metadata.flint_pdfTitle == null && meta.title) {
      const baseMetadata = filterSystemFields($state.snapshot(metadata));
      const updatedMetadata = {
        ...baseMetadata,
        flint_pdfTitle: meta.title,
        flint_pdfAuthor: metadata.flint_pdfAuthor == null ? (meta.author || '') : metadata.flint_pdfAuthor
      };
      onMetadataChange(updatedMetadata);
    }
  }

  function handlePdfError(error: Error): void {
    console.error('PDF error:', error);
  }

  // Navigation handlers
  async function handleTocNavigate(dest: string | unknown[]): Promise<void> {
    if (pdfReader) {
      await pdfReader.navigateToOutlineItem(dest);
      showToc = false;
    }
  }

  async function handlePrev(): Promise<void> {
    if (pdfReader) {
      await pdfReader.prevPage();
    }
  }

  async function handleNext(): Promise<void> {
    if (pdfReader) {
      await pdfReader.nextPage();
    }
  }

  // Highlight management
  function handleTextSelected(selection: PdfSelectionInfo | null): void {
    currentSelection = selection;
  }

  function generateHighlightId(): string {
    return `h-${Date.now().toString(36)}`;
  }

  function addHighlight(): void {
    if (!currentSelection) return;

    const newHighlight: PdfHighlight = {
      id: generateHighlightId(),
      pageNumber: currentSelection.pageNumber,
      text: currentSelection.text,
      startOffset: currentSelection.startOffset,
      endOffset: currentSelection.endOffset,
      rects: currentSelection.rects,
      createdAt: new Date().toISOString()
    };

    highlights = [...highlights, newHighlight];

    // Update content with new highlights
    const updatedContent = updatePdfContentWithHighlights(latestNoteContent, highlights);
    latestNoteContent = updatedContent;
    onContentChange(updatedContent);

    // Clear selection
    currentSelection = null;
    pdfReader?.clearSelection();
  }

  function deleteHighlight(id: string): void {
    highlights = highlights.filter((h) => h.id !== id);

    // Update content
    const updatedContent = updatePdfContentWithHighlights(latestNoteContent, highlights);
    latestNoteContent = updatedContent;
    onContentChange(updatedContent);
  }

  async function handleHighlightNavigate(pageNumber: number): Promise<void> {
    if (pdfReader) {
      await pdfReader.goToPage(pageNumber);
      showHighlights = false;
    }
  }

  // Zoom handlers
  function zoomIn(): void {
    if (zoomIndex < ZOOM_LEVELS.length - 1) {
      zoomIndex++;
    }
  }

  function zoomOut(): void {
    if (zoomIndex > 0) {
      zoomIndex--;
    }
  }

  function resetZoom(): void {
    zoomIndex = DEFAULT_ZOOM_INDEX;
  }

  // Initialize with saved page
  let initialPage = $derived((metadata.flint_currentPage as number) || 1);

  // Document display info (use ?? to preserve empty strings)
  let docTitle = $derived(
    (metadata.flint_pdfTitle as string) ?? pdfMetadata?.title ?? ''
  );
  let docAuthor = $derived(
    (metadata.flint_pdfAuthor as string) ?? pdfMetadata?.author ?? ''
  );

  // Handlers for updating document metadata
  function handleDocTitleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newTitle = input.value;
    const baseMetadata = filterSystemFields($state.snapshot(metadata));
    onMetadataChange({
      ...baseMetadata,
      flint_pdfTitle: newTitle
    });
  }

  function handleDocAuthorChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newAuthor = input.value;
    const baseMetadata = filterSystemFields($state.snapshot(metadata));
    onMetadataChange({
      ...baseMetadata,
      flint_pdfAuthor: newAuthor
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
        }
      }
    })();
  });

  // Handlers
  async function handleTitleChange(newTitle: string): Promise<void> {
    if (!activeNote?.id) return;
    try {
      const chatService = getChatService();
      await chatService.renameNote({
        identifier: activeNote.id as string,
        newIdentifier: newTitle
      });
    } catch (err) {
      console.error('Failed to rename note:', err);
    }
  }

  async function handleTypeChange(newType: string): Promise<void> {
    if (!activeNote?.id) return;
    try {
      const chatService = getChatService();
      await chatService.moveNote({
        identifier: activeNote.id as string,
        newType
      });
    } catch (err) {
      console.error('Failed to change type:', err);
    }
  }

  async function handlePinToggle(): Promise<void> {
    const noteId = activeNote?.id as string;
    if (noteId) {
      await workspacesStore.togglePin(noteId);
    }
  }

  async function handleAddToShelf(): Promise<void> {
    const noteId = activeNote?.id as string;
    if (!noteId) return;

    if (notesShelfStore.isOnShelf(noteId)) {
      await notesShelfStore.removeNote(noteId);
    } else {
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
      console.error('Failed to toggle review:', err);
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
      messageBus.publish({ type: 'note.archived', noteId });
    } catch (err) {
      console.error('Failed to archive note:', err);
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
    <div class="pdf-note-view">
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

      <!-- PDF-specific actions bar -->
      <div class="pdf-actions">
        <div class="doc-info">
          <input
            type="text"
            class="doc-title"
            value={docTitle}
            placeholder="Title"
            onchange={handleDocTitleChange}
          />
          <span class="doc-author-prefix">by</span>
          <input
            type="text"
            class="doc-author"
            value={docAuthor}
            placeholder="Author"
            onchange={handleDocAuthorChange}
          />
        </div>
        <div class="pdf-buttons">
          <!-- Zoom controls -->
          <div class="zoom-controls">
            <button
              class="zoom-button"
              onclick={zoomOut}
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 8H13"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
            <button class="zoom-level" onclick={resetZoom} title="Reset zoom to 150%">
              {Math.round(zoomScale * 100)}%
            </button>
            <button
              class="zoom-button"
              onclick={zoomIn}
              disabled={zoomIndex === ZOOM_LEVELS.length - 1}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M8 3V13M3 8H13"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </div>

          <div class="button-separator"></div>

          {#if outline.length > 0}
            <button
              class="pdf-button"
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
          {/if}
          <button
            class="pdf-button"
            class:active={showHighlights}
            onclick={() => {
              showHighlights = !showHighlights;
              if (showHighlights) showToc = false;
            }}
            aria-label="Toggle highlights panel"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 3H17V13H10L6 17V13H3V3Z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>Highlights{highlights.length > 0 ? ` (${highlights.length})` : ''}</span
            >
          </button>
        </div>
      </div>

      <!-- Main content area -->
      <div class="pdf-content">
        <!-- TOC sidebar (overlay) -->
        {#if showToc}
          <div class="toc-overlay">
            <PdfToc
              {outline}
              onNavigate={handleTocNavigate}
              onClose={() => (showToc = false)}
            />
          </div>
        {/if}

        <!-- Highlights sidebar (overlay) -->
        {#if showHighlights}
          <div class="highlights-overlay">
            <PdfHighlights
              {highlights}
              onNavigate={handleHighlightNavigate}
              onDelete={deleteHighlight}
              onClose={() => (showHighlights = false)}
            />
          </div>
        {/if}

        <!-- Reader panel -->
        <div class="reader-panel">
          {#if pdfPath}
            <PdfReader
              bind:this={pdfReader}
              {pdfPath}
              {initialPage}
              scale={zoomScale}
              {highlights}
              onRelocate={handleRelocate}
              onOutlineLoaded={handleOutlineLoaded}
              onMetadataLoaded={handleMetadataLoaded}
              onTextSelected={handleTextSelected}
              onError={handlePdfError}
            />
          {:else}
            <div class="no-pdf">
              <div class="no-pdf-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path
                    d="M8 6C8 4.89543 8.89543 4 10 4H30L40 14V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V6Z"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <path d="M30 4V14H40" stroke="currentColor" stroke-width="2" />
                  <text
                    x="14"
                    y="32"
                    font-size="10"
                    fill="currentColor"
                    font-weight="bold">PDF</text
                  >
                </svg>
              </div>
              <p>No PDF file linked to this note</p>
              <p class="hint">Import a PDF file to get started</p>
            </div>
          {/if}
        </div>

        <!-- Selection popup for highlighting -->
        {#if currentSelection}
          <div
            class="selection-popup"
            style="left: {currentSelection.position.x}px; top: {currentSelection.position
              .y + 8}px;"
          >
            <button class="highlight-button" onclick={addHighlight}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 11L11 2L14 5L5 14H2V11Z"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>Highlight</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  {/snippet}
</BaseNoteView>

<style>
  .pdf-note-view {
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

  .pdf-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
    gap: 0.5rem;
  }

  .doc-info {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    min-width: 0;
    overflow: hidden;
  }

  .doc-title {
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

  .doc-title:hover,
  .doc-title:focus {
    background: var(--bg-secondary, #f5f5f5);
  }

  .doc-title::placeholder {
    color: var(--text-muted, #999);
    font-weight: normal;
  }

  .doc-author-prefix {
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    font-style: italic;
  }

  .doc-author {
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    font-style: italic;
    background: transparent;
    border: none;
    outline: none;
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    field-sizing: content;
    min-width: 5ch;
  }

  .doc-author:hover,
  .doc-author:focus {
    background: var(--bg-secondary, #f5f5f5);
  }

  .doc-author::placeholder {
    color: var(--text-muted, #999);
    font-style: normal;
  }

  .pdf-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .pdf-button {
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

  .pdf-button:hover {
    background: var(--bg-secondary, #f5f5f5);
    border-color: var(--border-light, #e0e0e0);
    color: var(--text-primary, #333);
  }

  .pdf-button.active {
    background: var(--bg-secondary, #f5f5f5);
    border-color: var(--accent-primary, #007bff);
    color: var(--text-primary, #333);
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0.125rem;
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 0.25rem;
    padding: 0.125rem;
    flex-shrink: 0;
  }

  .zoom-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    color: var(--text-secondary, #666);
    transition: all 0.15s ease;
  }

  .zoom-button:hover:not(:disabled) {
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
  }

  .zoom-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .zoom-level {
    width: 42px;
    padding: 0.125rem 0;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    color: var(--text-secondary, #666);
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .zoom-level:hover {
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #333);
  }

  .button-separator {
    width: 1px;
    height: 16px;
    background: var(--border-light, #e0e0e0);
    margin: 0 0.25rem;
  }

  .pdf-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .toc-overlay {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    z-index: 10;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }

  .reader-panel {
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--bg-primary, #fff);
  }

  .no-pdf {
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

  .no-pdf-icon {
    color: var(--text-muted, #999);
    opacity: 0.5;
  }

  .no-pdf p {
    margin: 0;
  }

  .no-pdf .hint {
    font-size: 0.875rem;
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
    z-index: 20;
    transform: translateX(-50%);
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-light, #e0e0e0);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .highlight-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-primary, #333);
    font-size: 0.8125rem;
    font-weight: 500;
    transition: background-color 0.15s ease;
  }

  .highlight-button:hover {
    background: var(--bg-secondary, #f5f5f5);
  }
</style>
