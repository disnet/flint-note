<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type {
    EpubTocItem,
    EpubHighlight,
    EpubLocation,
    EpubMetadata
  } from '../lib/automerge';

  // Selection info for highlight popup
  export interface SelectionInfo {
    text: string;
    cfi: string;
    range: Range;
    position: {
      x: number;
      y: number;
    };
  }

  // Props
  let {
    epubData,
    initialCfi = '',
    highlights = [],
    fontSize = 100,
    onRelocate = (_cfi: string, _progress: number, _location: EpubLocation) => {},
    onTocLoaded = (_toc: EpubTocItem[]) => {},
    onMetadataLoaded = (_metadata: EpubMetadata) => {},
    onTextSelected = (_selection: SelectionInfo | null) => {},
    onAddHighlight = (_text: string, _cfi: string) => '',
    onError = (_error: Error) => {}
  }: {
    epubData: ArrayBuffer;
    initialCfi?: string;
    highlights?: EpubHighlight[];
    fontSize?: number;
    onRelocate?: (cfi: string, progress: number, location: EpubLocation) => void;
    onTocLoaded?: (toc: EpubTocItem[]) => void;
    onMetadataLoaded?: (metadata: EpubMetadata) => void;
    onTextSelected?: (selection: SelectionInfo | null) => void;
    onAddHighlight?: (text: string, cfi: string) => string;
    onError?: (error: Error) => void;
  } = $props();

  // State
  let container: HTMLDivElement;
  let isMounted = $state(false);
  let isDarkMode = $state(false);
  let loadedData = $state<ArrayBuffer | null>(null);
  let view:
    | (HTMLElement & {
        open: (file: File | Blob) => Promise<void>;
        goTo: (target: string | { index: number }) => Promise<void>;
        goToFraction: (fraction: number) => Promise<void>;
        prev: () => Promise<void>;
        next: () => Promise<void>;
        addAnnotation: (
          annotation: { value: string },
          remove?: boolean
        ) => Promise<{ index: number; label: string } | undefined>;
        getCFI: (index: number, range: Range) => string;
        book?: {
          toc?: EpubTocItem[];
          metadata?: EpubMetadata;
          sections?: { size: number }[];
        };
        renderer?: {
          setStyles?: (styles: string) => void;
          addEventListener?: (event: string, handler: (e: unknown) => void) => void;
          removeEventListener?: (event: string, handler: (e: unknown) => void) => void;
          getContents?: () => Array<{ doc?: Document; index?: number }>;
        };
      })
    | null = $state(null);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let totalSections = $state(0);
  let currentSelection = $state<SelectionInfo | null>(null);
  let selectionCheckInterval: ReturnType<typeof setInterval> | null = null;
  let showSelectionPopup = $state(false);
  let selectionPopupPosition = $state({ x: 0, y: 0 });

  // Overlayer class from foliate-js for drawing highlights
  let Overlayer: {
    highlight: (
      rects: Array<{ left: number; top: number; height: number; width: number }>,
      options?: { color?: string; padding?: number }
    ) => SVGGElement;
  } | null = null;

  // Dynamic import of foliate-js view module
  async function initializeFoliateView(): Promise<void> {
    try {
      await import('foliate-js/view.js');
      const overlayerModule = await import('foliate-js/overlayer.js');
      Overlayer = overlayerModule.Overlayer;
    } catch (err) {
      console.error('Failed to load foliate-js:', err);
      throw new Error('Failed to initialize EPUB reader');
    }
  }

  // Generate CSS for EPUB content based on theme and font size
  function getEpubStyles(dark: boolean, fontSizePercent: number): string {
    const fontSizeStyle = `font-size: ${fontSizePercent}% !important;`;
    if (dark) {
      return `
        html {
          color-scheme: dark;
          background: #1a1a1a !important;
          color: #e0e0e0 !important;
          ${fontSizeStyle}
        }
        body {
          background: #1a1a1a !important;
          color: #e0e0e0 !important;
        }
        a:link {
          color: #6db3f2 !important;
        }
        a:visited {
          color: #b4a7d6 !important;
        }
        img {
          filter: brightness(0.9);
        }
      `;
    } else {
      return `
        html {
          color-scheme: light;
          ${fontSizeStyle}
        }
      `;
    }
  }

  // Check if dark mode is active
  function checkDarkMode(): boolean {
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme === 'dark') return true;
    if (dataTheme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Apply styles to the EPUB view
  function applyThemeStyles(): void {
    if (view?.renderer?.setStyles) {
      view.renderer.setStyles(getEpubStyles(isDarkMode, fontSize));
    }
  }

  // Re-apply styles when fontSize changes
  $effect(() => {
    if (view && fontSize && isMounted && !isLoading) {
      try {
        applyThemeStyles();
      } catch (err) {
        console.debug('[EPUB] Could not apply font size styles:', err);
      }
    }
  });

  async function loadEpub(): Promise<void> {
    if (!epubData || !container || !isMounted) return;

    isLoading = true;
    loadError = null;
    loadedData = epubData;

    try {
      await initializeFoliateView();

      if (!isMounted || !container) return;

      // Create the foliate-view element
      const foliateView = document.createElement('foliate-view') as typeof view;

      foliateView!.style.width = '100%';
      foliateView!.style.height = '100%';

      foliateView!.setAttribute('flow', 'scrolled');
      foliateView!.setAttribute('gap', '5%');
      foliateView!.setAttribute('max-inline-size', '720px');

      // eslint-disable-next-line svelte/no-dom-manipulating
      container.innerHTML = '';
      // eslint-disable-next-line svelte/no-dom-manipulating
      container.appendChild(foliateView!);
      view = foliateView;

      // Create a File from the ArrayBuffer
      const arrayBuffer = new ArrayBuffer(epubData.byteLength);
      new Uint8Array(arrayBuffer).set(new Uint8Array(epubData));

      const file = new File([arrayBuffer], 'book.epub', { type: 'application/epub+zip' });

      await view!.open(file);

      if (!isMounted || !container) return;

      // Get book metadata and TOC
      if (view!.book) {
        if (view!.book.toc) {
          onTocLoaded(view!.book.toc);
        }
        if (view!.book.metadata) {
          onMetadataLoaded(view!.book.metadata);
        }
        if (view!.book.sections) {
          totalSections = view!.book.sections.length;
        }
      }

      // Navigate to initial CFI if provided
      if (initialCfi) {
        try {
          await view!.goTo(initialCfi);
        } catch (e) {
          console.warn('[EPUB] Failed to navigate to initial CFI:', e);
        }
      } else {
        try {
          await view!.goToFraction(0);
        } catch (e) {
          console.warn('[EPUB] Failed to navigate to beginning:', e);
        }
      }

      // Set up event listeners
      view!.addEventListener('relocate', handleRelocate as (event: Event) => void);
      view!.addEventListener('load', handleSectionLoad as (event: Event) => void);
      view!.addEventListener(
        'draw-annotation',
        handleDrawAnnotation as (event: Event) => void
      );

      startSelectionChecking();

      // Apply any existing highlights
      if (highlights.length > 0) {
        applyHighlights(highlights);
      }

      isDarkMode = checkDarkMode();
      applyThemeStyles();

      isLoading = false;
    } catch (err) {
      console.error('Failed to load EPUB:', err);
      loadError = err instanceof Error ? err.message : 'Failed to load EPUB';
      isLoading = false;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function handleRelocate(
    event: CustomEvent<{
      cfi?: string;
      fraction: number;
      index?: number;
      range?: Range;
      tocItem?: EpubTocItem;
    }>
  ): void {
    const { cfi, fraction, index } = event.detail;
    const progress = (fraction || 0) * 100;

    onRelocate(cfi || '', progress, {
      index: index ?? 0,
      fraction: fraction || 0,
      totalLocations: totalSections
    });
  }

  function handleSectionLoad(_event: CustomEvent): void {
    // Section loaded
  }

  function handleDrawAnnotation(
    event: CustomEvent<{
      draw: (
        drawFn: (
          rects: Array<{ left: number; top: number; height: number; width: number }>,
          options?: { color?: string }
        ) => SVGGElement,
        options?: { color?: string }
      ) => void;
      annotation: { value: string };
    }>
  ): void {
    const { draw } = event.detail;
    if (Overlayer) {
      draw(Overlayer.highlight, { color: '#ffeb3b' });
    }
  }

  function startSelectionChecking(): void {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
    }

    selectionCheckInterval = setInterval(() => {
      checkForSelection();
    }, 200);

    container?.addEventListener('mouseup', handleMouseUp);
  }

  function stopSelectionChecking(): void {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
      selectionCheckInterval = null;
    }
    container?.removeEventListener('mouseup', handleMouseUp);
  }

  function handleMouseUp(): void {
    setTimeout(() => {
      checkForSelection();
    }, 50);
  }

  function calculateSelectionPosition(
    range: Range,
    doc: Document
  ): { x: number; y: number } {
    const rangeRect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
    let iframeOffsetX = 0;
    let iframeOffsetY = 0;

    if (iframe) {
      const iframeRect = iframe.getBoundingClientRect();
      iframeOffsetX = iframeRect.left - containerRect.left;
      iframeOffsetY = iframeRect.top - containerRect.top;
    }

    return {
      x: iframeOffsetX + rangeRect.left + rangeRect.width / 2,
      y: iframeOffsetY + rangeRect.bottom
    };
  }

  function checkForSelection(): void {
    if (!view) return;

    try {
      const v = view as unknown as Record<string, unknown>;
      const renderer = v.renderer as
        | { getContents?: () => Array<{ doc?: Document; index?: number }> }
        | undefined;

      if (!renderer?.getContents) return;

      const contents = renderer.getContents();

      for (const content of contents) {
        try {
          const doc = content.doc;
          if (!doc) continue;

          const selection = doc.getSelection();
          if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
            const range = selection.getRangeAt(0);
            const text = range.toString().trim();
            if (text && text.length > 0) {
              const position = calculateSelectionPosition(range, doc);

              try {
                const sectionIndex = content.index ?? 0;
                const cfi = view.getCFI(sectionIndex, range);

                if (
                  !currentSelection ||
                  currentSelection.text !== text ||
                  currentSelection.cfi !== cfi
                ) {
                  currentSelection = { text, cfi, range, position };
                  showSelectionPopup = true;
                  selectionPopupPosition = position;
                  onTextSelected(currentSelection);
                }
                return;
              } catch {
                if (!currentSelection || currentSelection.text !== text) {
                  currentSelection = { text, cfi: '', range, position };
                  showSelectionPopup = true;
                  selectionPopupPosition = position;
                  onTextSelected(currentSelection);
                }
                return;
              }
            }
          }
        } catch {
          // Cross-origin or other access error
        }
      }

      if (currentSelection) {
        currentSelection = null;
        showSelectionPopup = false;
        onTextSelected(null);
      }
    } catch {
      // Ignore errors in selection checking
    }
  }

  function applyHighlights(highlightsToApply: EpubHighlight[]): void {
    if (!view) return;

    for (const highlight of highlightsToApply) {
      try {
        view.addAnnotation({ value: highlight.cfi });
        highlightRemoveFunctions.set(highlight.id, () => {
          view?.addAnnotation({ value: highlight.cfi }, true);
        });
      } catch (e) {
        console.warn('[EPUB] Failed to apply highlight:', highlight.cfi, e);
      }
    }
  }

  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const highlightRemoveFunctions = new Map<string, () => void>();

  // Public methods - all check isMounted to avoid errors when component is destroyed
  export async function goToCfi(cfi: string): Promise<void> {
    if (!isMounted || !view || isLoading) return;
    try {
      await view.goTo(cfi);
    } catch (err) {
      // Ignore errors during navigation - likely component was destroyed
      console.debug('[EPUB] Navigation error (may be expected during cleanup):', err);
    }
  }

  export async function goToSection(index: number): Promise<void> {
    if (!isMounted || !view || isLoading) return;
    try {
      await view.goTo({ index });
    } catch (err) {
      console.debug('[EPUB] Navigation error (may be expected during cleanup):', err);
    }
  }

  export async function goToHref(href: string): Promise<void> {
    if (!isMounted || !view || isLoading) return;
    try {
      await view.goTo(href);
    } catch (err) {
      console.debug('[EPUB] Navigation error (may be expected during cleanup):', err);
    }
  }

  export async function prevPage(): Promise<void> {
    if (!isMounted || !view || isLoading) return;
    try {
      await view.prev();
    } catch (err) {
      console.debug('[EPUB] Navigation error (may be expected during cleanup):', err);
    }
  }

  export async function nextPage(): Promise<void> {
    if (!isMounted || !view || isLoading) return;
    try {
      await view.next();
    } catch (err) {
      console.debug('[EPUB] Navigation error (may be expected during cleanup):', err);
    }
  }

  export function getView(): typeof view {
    return view;
  }

  function handleAddHighlight(): void {
    if (!currentSelection || !currentSelection.cfi) return;

    const id = onAddHighlight(currentSelection.text, currentSelection.cfi);
    if (id && view) {
      try {
        view.addAnnotation({ value: currentSelection.cfi });
        highlightRemoveFunctions.set(id, () => {
          view?.addAnnotation({ value: currentSelection!.cfi }, true);
        });
      } catch (e) {
        console.error('[EPUB] Failed to add highlight:', e);
      }
    }

    currentSelection = null;
    showSelectionPopup = false;
    onTextSelected(null);
  }

  export function removeHighlight(id: string): boolean {
    if (!isMounted) return false;
    const remove = highlightRemoveFunctions.get(id);
    if (remove) {
      try {
        remove();
      } catch (err) {
        console.debug(
          '[EPUB] Failed to remove highlight (may be expected during cleanup):',
          err
        );
      }
      highlightRemoveFunctions.delete(id);
      return true;
    }
    return false;
  }

  export function clearSelection(): void {
    currentSelection = null;
    showSelectionPopup = false;
    onTextSelected(null);
  }

  // Theme change observers
  let themeObserver: MutationObserver | null = null;
  let mediaQueryList: MediaQueryList | null = null;

  function handleThemeChange(): void {
    const newDarkMode = checkDarkMode();
    if (newDarkMode !== isDarkMode) {
      isDarkMode = newDarkMode;
      applyThemeStyles();
    }
  }

  onMount(() => {
    isMounted = true;

    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-theme') {
          handleThemeChange();
        }
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQueryList.addEventListener('change', handleThemeChange);

    loadEpub();
  });

  // Reload when epubData changes
  $effect(() => {
    if (isMounted && epubData && epubData !== loadedData) {
      loadEpub();
    }
  });

  onDestroy(() => {
    // Mark as unmounted first to prevent any pending operations
    isMounted = false;
    stopSelectionChecking();
    themeObserver?.disconnect();
    mediaQueryList?.removeEventListener('change', handleThemeChange);
    if (view) {
      view.removeEventListener('relocate', handleRelocate as (event: Event) => void);
      view.removeEventListener('load', handleSectionLoad as (event: Event) => void);
      view.removeEventListener(
        'draw-annotation',
        handleDrawAnnotation as (event: Event) => void
      );
      // Clear the view reference to prevent stale operations
      view = null;
    }
    highlightRemoveFunctions.clear();
  });
