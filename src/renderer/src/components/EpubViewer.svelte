<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import type {
    NoteMetadata,
    EpubNoteProps,
    EpubTocItem,
    EpubHighlight
  } from '../lib/automerge';
  import {
    opfsStorage,
    updateEpubReadingState,
    updateEpubTextSize,
    updateNoteContent,
    getNoteContent
  } from '../lib/automerge';
  import { nowISO } from '../lib/automerge/utils';
  import EpubReader from './EpubReader.svelte';
  import EpubToc from './EpubToc.svelte';
  import EpubHighlights from './EpubHighlights.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';

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
  let epubData = $state<ArrayBuffer | null>(null);
  let currentHash = $state<string>('');
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let toc = $state<EpubTocItem[]>([]);
  let highlights = $state<EpubHighlight[]>([]);
  let currentProgress = $state(0);
  let showToc = $state(false);
  let showHighlights = $state(false);
  let reader = $state<EpubReader | null>(null);
  let showControls = $state(false);
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;
  let titleTextarea: HTMLTextAreaElement | null = $state(null);
  let showTextSizePopup = $state(false);

  // Text size options
  const textSizeOptions = [75, 100, 125, 150, 175, 200];

  // Debounce timer for reading state updates
  let readingStateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  const READING_STATE_DEBOUNCE_MS = 1000;

  // Get EPUB props
  const epubProps = $derived(() => {
    return (
      (note.props as EpubNoteProps | undefined) ?? {
        epubHash: '',
        progress: 0,
        textSize: 100
      }
    );
  });

  // Parse highlights from note content
  function parseHighlights(content: string): EpubHighlight[] {
    const highlightSection = content.match(
      /<!-- epub-highlights-start -->([\s\S]*?)<!-- epub-highlights-end -->/
    );
    if (!highlightSection) return [];

    const highlightPattern = /> "([^"]+)" \[epubcfi\(([^)]+)\)\]\(([^|]+)\|([^)]+)\)/g;
    const result: EpubHighlight[] = [];
    let match;

    while ((match = highlightPattern.exec(highlightSection[1])) !== null) {
      result.push({
        text: match[1],
        cfi: `epubcfi(${match[2]})`,
        id: match[3],
        createdAt: match[4]
      });
    }

    return result;
  }

  // Serialize highlights to note content
  function serializeHighlights(
    existingContent: string,
    newHighlights: EpubHighlight[]
  ): string {
    // Remove existing highlights section
    let content = existingContent.replace(
      /<!-- epub-highlights-start -->[\s\S]*?<!-- epub-highlights-end -->\n?/,
      ''
    );

    if (newHighlights.length === 0) {
      return content.trim();
    }

    // Build highlights section
    const highlightLines = newHighlights.map((h) => {
      const cfiValue = h.cfi.replace(/^epubcfi\(/, '').replace(/\)$/, '');
      return `> "${h.text}" [epubcfi(${cfiValue})](${h.id}|${h.createdAt})`;
    });

    const highlightSection = `<!-- epub-highlights-start -->
## Highlights

${highlightLines.join('\n\n')}

<!-- epub-highlights-end -->`;

    return content.trim() + '\n\n' + highlightSection;
  }

  // Load EPUB from OPFS
  async function loadEpub(hash: string): Promise<void> {
    if (!hash) {
      loadError = 'No EPUB hash found';
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

      const data = await opfsStorage.retrieve(hash);
      if (!data) {
        loadError = 'EPUB file not found in storage';
        isLoading = false;
        return;
      }

      epubData = data;
      highlights = parseHighlights(noteContent);
      isLoading = false;
    } catch (error) {
      console.error('[EPUB Viewer] Failed to load EPUB:', error);
      loadError = error instanceof Error ? error.message : 'Failed to load EPUB';
      isLoading = false;
    }
  }

  // Handle reading position changes
  function handleRelocate(cfi: string, progress: number): void {
    currentProgress = progress;

    // Debounce the state update
    if (readingStateDebounceTimer) {
      clearTimeout(readingStateDebounceTimer);
    }

    readingStateDebounceTimer = setTimeout(() => {
      // Only update if progress changed significantly (> 1%)
      const existingProgress = epubProps().progress ?? 0;
      if (Math.abs(progress - existingProgress) > 1 || cfi !== epubProps().currentCfi) {
        updateEpubReadingState(note.id, {
          currentCfi: cfi,
          progress: Math.round(progress),
          lastRead: nowISO()
        });
      }
    }, READING_STATE_DEBOUNCE_MS);
  }

  // Handle TOC loaded
  function handleTocLoaded(loadedToc: EpubTocItem[]): void {
    toc = loadedToc;
  }

  // Handle text selection for highlighting
  function handleTextSelected(
    _selection: {
      text: string;
      cfi: string;
      position: { x: number; y: number };
    } | null
  ): void {
    // Selection handling will be implemented in the reader component
    // The _selection parameter contains the selected text, CFI location, and position
    // for showing a popup to create a highlight
  }

  // Add a highlight
  function addHighlight(text: string, cfi: string): string {
    const id = `h-${Date.now().toString(36)}`;
    const newHighlight: EpubHighlight = {
      id,
      cfi,
      text,
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

  // Navigate to TOC item
  function handleTocNavigate(href: string): void {
    reader?.goToHref(href);
    showToc = false;
  }

  // Navigate to highlight
  function handleHighlightNavigate(cfi: string): void {
    reader?.goToCfi(cfi);
    showHighlights = false;
  }

  // Handle text size change
  function handleTextSizeChange(size: number): void {
    updateEpubTextSize(note.id, size);
    showTextSizePopup = false;
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
      showTextSizePopup = false;
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
        event.preventDefault();
        reader?.prevPage();
        break;
      case 'ArrowRight':
        event.preventDefault();
        reader?.nextPage();
        break;
    }
  }

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
    const props = epubProps();
    if (props.currentCfi || currentProgress > 0) {
      updateEpubReadingState(note.id, {
        currentCfi: props.currentCfi,
        progress: Math.round(currentProgress),
        lastRead: nowISO()
      });
    }
  }

  onMount(() => {
    const hash = epubProps().epubHash;
    if (hash) {
      loadEpub(hash);
    }
    // Add keyboard listener
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    saveState();
    // Remove keyboard listener
    window.removeEventListener('keydown', handleKeyDown);
  });

  // Reload when note/hash changes
  $effect(() => {
    const hash = epubProps().epubHash;
    if (hash && hash !== currentHash) {
      loadEpub(hash);
    }
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="epub-viewer">
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading book...</p>
    </div>
  {:else if loadError}
    <div class="error-state">
      <div class="error-icon">!</div>
      <p>{loadError}</p>
      <button onclick={() => loadEpub(epubProps().epubHash)}>Retry</button>
    </div>
  {:else if epubData}
    <!-- Header (like regular notes) -->
    <header class="epub-header">
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
      <div class="epub-chips">
        {#if epubProps().epubAuthor}
          <div class="chip">
            <span class="chip-label">author</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{epubProps().epubAuthor}</span>
          </div>
        {/if}
        <div class="chip">
          <span class="chip-label">progress</span>
          <span class="chip-divider"></span>
          <span class="chip-value">{formatProgress(currentProgress)}</span>
        </div>
        {#if epubProps().lastRead}
          <div class="chip">
            <span class="chip-label">last read</span>
            <span class="chip-divider"></span>
            <span class="chip-value">{formatRelativeTime(epubProps().lastRead!)}</span>
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
      class="epub-content"
      onmouseenter={handleMouseEnterControls}
      onmouseleave={handleMouseLeaveControls}
    >
      <!-- TOC panel -->
      {#if showToc}
        <aside class="sidebar toc-panel">
          <EpubToc {toc} onNavigate={handleTocNavigate} />
        </aside>
      {/if}

      <!-- Highlights panel -->
      {#if showHighlights}
        <aside class="sidebar highlights-panel">
          <EpubHighlights
            {highlights}
            onNavigate={handleHighlightNavigate}
            onDelete={removeHighlight}
          />
        </aside>
      {/if}

      <!-- Reader -->
      <main class="reader-container">
        <EpubReader
          bind:this={reader}
          {epubData}
          initialCfi={epubProps().currentCfi}
          {highlights}
          fontSize={epubProps().textSize ?? 100}
          onRelocate={handleRelocate}
          onTocLoaded={handleTocLoaded}
          onTextSelected={handleTextSelected}
          onAddHighlight={addHighlight}
        />
      </main>

      <!-- Bottom control bar -->
      <div class="controls-trigger">
        <div class="bottom-controls" class:visible={showControls}>
          <!-- Left navigation -->
          <button
            class="control-button"
            onclick={() => reader?.prevPage()}
            title="Previous page"
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

          <!-- TOC button -->
          <button
            class="control-button"
            class:active={showToc}
            onclick={() => {
              showToc = !showToc;
              showHighlights = false;
            }}
            title="Table of Contents"
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

          <!-- Highlights button -->
          <button
            class="control-button"
            class:active={showHighlights}
            onclick={() => {
              showHighlights = !showHighlights;
              showToc = false;
            }}
            title="Highlights"
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

          <!-- Progress indicator -->
          <div class="progress-indicator">
            <div class="progress-bar">
              <div class="progress-fill" style="width: {currentProgress}%"></div>
            </div>
            <span class="progress-text">{formatProgress(currentProgress)}</span>
          </div>

          <!-- Text size button -->
          <div class="text-size-container">
            <button
              class="control-button"
              onclick={() => (showTextSizePopup = !showTextSizePopup)}
              title="Text size"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M4 7V4h16v3"></path>
                <path d="M9 20h6"></path>
                <path d="M12 4v16"></path>
              </svg>
              <span class="text-size-value">{epubProps().textSize ?? 100}%</span>
            </button>

            {#if showTextSizePopup}
              <div class="text-size-popup">
                {#each textSizeOptions as size (size)}
                  <button
                    class="text-size-option"
                    class:active={(epubProps().textSize ?? 100) === size}
                    onclick={() => handleTextSizeChange(size)}
                  >
                    {size}%
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Right navigation -->
          <button
            class="control-button"
            onclick={() => reader?.nextPage()}
            title="Next page"
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
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .epub-viewer {
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
  .epub-header {
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
  .epub-chips {
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
  .epub-content {
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
    /* Trigger area is always active for hover detection */
  }

  .bottom-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--bg-elevated, white);
    border: 1px solid var(--border-light, #e0e0e0);
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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
    color: var(--text-secondary, #666);
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .control-button:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
    color: var(--text-primary, #333);
  }

  .control-button.active {
    background: var(--accent-bg, rgba(0, 123, 255, 0.1));
    color: var(--accent-primary, #007bff);
  }

  .control-badge {
    position: absolute;
    top: 2px;
    right: 2px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    background: var(--accent-primary, #007bff);
    color: white;
    font-size: 9px;
    font-weight: 600;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .progress-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.5rem;
  }

  .progress-bar {
    width: 80px;
    height: 4px;
    background: var(--border-light, #e0e0e0);
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary, #007bff);
    border-radius: 2px;
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    min-width: 32px;
  }

  .text-size-container {
    position: relative;
  }

  .text-size-value {
    font-size: 0.7rem;
    min-width: 32px;
  }

  .text-size-popup {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    background: var(--bg-elevated, white);
    border: 1px solid var(--border-light, #e0e0e0);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 4px;
    min-width: 80px;
  }

  .text-size-option {
    display: block;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    font-size: 0.875rem;
    color: var(--text-primary, #333);
    transition: background-color 0.15s;
  }

  .text-size-option:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }

  .text-size-option.active {
    background: var(--accent-bg, rgba(0, 123, 255, 0.1));
    color: var(--accent-primary, #007bff);
  }
</style>
