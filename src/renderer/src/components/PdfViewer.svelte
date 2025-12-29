<script lang="ts">
  /**
   * PDF Viewer Component
   *
   * Main container for PDF viewing with:
   * - Header with title and property chips
   * - PDF reader with text selection and highlighting
   * - Outline panel
   * - Highlights panel
   * - Bottom control bar
   */

  import { onMount, onDestroy, tick } from 'svelte';
  import type {
    NoteMetadata,
    PdfNoteProps,
    PdfOutlineItem,
    PdfHighlight
  } from '../lib/automerge';
  import {
    pdfOpfsStorage,
    updatePdfReadingState,
    updatePdfZoomLevel,
    updateNoteContent,
    getNoteContent
  } from '../lib/automerge';
  import { nowISO } from '../lib/automerge/utils';
  import { settingsStore } from '../stores/settingsStore.svelte';
  import PdfReader from './PdfReader.svelte';
  import PdfOutline from './PdfOutline.svelte';
  import PdfHighlights from './PdfHighlights.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';
  import Tooltip from './Tooltip.svelte';

  // Props
  let {
    note,
    onTitleChange = (_title: string) => {}
  }: {
    note: NoteMetadata;
    onTitleChange?: (title: string) => void;
  } = $props();

  // State
  let noteContent = $state<string>('');
  let pdfData = $state<ArrayBuffer | null>(null);
  let currentHash = $state<string>('');
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let outline = $state<PdfOutlineItem[]>([]);
  let highlights = $state<PdfHighlight[]>([]);
  let currentPage = $state(1);
  let totalPages = $state(0);
  let showOutline = $state(false);
  let showHighlights = $state(false);
  let reader = $state<PdfReader | null>(null);
  let showControls = $state(false);
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
  let titleTextarea: HTMLTextAreaElement | null = $state(null);
  let showZoomPopup = $state(false);

  // Zoom level options
  const zoomLevelOptions = [50, 75, 100, 125, 150, 200];

  // Theme options
  const themeOptions: Array<{ value: 'system' | 'light' | 'dark'; label: string }> = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' }
  ];
  let showThemePopup = $state(false);
  const readerTheme = $derived(settingsStore.settings.reader.theme);

  // Debounce timer for reading state updates
  let readingStateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const READING_STATE_DEBOUNCE_MS = 1000;

  // Get PDF props
  const pdfProps = $derived(() => {
    return (
      (note.props as PdfNoteProps | undefined) ?? {
        pdfHash: '',
        totalPages: 0,
        currentPage: 1,
        zoomLevel: 100
      }
    );
  });

  // Parse highlights from note content
  function parseHighlights(content: string): PdfHighlight[] {
    const highlightSection = content.match(
      /<!-- pdf-highlights-start -->([\s\S]*?)<!-- pdf-highlights-end -->/
    );
    if (!highlightSection) return [];

    const highlightPattern = /> "([^"]+)" \[page:(\d+)\]\(([^|]+)\|([^|]+)\|([^)]+)\)/g;
    const result: PdfHighlight[] = [];
    let match;

    while ((match = highlightPattern.exec(highlightSection[1])) !== null) {
      try {
        const rects = JSON.parse(match[4]);
        result.push({
          text: match[1],
          pageNumber: parseInt(match[2]),
          id: match[3],
          rects,
          createdAt: match[5]
        });
      } catch {
        // Skip malformed highlights
      }
    }

    return result;
  }

  // Serialize highlights to note content
  function serializeHighlights(
    existingContent: string,
    newHighlights: PdfHighlight[]
  ): string {
    // Remove existing highlights section
    let content = existingContent.replace(
      /<!-- pdf-highlights-start -->[\s\S]*?<!-- pdf-highlights-end -->\n?/,
      ''
    );

    if (newHighlights.length === 0) {
      return content.trim();
    }

    // Build highlights section
    const highlightLines = newHighlights.map((h) => {
      const rectsJson = JSON.stringify(h.rects);
      return `> "${h.text}" [page:${h.pageNumber}](${h.id}|${rectsJson}|${h.createdAt})`;
    });

    const highlightSection = `<!-- pdf-highlights-start -->
## Highlights

${highlightLines.join('\n\n')}

<!-- pdf-highlights-end -->`;

    return content.trim() + '\n\n' + highlightSection;
  }

  // Load PDF from OPFS
  async function loadPdf(hash: string): Promise<void> {
    if (!hash) {
      loadError = 'No PDF hash found';
      isLoading = false;
      return;
    }

    isLoading = true;
    loadError = null;
    currentHash = hash;

    try {
      // Load content from content doc
      const content = await getNoteContent(note.id);
      noteContent = content;

      const data = await pdfOpfsStorage.retrieve(hash);
      if (!data) {
        loadError = 'PDF file not found in storage';
        isLoading = false;
        return;
      }

      pdfData = data;
      highlights = parseHighlights(noteContent);
      totalPages = pdfProps().totalPages || 0;
      currentPage = pdfProps().currentPage || 1;
      isLoading = false;
    } catch (error) {
      console.error('[PDF Viewer] Failed to load PDF:', error);
      loadError = error instanceof Error ? error.message : 'Failed to load PDF';
      isLoading = false;
    }
  }

  // Handle page changes
  function handlePageChange(page: number, total: number): void {
    currentPage = page;
    totalPages = total;

    // Debounce the state update
    if (readingStateDebounceTimer) {
      clearTimeout(readingStateDebounceTimer);
    }

    readingStateDebounceTimer = setTimeout(() => {
      updatePdfReadingState(note.id, {
        currentPage: page,
        lastRead: nowISO()
      });
    }, READING_STATE_DEBOUNCE_MS);
  }

  // Handle outline loaded
  function handleOutlineLoaded(loadedOutline: PdfOutlineItem[]): void {
    outline = loadedOutline;
  }

  // Add a highlight
  function addHighlight(
    text: string,
    pageNumber: number,
    rects: PdfHighlight['rects']
  ): string {
    const id = `h-${Date.now().toString(36)}`;
    const newHighlight: PdfHighlight = {
      id,
      pageNumber,
      text,
      rects,
      createdAt: nowISO()
    };

    highlights = [...highlights, newHighlight];

    // Update note content
    const newContent = serializeHighlights(noteContent, highlights);
    noteContent = newContent;
    updateNoteContent(note.id, newContent);

    return id;
  }

  // Remove a highlight
  function removeHighlight(id: string): void {
    highlights = highlights.filter((h) => h.id !== id);

    // Update note content
    const newContent = serializeHighlights(noteContent, highlights);
    noteContent = newContent;
    updateNoteContent(note.id, newContent);
  }

  // Navigate to page from outline
  function handleOutlineNavigate(pageNumber: number): void {
    reader?.goToPage(pageNumber);
    showOutline = false;
  }

  // Navigate to highlight
  function handleHighlightNavigate(pageNumber: number): void {
    reader?.goToPage(pageNumber);
    showHighlights = false;
  }

  // Handle zoom level change
  function handleZoomChange(zoom: number): void {
    updatePdfZoomLevel(note.id, zoom);
    showZoomPopup = false;
  }

  // Handle reader zoom from menu
  function handleReaderZoom(event: Event): void {
    const detail = (event as CustomEvent<{ direction: string }>).detail;
    const currentZoom = pdfProps().zoomLevel ?? 100;
    const currentIndex = zoomLevelOptions.indexOf(currentZoom);

    let newZoom: number;
    if (detail.direction === 'increase') {
      const nextIndex =
        currentIndex < zoomLevelOptions.length - 1 ? currentIndex + 1 : currentIndex;
      newZoom = zoomLevelOptions[nextIndex];
    } else if (detail.direction === 'decrease') {
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      newZoom = zoomLevelOptions[prevIndex];
    } else {
      // reset
      newZoom = 100;
    }
    updatePdfZoomLevel(note.id, newZoom);
  }

  // Handle reader theme change
  function handleThemeChange(theme: 'system' | 'light' | 'dark'): void {
    settingsStore.updateReaderTheme(theme);
    showThemePopup = false;
  }

  // Title handling
  function handleTitleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    onTitleChange(target.value);
    adjustTitleHeight();
  }

  function handleTitleKeyDown(event: KeyboardEvent): void {
    // Prevent newlines in title
    if (event.key === 'Enter') {
      event.preventDefault();
    }
  }

  function adjustTitleHeight(): void {
    if (!titleTextarea) return;
    titleTextarea.style.height = 'auto';
    titleTextarea.style.height = titleTextarea.scrollHeight + 'px';
  }

  // Controls hover handling
  function handleMouseEnterControls(): void {
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
      controlsTimeout = null;
    }
    showControls = true;
  }

  function handleMouseLeaveControls(): void {
    controlsTimeout = setTimeout(() => {
      showControls = false;
      showZoomPopup = false;
      showThemePopup = false;
    }, 300);
  }

  // Keyboard navigation
  function handleKeyDown(event: KeyboardEvent): void {
    // Don't handle if user is typing in an input
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        reader?.prevPage();
        break;
      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        reader?.nextPage();
        break;
    }
  }

  // Format progress
  function formatProgress(): string {
    if (totalPages === 0) return '0%';
    return `${Math.round((currentPage / totalPages) * 100)}%`;
  }

  // Format relative time for chips
  function formatRelativeTime(dateString: string): string {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours === 0) {
          const diffMins = Math.floor(diffMs / (1000 * 60));
          if (diffMins <= 1) return 'just now';
          return `${diffMins}m ago`;
        }
        return `${diffHours}h ago`;
      } else if (diffDays === 1) {
        return 'yesterday';
      } else if (diffDays < 7) {
        return `${diffDays}d ago`;
      } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks}w ago`;
      } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months}mo ago`;
      } else {
        return date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: '2-digit'
        });
      }
    } catch {
      return dateString;
    }
  }

  // Adjust title height when note changes
  $effect(() => {
    void note.title;
    tick().then(() => {
      adjustTitleHeight();
    });
  });

  // Save final state on unmount
  function saveState(): void {
    if (readingStateDebounceTimer) {
      clearTimeout(readingStateDebounceTimer);
    }

    // Save current state
    if (currentPage > 0) {
      updatePdfReadingState(note.id, {
        currentPage,
        lastRead: nowISO()
      });
    }
  }

  onMount(() => {
    const hash = pdfProps().pdfHash;
    if (hash) {
      loadPdf(hash);
    }
    // Add keyboard listener
    window.addEventListener('keydown', handleKeyDown);
    // Add reader zoom listener
    window.addEventListener('reader-zoom', handleReaderZoom);
  });

  onDestroy(() => {
    saveState();
    // Remove keyboard listener
    window.removeEventListener('keydown', handleKeyDown);
    // Remove reader zoom listener
    window.removeEventListener('reader-zoom', handleReaderZoom);
  });

  // Reload when note/hash changes
  $effect(() => {
    const hash = pdfProps().pdfHash;
    if (hash && hash !== currentHash) {
      loadPdf(hash);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pdf-viewer">
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading PDF...</p>
    </div>
  {:else if loadError}
    <div class="error-state">
      <div class="error-icon">!</div>
      <p>{loadError}</p>
      <button onclick={() => loadPdf(pdfProps().pdfHash)}>Retry</button>
    </div>
  {:else if pdfData}
    <!-- Header (like regular notes) -->
    <header class="pdf-header">
      <div class="header-row">
        <div class="title-area">
          <NoteTypeDropdown noteId={note.id} currentTypeId={note.type} compact />
          <textarea
            bind:this={titleTextarea}
            class="title-input"
            value={note.title}
            oninput={handleTitleInput}
            onkeydown={handleTitleKeyDown}
            placeholder="Untitled"
            rows="1"
          ></textarea>
        </div>
      </div>
      <!-- Property Chips -->
      <div class="pdf-chips">
        {#if pdfProps().pdfAuthor}
          <div class="chip">
            <span class="chip-label">author</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{pdfProps().pdfAuthor}</span>
          </div>
        {/if}
        <div class="chip">
          <span class="chip-label">pages</span>
          <span class="chip-divider"></span>
          <span class="chip-value">{currentPage} / {totalPages}</span>
        </div>
        <div class="chip">
          <span class="chip-label">progress</span>
          <span class="chip-divider"></span>
          <span class="chip-value">{formatProgress()}</span>
        </div>
        {#if pdfProps().lastRead}
          <div class="chip">
            <span class="chip-label">last read</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{formatRelativeTime(pdfProps().lastRead!)}</span>
          </div>
        {/if}
        {#if highlights.length > 0}
          <div class="chip">
            <span class="chip-label">highlights</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{highlights.length}</span>
          </div>
        {/if}
      </div>
    </header>

    <!-- Main content area -->
    <div
      class="pdf-content"
      onmouseenter={handleMouseEnterControls}
      onmouseleave={handleMouseLeaveControls}
    >
      <!-- Outline panel -->
      {#if showOutline}
        <aside class="sidebar outline-panel">
          <PdfOutline {outline} {currentPage} onNavigate={handleOutlineNavigate} />
        </aside>
      {/if}

      <!-- Highlights panel -->
      {#if showHighlights}
        <aside class="sidebar highlights-panel">
          <PdfHighlights
            {highlights}
            onNavigate={handleHighlightNavigate}
            onDelete={removeHighlight}
          />
        </aside>
      {/if}

      <!-- Reader -->
      <main class="reader-container">
        <PdfReader
          bind:this={reader}
          {pdfData}
          initialPage={pdfProps().currentPage ?? 1}
          {highlights}
          zoomLevel={pdfProps().zoomLevel ?? 100}
          themeOverride={readerTheme}
          onPageChange={handlePageChange}
          onOutlineLoaded={handleOutlineLoaded}
          onAddHighlight={addHighlight}
        />
      </main>

      <!-- Bottom control bar -->
      <div class="controls-trigger">
        <div class="bottom-controls" class:visible={showControls}>
          <!-- Left navigation -->
          <Tooltip text="Previous page">
            <button
              class="control-button"
              onclick={() => reader?.prevPage()}
              aria-label="Previous page"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          </Tooltip>

          <!-- Outline button -->
          <Tooltip text="Table of Contents">
            <button
              class="control-button"
              class:active={showOutline}
              onclick={() => {
                showOutline = !showOutline;
                showHighlights = false;
              }}
              aria-label="Table of Contents"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          </Tooltip>

          <!-- Highlights button -->
          <Tooltip text="Highlights">
            <button
              class="control-button"
              class:active={showHighlights}
              onclick={() => {
                showHighlights = !showHighlights;
                showOutline = false;
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 0 2.8l-8.4 8.4a2 2 0 0 1-1.4.6H7a2 2 0 0 1-2-2v-3.6a2 2 0 0 1 .6-1.4l8.4-8.4a2 2 0 0 1 1.4-.6z"
                ></path>
              </svg>
              {#if highlights.length > 0}
                <span class="control-badge">{highlights.length}</span>
              {/if}
            </button>
          </Tooltip>

          <!-- Page indicator -->
          <div class="page-indicator">
            <span class="page-text">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          <!-- Zoom button -->
          <div class="zoom-container">
            <Tooltip text="Zoom level">
              <button
                class="control-button"
                onclick={() => (showZoomPopup = !showZoomPopup)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  <line x1="11" y1="8" x2="11" y2="14"></line>
                  <line x1="8" y1="11" x2="14" y2="11"></line>
                </svg>
                <span class="zoom-value">{pdfProps().zoomLevel ?? 100}%</span>
              </button>
            </Tooltip>

            {#if showZoomPopup}
              <div class="zoom-popup">
                {#each zoomLevelOptions as zoom (zoom)}
                  <button
                    class="zoom-option"
                    class:active={(pdfProps().zoomLevel ?? 100) === zoom}
                    onclick={() => handleZoomChange(zoom)}
                  >
                    {zoom}%
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Theme button -->
          <div class="theme-container">
            <Tooltip text="Reader theme">
              <button
                class="control-button"
                onclick={() => (showThemePopup = !showThemePopup)}
              >
                {#if readerTheme === 'dark'}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                  </svg>
                {:else if readerTheme === 'light'}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                  </svg>
                {:else}
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                  </svg>
                {/if}
              </button>
            </Tooltip>

            {#if showThemePopup}
              <div class="theme-popup">
                {#each themeOptions as option (option.value)}
                  <button
                    class="theme-option"
                    class:active={readerTheme === option.value}
                    onclick={() => handleThemeChange(option.value)}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Right navigation -->
          <Tooltip text="Next page">
            <button
              class="control-button"
              onclick={() => reader?.nextPage()}
              aria-label="Next page"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .pdf-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary, #fff);
    overflow: hidden;
  }

  .loading-state,
  .error-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    color: var(--text-secondary, #666);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-light, #e0e0e0);
    border-top-color: var(--accent-primary, #007bff);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    color: var(--error-color, #dc3545);
  }

  .error-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--error-bg, #ffebee);
    color: var(--error-color, #dc3545);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: bold;
  }

  .error-state button {
    padding: 0.5rem 1rem;
    background: var(--accent-primary, #007bff);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  /* Header - matching note editor style */
  .pdf-header {
    display: flex;
    flex-direction: column;
    padding: 0 1.5rem;
    flex-shrink: 0;
  }

  .header-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .title-area {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .title-area :global(.note-type-dropdown.compact) {
    position: absolute;
    top: 0.4em;
    left: 0;
    z-index: 1;
  }

  .title-area :global(.note-type-dropdown.compact .type-button) {
    padding: 0.1em 0.25rem;
  }

  .title-area :global(.note-type-dropdown.compact .type-icon) {
    font-size: 1.5rem;
  }

  .title-input {
    width: 100%;
    border: none;
    background: transparent;
    font-size: 1.5rem;
    font-weight: 800;
    font-family: var(--font-editor);
    color: var(--text-primary);
    outline: none;
    padding: 0.1em 0;
    min-width: 0;
    resize: none;
    overflow: hidden;
    overflow-wrap: break-word;
    word-wrap: break-word;
    line-height: 1.4;
    min-height: 1.4em;
    text-indent: 2.3rem;
  }

  .title-input::placeholder {
    color: var(--text-muted);
    opacity: 0.5;
  }

  /* Property chips - matching note editor style */
  .pdf-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding-left: 0.25rem;
    margin-top: 0.25rem;
    margin-bottom: 0.75rem;
  }

  .chip {
    display: inline-flex;
    align-items: stretch;
    border: 1px solid var(--border-light);
    border-radius: 9999px;
    background: var(--bg-secondary);
    font-size: 0.7rem;
    white-space: nowrap;
    overflow: hidden;
  }

  .chip-label {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.5rem 0.125rem 0.625rem;
    color: var(--text-muted);
    background: var(--bg-tertiary);
    border-radius: 9999px 0 0 9999px;
  }

  .chip-divider {
    width: 1px;
    background: var(--border-light);
  }

  .chip-value {
    display: flex;
    align-items: center;
    padding: 0.125rem 0.625rem 0.125rem 0.5rem;
    color: var(--text-secondary);
  }

  /* Content area */
  .pdf-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  .sidebar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    z-index: 10;
    border-right: 1px solid var(--border-light, #e0e0e0);
    background: var(--bg-secondary, #f5f5f5);
    overflow-y: auto;
    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  }

  .reader-container {
    height: 100%;
    width: 100%;
    overflow: hidden;
  }

  /* Bottom controls - hover activated */
  .controls-trigger {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 80px;
    z-index: 20;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 16px;
  }

  .bottom-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow: 0 4px 16px var(--shadow-medium);
    opacity: 0;
    transform: translateY(20px);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
    pointer-events: none;
  }

  .bottom-controls.visible {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }

  .control-button {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    min-width: 36px;
    height: 36px;
    padding: 0 0.5rem;
    gap: 4px;
    background: transparent;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    color: var(--text-secondary);
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .control-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .control-button.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .control-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    background: var(--accent-primary);
    color: var(--text-on-accent);
    font-size: 9px;
    font-weight: 600;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .page-indicator {
    display: flex;
    align-items: center;
    padding: 0 0.5rem;
  }

  .page-text {
    font-size: 0.75rem;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .zoom-container {
    position: relative;
  }

  .zoom-value {
    font-size: 0.7rem;
    min-width: 32px;
  }

  .zoom-popup {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    box-shadow: 0 4px 12px var(--shadow-medium);
    padding: 4px;
    min-width: 80px;
  }

  .zoom-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: background-color 0.15s;
  }

  .zoom-option:hover {
    background: var(--bg-hover);
  }

  .zoom-option.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .theme-container {
    position: relative;
  }

  .theme-popup {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    box-shadow: 0 4px 12px var(--shadow-medium);
    padding: 4px;
    min-width: 80px;
  }

  .theme-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    color: var(--text-primary);
    transition: background-color 0.15s;
  }

  .theme-option:hover {
    background: var(--bg-hover);
  }

  .theme-option.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }
</style>