</script>

<div class="epub-reader" bind:this={container}>
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading book...</p>
    </div>
  {:else if loadError}
    <div class="error-state">
      <div class="error-icon">!</div>
      <p>{loadError}</p>
      <button onclick={() => loadEpub()}>Retry</button>
    </div>
  {/if}
</div>

<!-- Selection popup -->
{#if showSelectionPopup && currentSelection}
  <div
    class="selection-popup"
    style="left: {selectionPopupPosition.x}px; top: {selectionPopupPosition.y + 10}px;"
  >
    <button class="highlight-button" onclick={handleAddHighlight}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 0 2.8l-8.4 8.4a2 2 0 0 1-1.4.6H7a2 2 0 0 1-2-2v-3.6a2 2 0 0 1 .6-1.4l8.4-8.4a2 2 0 0 1 1.4-.6z"
        ></path>
      </svg>
      Highlight
    </button>
  </div>
{/if}

<style>
  .epub-reader {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--bg-primary, #fff);
    position: relative;
  }

  .epub-reader :global(foliate-view) {
    width: 100%;
    height: 100%;
  }

  .loading-state,
  .error-state {
    position: absolute;
    inset: 0;
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

  .error-state button:hover {
    background: var(--accent-hover, #0056b3);
  }

  .selection-popup {
    position: absolute;
    z-index: 1000;
    transform: translateX(-50%);
    background: var(--bg-elevated, white);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 4px;
  }

  .highlight-button {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text-primary, #333);
    font-size: 14px;
    white-space: nowrap;
    transition: background-color 0.15s;
  }

  .highlight-button:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }

  .highlight-button svg {
    color: #ffeb3b;
  }
</style>
