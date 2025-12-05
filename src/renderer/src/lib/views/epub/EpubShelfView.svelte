<script lang="ts">
  import { onMount } from 'svelte';
  import EpubReader, { type SelectionInfo } from './EpubReader.svelte';
  import type { EpubHighlight, EpubLocation } from './types';
  import { parseHighlightsFromContent, updateContentWithHighlights } from './types';

  interface Props {
    noteId: string;
    content: string;
    onContentChange: (content: string) => void;
  }

  let { noteId, content, onContentChange }: Props = $props();

  let epubReader: EpubReader | null = $state(null);

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

  // Extract EPUB path from metadata
  const epubPath = $derived((noteMetadata?.flint_epubPath as string) || '');

  // Get initial CFI position from metadata
  const initialCfi = $derived((noteMetadata?.flint_currentCfi as string) || '');

  // Parse highlights from content
  const highlights = $derived.by((): EpubHighlight[] => {
    return parseHighlightsFromContent(content || '');
  });

  // Track progress for display
  let progress = $state(0);

  // Font size state
  let fontSize = $state(100);
  const MIN_FONT_SIZE = 75;
  const MAX_FONT_SIZE = 200;
  const FONT_SIZE_STEP = 25;

  // Selection state for highlights
  let currentSelection = $state<SelectionInfo | null>(null);

  function handleRelocate(_cfi: string, prog: number, _location: EpubLocation): void {
    progress = isNaN(prog) ? progress : prog;
  }

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

    // Update content
    const currentHighlights = parseHighlightsFromContent(content || '');
    const updatedHighlights = [...currentHighlights, newHighlight];
    const newContent = updateContentWithHighlights(content || '', updatedHighlights);
    onContentChange(newContent);

    currentSelection = null;
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

  function increaseFontSize(): void {
    fontSize = Math.min(MAX_FONT_SIZE, fontSize + FONT_SIZE_STEP);
  }

  function decreaseFontSize(): void {
    fontSize = Math.max(MIN_FONT_SIZE, fontSize - FONT_SIZE_STEP);
  }
</script>

<div class="epub-shelf-view">
  {#if isLoading}
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>Loading EPUB...</p>
    </div>
  {:else if epubPath}
    <div class="epub-toolbar">
      <button class="nav-button" onclick={handlePrev} aria-label="Previous section">
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
      <span class="progress-indicator">{Math.round(progress)}%</span>
      <button class="nav-button" onclick={handleNext} aria-label="Next section">
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
        onclick={decreaseFontSize}
        disabled={fontSize <= MIN_FONT_SIZE}
        aria-label="Decrease font size"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
          <path d="M5 12h4" stroke-width="2.5" />
        </svg>
      </button>
      <span class="font-size-indicator">{fontSize}%</span>
      <button
        class="nav-button"
        onclick={increaseFontSize}
        disabled={fontSize >= MAX_FONT_SIZE}
        aria-label="Increase font size"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
          <path d="M15 12h4M17 10v4" stroke-width="2.5" />
        </svg>
      </button>
    </div>
    <div class="epub-container">
      <EpubReader
        bind:this={epubReader}
        {epubPath}
        {initialCfi}
        {highlights}
        {fontSize}
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
    </div>
  {:else}
    <div class="no-epub">
      <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
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
      <p>No EPUB linked</p>
    </div>
  {/if}
</div>

<style>
  .epub-shelf-view {
    display: flex;
    flex-direction: column;
    height: 400px;
    max-height: 400px;
    background: var(--bg-primary);
  }

  .epub-toolbar {
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

  .progress-indicator,
  .font-size-indicator {
    font-size: 0.75rem;
    color: var(--text-secondary);
    min-width: 40px;
    text-align: center;
  }

  .toolbar-divider {
    width: 1px;
    height: 16px;
    background: var(--border-light);
    margin: 0 0.25rem;
  }

  .epub-container {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  .loading,
  .no-epub {
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
  .no-epub p {
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
    background: rgba(255, 235, 59, 0.2);
    border: 1px solid rgba(255, 235, 59, 0.5);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    color: var(--text-primary);
    transition: all 0.15s ease;
  }

  .highlight-button:hover {
    background: rgba(255, 235, 59, 0.4);
    border-color: rgba(255, 235, 59, 0.8);
  }
</style>
