<script lang="ts">
  import { onMount } from 'svelte';
  import WebpageReader from './WebpageReader.svelte';
  import NoteHeader from './NoteHeader.svelte';
  import MediaChips from './MediaChips.svelte';
  import type { NoteMetadata, WebpageNoteProps } from '../lib/automerge';
  import {
    updateWebpageReadingState,
    updateNoteContent,
    getNoteContent
  } from '../lib/automerge';
  import { webpageOpfsStorage } from '../lib/automerge/webpage-opfs-storage.svelte';
  import type { WebpageHighlight, WebpageSelectionInfo } from '../lib/automerge/types';

  // Props - matching EPUB viewer pattern
  let {
    note,
    onTitleChange = (_title: string) => {}
  }: {
    note: NoteMetadata;
    onTitleChange?: (title: string) => void;
  } = $props();

  // State
  let noteContent = $state<string>('');
  let htmlContent = $state<string | null>(null);
  let highlights = $state<WebpageHighlight[]>([]);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let currentSelection = $state<WebpageSelectionInfo | null>(null);
  let showHighlightPopup = $state(false);
  let readerComponent = $state<WebpageReader | undefined>(undefined);
  let currentProgress = $state(0);

  // Debounce timer for progress updates
  let progressDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Get webpage props
  const webpageProps = $derived(() => {
    return (
      (note.props as WebpageNoteProps | undefined) ?? {
        webpageHash: '',
        webpageUrl: '',
        progress: 0
      }
    );
  });

  // Load content when note changes
  let currentHash = $state<string>('');

  $effect(() => {
    const hash = webpageProps().webpageHash;
    if (hash && hash !== currentHash) {
      loadWebpageContent(hash);
    }
  });

  // Parse highlights when noteContent changes
  $effect(() => {
    void noteContent;
    parseHighlights();
  });

  async function loadWebpageContent(hash: string): Promise<void> {
    isLoading = true;
    loadError = null;
    htmlContent = null;
    currentHash = hash;

    try {
      if (!hash) {
        throw new Error('Webpage hash not found in note');
      }

      // Load content from content doc
      const content = await getNoteContent(note.id);
      noteContent = content;

      // Load HTML from OPFS
      const html = await webpageOpfsStorage.retrieve(hash);
      if (!html) {
        throw new Error('Webpage content not found in storage');
      }

      htmlContent = html;
      currentProgress = webpageProps().progress ?? 0;

      // Parse highlights from note content
      parseHighlights();

      isLoading = false;
    } catch (error) {
      console.error('[WebpageViewer] Failed to load content:', error);
      loadError = error instanceof Error ? error.message : 'Failed to load webpage';
      isLoading = false;
    }
  }

  function parseHighlights(): void {
    if (!noteContent) {
      highlights = [];
      return;
    }

    const parsed = parseWebpageHighlightsFromContent(noteContent);
    highlights = parsed;
  }

  function handleRelocate(progress: number): void {
    currentProgress = progress;

    // Debounce progress updates
    if (progressDebounceTimer) {
      clearTimeout(progressDebounceTimer);
    }

    progressDebounceTimer = setTimeout(() => {
      updateWebpageReadingState(note.id, {
        progress: Math.round(progress),
        lastRead: new Date().toISOString()
      });
    }, 500);
  }

  function handleTextSelected(selection: WebpageSelectionInfo | null): void {
    currentSelection = selection;
    showHighlightPopup = selection !== null;
  }

  function handleCreateHighlight(): void {
    if (!currentSelection || !note) return;

    const highlight: WebpageHighlight = {
      id: `h-${Date.now().toString(36)}`,
      text: currentSelection.text,
      prefix: currentSelection.prefix,
      suffix: currentSelection.suffix,
      startOffset: currentSelection.startOffset,
      endOffset: currentSelection.endOffset,
      createdAt: new Date().toISOString()
    };

    // Add highlight to list
    const newHighlights = [...highlights, highlight];
    highlights = newHighlights;

    // Update note content with serialized highlights
    const newContent = updateWebpageContentWithHighlights(noteContent, newHighlights);
    noteContent = newContent;
    updateNoteContent(note.id, newContent);

    // Clear selection
    currentSelection = null;
    showHighlightPopup = false;
    readerComponent?.clearSelection();
  }

  function handleDeleteHighlight(highlightId: string): void {
    if (!note) return;

    const newHighlights = highlights.filter((h) => h.id !== highlightId);
    highlights = newHighlights;

    // Update note content
    const newContent = updateWebpageContentWithHighlights(noteContent, newHighlights);
    noteContent = newContent;
    updateNoteContent(note.id, newContent);
  }

  // Format progress
  function formatProgress(value: number): string {
    return `${Math.round(value)}%`;
  }

  // Highlight parsing/serialization functions
  const HIGHLIGHTS_MARKER_START = '<!-- webpage-highlights-start -->';
  const HIGHLIGHTS_MARKER_END = '<!-- webpage-highlights-end -->';

  function parseWebpageHighlightsFromContent(content: string): WebpageHighlight[] {
    const startIdx = content.indexOf(HIGHLIGHTS_MARKER_START);
    const endIdx = content.indexOf(HIGHLIGHTS_MARKER_END);

    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
      return [];
    }

    const highlightsSection = content.slice(
      startIdx + HIGHLIGHTS_MARKER_START.length,
      endIdx
    );

    const parsed: WebpageHighlight[] = [];
    const regex =
      /^>\s*"(.+?)"\s*\[([^.]*)\.\.\.(.*?)\]\(([^|]+)\|([^|]+)\|(\d+)-(\d+)\)/gm;
    let match;

    while ((match = regex.exec(highlightsSection)) !== null) {
      try {
        parsed.push({
          text: decodeURIComponent(match[1]),
          prefix: decodeURIComponent(match[2]),
          suffix: decodeURIComponent(match[3]),
          id: match[4],
          createdAt: match[5],
          startOffset: parseInt(match[6], 10),
          endOffset: parseInt(match[7], 10)
        });
      } catch {
        // Skip malformed highlights
      }
    }

    return parsed;
  }

  function serializeWebpageHighlightsToContent(
    highlightList: WebpageHighlight[]
  ): string {
    if (highlightList.length === 0) {
      return '';
    }

    const lines = highlightList.map((h) => {
      const encodedText = encodeURIComponent(h.text);
      const encodedPrefix = encodeURIComponent(h.prefix);
      const encodedSuffix = encodeURIComponent(h.suffix);
      return `> "${encodedText}" [${encodedPrefix}...${encodedSuffix}](${h.id}|${h.createdAt}|${h.startOffset}-${h.endOffset})`;
    });

    return `\n\n${HIGHLIGHTS_MARKER_START}\n## Highlights\n\n${lines.join('\n\n')}\n${HIGHLIGHTS_MARKER_END}`;
  }

  function updateWebpageContentWithHighlights(
    content: string,
    highlightList: WebpageHighlight[]
  ): string {
    const startIdx = content.indexOf(HIGHLIGHTS_MARKER_START);
    const endIdx = content.indexOf(HIGHLIGHTS_MARKER_END);

    let baseContent = content;
    if (startIdx !== -1 && endIdx !== -1) {
      baseContent =
        content.slice(0, startIdx).trimEnd() +
        content.slice(endIdx + HIGHLIGHTS_MARKER_END.length);
    }

    const highlightsSection = serializeWebpageHighlightsToContent(highlightList);
    return baseContent.trimEnd() + highlightsSection;
  }

  onMount(() => {
    return () => {
      if (progressDebounceTimer) {
        clearTimeout(progressDebounceTimer);
      }
    };
  });
