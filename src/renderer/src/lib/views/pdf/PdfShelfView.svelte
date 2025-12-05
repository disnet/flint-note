<script lang="ts">
  import { onMount } from 'svelte';
  import PdfReader from './PdfReader.svelte';
  import type { PdfHighlight, PdfLocation, PdfSelectionInfo } from './types';
  import { parsePdfHighlightsFromContent, updatePdfContentWithHighlights } from './types';

  interface Props {
    noteId: string;
    content: string;
    onContentChange: (content: string) => void;
  }

  let { noteId, content, onContentChange }: Props = $props();

  let pdfReader: PdfReader | null = $state(null);

  // Full note metadata fetched from API
  let noteMetadata = $state<Record<string, unknown> | null>(null);
  let isLoading = $state(true);

  // Fetch full note metadata on mount
  onMount(() => {
    (async () => {
      try {
        const note = await window.api?.getNote({ identifier: noteId });
        if (note?.metadata) {
          noteMetadata = note.metadata as Record<string, unknown>;
        }
      } catch (err) {
        console.error('Failed to fetch note metadata:', err);
      } finally {
        isLoading = false;
      }
    })();
  });

  // Extract PDF path from metadata
  const pdfPath = $derived((noteMetadata?.flint_pdfPath as string) || '');

  // Get initial page from metadata
  const initialPage = $derived((noteMetadata?.flint_currentPage as number) || 1);

  // Parse highlights from content
  const highlights = $derived.by((): PdfHighlight[] => {
    return parsePdfHighlightsFromContent(content || '');
  });

  // Track current page for display
  let currentPage = $state(1);
  let totalPages = $state(1);

  // Zoom state
  let scale = $state(1.0);
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 3.0;
  const SCALE_STEP = 0.25;

  // Selection state for highlights
  let currentSelection = $state<PdfSelectionInfo | null>(null);

  function handleRelocate(page: number, _progress: number, location: PdfLocation): void {
    currentPage = page;
    totalPages = location.totalPages;
  }

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

    const currentHighlights = parsePdfHighlightsFromContent(content || '');
    const updatedHighlights = [...currentHighlights, newHighlight];
    const updatedContent = updatePdfContentWithHighlights(
      content || '',
      updatedHighlights
    );
    onContentChange(updatedContent);

    currentSelection = null;
    pdfReader?.clearSelection();
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

  function zoomIn(): void {
    scale = Math.min(MAX_SCALE, scale + SCALE_STEP);
  }

  function zoomOut(): void {
    scale = Math.max(MIN_SCALE, scale - SCALE_STEP);
  }
</script>

<div class="pdf-shelf-view">
  {#if isLoading}
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>Loading PDF...</p>
    </div>
  {:else if pdfPath}
    <div class="pdf-toolbar">
      <button
        class="nav-button"
        onclick={handlePrev}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <span class="page-indicator">{currentPage} / {totalPages}</span>
      <button
        class="nav-button"
        onclick={handleNext}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
      <span class="toolbar-divider"></span>
      <button
        class="nav-button"
        onclick={zoomOut}
        disabled={scale <= MIN_SCALE}
        aria-label="Zoom out"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35M8 11h6" />
        </svg>
      </button>
      <span class="zoom-indicator">{Math.round(scale * 100)}%</span>
      <button
        class="nav-button"
        onclick={zoomIn}
        disabled={scale >= MAX_SCALE}
        aria-label="Zoom in"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
        </svg>
      </button>
    </div>
    <div class="pdf-container">
      <PdfReader
        bind:this={pdfReader}
        {pdfPath}
        {initialPage}
        {scale}
        {highlights}
        onRelocate={handleRelocate}
        onTextSelected={handleTextSelected}
      />

      {#if currentSelection}
        <div
          class="selection-popup"
          style="left: {currentSelection.position.x}px; top: {currentSelection.position
            .y + 8}px;"
        >
          <button class="highlight-button" onclick={addHighlight}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M2 11L11 2L14 5L5 14H2V11Z"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Highlight
          </button>
        </div>
      {/if}
    </div>
  {:else}
    <div class="no-pdf">
      <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
        <path
          d="M8 6C8 4.89543 8.89543 4 10 4H30L40 14V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V6Z"
          stroke="currentColor"
          stroke-width="2"
        />
        <path d="M30 4V14H40" stroke="currentColor" stroke-width="2" />
        <text x="14" y="32" font-size="10" fill="currentColor" font-weight="bold"
          >PDF</text
        >
      </svg>
      <p>No PDF linked</p>
    </div>
  {/if}
</div>

<style>
  .pdf-shelf-view {
    display: flex;
    flex-direction: column;
    height: 400px;
    max-height: 400px;
    background: var(--bg-primary);
  }

  .pdf-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.375rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.15s ease;
  }

  .nav-button:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .nav-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-indicator,
  .zoom-indicator {
    font-size: 0.75rem;
    color: var(--text-secondary);
    min-width: 40px;
    text-align: center;
  }

  .page-indicator {
    min-width: 60px;
  }

  .toolbar-divider {
    width: 1px;
    height: 16px;
    background: var(--border-light);
    margin: 0 0.25rem;
  }

  .pdf-container {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .loading,
  .no-pdf {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 0.5rem;
    color: var(--text-muted);
    padding: 1rem;
  }

  .loading p,
  .no-pdf p {
    margin: 0;
    font-size: 0.8rem;
  }

  .loading-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .selection-popup {
    position: absolute;
    z-index: 20;
    transform: translateX(-50%);
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .highlight-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-primary);
    font-size: 0.75rem;
    transition: background-color 0.15s ease;
  }

  .highlight-button:hover {
    background: var(--bg-secondary);
  }
</style>
