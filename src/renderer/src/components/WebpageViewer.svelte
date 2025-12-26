<script lang="ts">
  import { onMount, tick } from 'svelte';
  import WebpageReader from './WebpageReader.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';
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
  let titleTextarea: HTMLTextAreaElement | null = $state(null);
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

  function handleOpenOriginalUrl(): void {
    const url = webpageProps().webpageUrl;
    if (url) {
      window.api?.openExternal({ url });
    }
  }

  // Title editing functions
  function adjustTitleHeight(): void {
    if (titleTextarea) {
      titleTextarea.style.height = 'auto';
      titleTextarea.style.height = titleTextarea.scrollHeight + 'px';
    }
  }

  function handleTitleInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    adjustTitleHeight();
    onTitleChange(textarea.value);
  }

  function handleTitleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      (event.target as HTMLTextAreaElement).blur();
    }
  }

  // Adjust title height when note changes
  $effect(() => {
    void note.title;
    tick().then(() => {
      adjustTitleHeight();
    });
  });

  // Format progress
  function formatProgress(value: number): string {
    return `${Math.round(value)}%`;
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
      <div class="webpage-chips">
        {#if webpageProps().webpageSiteName}
          <div class="chip">
            <span class="chip-label">site</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{webpageProps().webpageSiteName}</span>
          </div>
        {/if}
        {#if webpageProps().webpageAuthor}
          <div class="chip">
            <span class="chip-label">author</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{webpageProps().webpageAuthor}</span>
          </div>
        {/if}
        <div class="chip">
          <span class="chip-label">progress</span>
          <span class="chip-divider"></span>
          <span class="chip-value">{formatProgress(currentProgress)}</span>
        </div>
        {#if webpageProps().lastRead}
          <div class="chip">
            <span class="chip-label">last read</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{formatRelativeTime(webpageProps().lastRead!)}</span>
          </div>
        {/if}
        {#if highlights.length > 0}
          <div class="chip">
            <span class="chip-label">highlights</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{highlights.length}</span>
          </div>
        {/if}
        {#if webpageProps().webpageUrl}
          <button class="chip chip-link" onclick={handleOpenOriginalUrl}>
            <span class="chip-label">source</span>
            <span class="chip-divider"></span>
            <span class="chip-value link-icon">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </span>
          </button>
        {/if}
      </div>
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

  /* Header - matching note editor style */
  .webpage-header {
    display: flex;
    flex-direction: column;
    padding: 0;
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
    font-family:
      'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
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
  .webpage-chips {
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

  .chip-link {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .chip-link:hover {
    border-color: var(--accent-primary);
    background: var(--bg-tertiary);
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

  .link-icon {
    padding: 0.125rem 0.5rem;
  }

  .link-icon svg {
    display: block;
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