</script>

<div class="webpage-viewer">
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading article...</p>
    </div>
  {:else if loadError}
    <div class="error-state">
      <div class="error-icon">!</div>
      <p>{loadError}</p>
      <button onclick={() => loadWebpageContent(webpageProps().webpageHash)}>Retry</button
      >
    </div>
  {:else if htmlContent}
    <!-- Header (like EPUB/regular notes) -->
    <header class="webpage-header">
      <NoteHeader {note} {onTitleChange}>
        {#snippet chips()}
          <MediaChips
            {note}
            sourceFormat="webpage"
            computedValues={{
              progress: formatProgress(currentProgress),
              highlights: highlights.length > 0 ? highlights.length : undefined,
              source: webpageProps().webpageUrl
            }}
            onOpenExternal={(url) => window.api?.openExternal({ url })}
          />
        {/snippet}
      </NoteHeader>
    </header>

    <!-- Reader component -->
    <WebpageReader
      bind:this={readerComponent}
      {htmlContent}
      {highlights}
      onRelocate={handleRelocate}
      onTextSelected={handleTextSelected}
    />

    <!-- Highlight popup -->
    {#if showHighlightPopup && currentSelection}
      <div
        class="highlight-popup"
        style="left: {currentSelection.position.x}px; top: {currentSelection.position.y +
          10}px;"
      >
        <button class="highlight-btn" onclick={handleCreateHighlight}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 12L12 2"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
            <path d="M10 4L12 2L14 4L12 6L10 4Z" fill="currentColor" />
            <path
              d="M2 14H6L10 10"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          Highlight
        </button>
      </div>
    {/if}

    <!-- Highlights section (inline, below content) -->
    {#if highlights.length > 0}
      <div class="highlights-section">
        <h3 class="highlights-header">Highlights</h3>
        <div class="highlights-list">
          {#each highlights as highlight (highlight.id)}
            <div class="highlight-item">
              <blockquote>"{highlight.text}"</blockquote>
              <div class="highlight-actions">
                <span class="highlight-date">
                  {new Date(highlight.createdAt).toLocaleDateString()}
                </span>
                <button
                  class="delete-btn"
                  onclick={() => handleDeleteHighlight(highlight.id)}
                  aria-label="Delete highlight"
                >
                  ×
                </button>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .webpage-viewer {
    display: flex;
    flex-direction: column;
    min-height: 100%;
  }

  .loading-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem;
    color: var(--text-secondary);
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    color: var(--error-text);
  }

  .error-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--error-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    font-weight: bold;
  }

  .error-state button {
    padding: 0.5rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  /* Header */
  .webpage-header {
    flex-shrink: 0;
  }

  .highlight-popup {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 0.25rem;
    transform: translateX(-50%);
  }

  .highlight-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    border-radius: 4px;
    transition: background 0.2s ease;
  }

  .highlight-btn:hover {
    background: var(--bg-hover);
  }

  .highlights-section {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border-light);
  }

  .highlights-header {
    margin: 0 0 0.75rem;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .highlights-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .highlight-item {
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 6px;
    border: 1px solid var(--border-light);
  }

  .highlight-item blockquote {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-primary);
    line-height: 1.5;
    border-left: 3px solid var(--accent-primary);
    padding-left: 0.75rem;
  }

  .highlight-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.5rem;
  }

  .highlight-date {
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .delete-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: none;
    color: var(--text-tertiary);
    font-size: 18px;
    cursor: pointer;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .delete-btn:hover {
    background: var(--error-bg);
    color: var(--error-text);
  }
</style>
