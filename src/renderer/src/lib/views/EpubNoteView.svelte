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

  // Split panel state
  let splitRatio = $state(60); // Left panel percentage
  let isDragging = $state(false);
  let containerRef: HTMLDivElement | null = $state(null);

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
  let epubPath = $derived((metadata.epubPath as string) || '');

  // System fields that cannot be modified through metadata update
  const SYSTEM_FIELDS = [
    'id',
    'title',
    'type',
    'created',
    'updated',
    'path',
    'content',
    'content_hash',
    'size',
    'filename'
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
      currentCfi: cfi,
      progress: Math.round(validProgress),
      lastRead: new Date().toISOString()
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
    if (!metadata.epubTitle && meta.title) {
      // Use $state.snapshot() to ensure the object is serializable for IPC
      // Filter out system fields that can't be modified
      const baseMetadata = filterSystemFields($state.snapshot(metadata));
      const updatedMetadata = {
        ...baseMetadata,
        epubTitle: meta.title,
        epubAuthor: extractAuthorName(meta.author)
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

  // Split panel drag handlers
  function handleMouseDown(e: MouseEvent): void {
    e.preventDefault();
    isDragging = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent): void {
    if (!isDragging || !containerRef) return;

    const rect = containerRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newRatio = (x / rect.width) * 100;

    // Clamp between 30% and 80%
    splitRatio = Math.max(30, Math.min(80, newRatio));
  }

  function handleMouseUp(): void {
    isDragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  // Initialize with saved CFI
  let initialCfi = $derived((metadata.currentCfi as string) || '');

  // Book display info
  let bookTitle = $derived(
    (metadata.epubTitle as string) ||
      epubMetadata?.title ||
      (activeNote.title as string) ||
      'Untitled'
  );
  let bookAuthor = $derived(
    (metadata.epubAuthor as string) || extractAuthorName(epubMetadata?.author) || ''
  );
</script>

<BaseNoteView
  {activeNote}
  {noteContent}
  {metadata}
  {onContentChange}
  {onMetadataChange}
  {onSave}
>
  {#snippet children({ handleContentChange, handleSave })}
    <div class="epub-note-view">
      <!-- Header bar -->
      <div class="epub-header">
        <div class="book-info">
          <h2 class="book-title">{bookTitle}</h2>
          {#if bookAuthor}
            <span class="book-author">by {bookAuthor}</span>
          {/if}
        </div>
        <div class="header-actions">
          <button
            class="header-button"
            class:active={showHighlights}
            onclick={() => {
              showHighlights = !showHighlights;
              if (showHighlights) showToc = false;
            }}
            aria-label="Toggle highlights"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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
            class="header-button"
            class:active={showToc}
            onclick={() => {
              showToc = !showToc;
              if (showToc) showHighlights = false;
            }}
            aria-label="Toggle table of contents"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
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
      <div class="epub-content" bind:this={containerRef}>
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

        <!-- Split panel container -->
        <div class="split-container">
          <!-- Reader panel -->
          <div class="reader-panel" style="width: {splitRatio}%">
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

          <!-- Resize handle -->
          <div
            class="resize-handle"
            class:dragging={isDragging}
            onmousedown={handleMouseDown}
            role="separator"
            aria-valuenow={splitRatio}
            aria-valuemin={30}
            aria-valuemax={80}
          ></div>

          <!-- Notes panel -->
          <div class="notes-panel" style="width: {100 - splitRatio}%">
            <div class="notes-header">
              <h3>Notes</h3>
              <button class="save-button" onclick={handleSave}> Save </button>
            </div>
            <div class="notes-content">
              {#if noteContent || noteContent === ''}
                <textarea
                  class="notes-editor"
                  value={noteContent}
                  oninput={(e) =>
                    handleContentChange((e.target as HTMLTextAreaElement).value)}
                  placeholder="Start taking notes about this book..."
                ></textarea>
              {:else}
                <div class="empty-notes">
                  <p>Start taking notes about this book...</p>
                  <button onclick={() => handleContentChange('# My Notes\n\n')}>
                    Start Writing
                  </button>
                </div>
              {/if}
            </div>
          </div>
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

  /* Header */
  .epub-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--bg-secondary, #f5f5f5);
    border-bottom: 1px solid var(--border-light, #e0e0e0);
    gap: 1rem;
  }

  .book-info {
    flex: 1;
    min-width: 0;
  }

  .book-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, #333);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .book-author {
    font-size: 0.875rem;
    color: var(--text-secondary, #666);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .header-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary, #fff);
    border: 1px solid var(--border-medium, #ccc);
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-primary, #333);
    font-size: 0.875rem;
    transition: all 0.15s ease;
  }

  .header-button:hover {
    background: var(--bg-hover, #e0e0e0);
  }

  .header-button.active {
    background: var(--accent-primary, #007bff);
    color: white;
    border-color: var(--accent-primary, #007bff);
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

  .split-container {
    display: flex;
    height: 100%;
  }

  .reader-panel {
    height: 100%;
    overflow: hidden;
    background: var(--bg-primary, #fff);
  }

  .resize-handle {
    width: 6px;
    background: var(--border-light, #e0e0e0);
    cursor: col-resize;
    transition: background 0.15s ease;
    flex-shrink: 0;
  }

  .resize-handle:hover,
  .resize-handle.dragging {
    background: var(--accent-primary, #007bff);
  }

  .notes-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-primary, #fff);
    border-left: 1px solid var(--border-light, #e0e0e0);
  }

  .notes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light, #e0e0e0);
  }

  .notes-header h3 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .save-button {
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary, #007bff);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .save-button:hover {
    background: var(--accent-hover, #0056b3);
  }

  .notes-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .notes-editor {
    flex: 1;
    width: 100%;
    padding: 1rem;
    border: none;
    resize: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--text-primary, #333);
    background: var(--bg-primary, #fff);
  }

  .notes-editor:focus {
    outline: none;
  }

  .notes-editor::placeholder {
    color: var(--text-muted, #999);
  }

  .empty-notes {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--text-muted, #999);
    padding: 2rem;
    text-align: center;
  }

  .empty-notes button {
    padding: 0.5rem 1rem;
    background: var(--accent-primary, #007bff);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .empty-notes button:hover {
    background: var(--accent-hover, #0056b3);
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
