<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TocItem, EpubMetadata, EpubLocation, EpubHighlight } from './types';
  import { logger } from '../../../utils/logger';

  // Selection info for highlight popup
  export interface SelectionInfo {
    text: string;
    cfi: string;
    range: Range;
    // Position relative to the EpubReader container
    position: {
      x: number; // center x of selection
      y: number; // bottom y of selection
    };
  }

  // Props
  let {
    epubPath = '',
    initialCfi = '',
    highlights = [],
    fontSize = 100,
    onRelocate = (_cfi: string, _progress: number, _location: EpubLocation) => {},
    onTocLoaded = (_toc: TocItem[]) => {},
    onMetadataLoaded = (_metadata: EpubMetadata) => {},
    onTextSelected = (_selection: SelectionInfo | null) => {},
    onError = (_error: Error) => {}
  }: {
    epubPath: string;
    initialCfi?: string;
    highlights?: EpubHighlight[];
    fontSize?: number;
    onRelocate?: (cfi: string, progress: number, location: EpubLocation) => void;
    onTocLoaded?: (toc: TocItem[]) => void;
    onMetadataLoaded?: (metadata: EpubMetadata) => void;
    onTextSelected?: (selection: SelectionInfo | null) => void;
    onError?: (error: Error) => void;
  } = $props();

  // State
  let container: HTMLDivElement;
  let isMounted = $state(false);
  let isDarkMode = $state(false);
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
          toc?: TocItem[];
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
      // Import the view module to register the custom element
      await import('foliate-js/view.js');
      // Import Overlayer for highlight drawing
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
    // System preference
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
        // View might be in an invalid state during unmount
        logger.debug('[EPUB] Could not apply font size styles:', err);
      }
    }
  });

  async function loadEpub(): Promise<void> {
    if (!epubPath || !container || !isMounted) return;

    isLoading = true;
    loadError = null;

    try {
      // Initialize foliate-js
      await initializeFoliateView();

      // Check if component was unmounted during async operation
      if (!isMounted || !container) {
        logger.debug('[EPUB] Component unmounted during initialization, aborting load');
        return;
      }

      // Create the foliate-view element
      const foliateView = document.createElement('foliate-view') as typeof view;

      // Style the view element
      foliateView!.style.width = '100%';
      foliateView!.style.height = '100%';

      // Set attributes for paginated view
      foliateView!.setAttribute('flow', 'scrolled');
      foliateView!.setAttribute('gap', '5%');
      foliateView!.setAttribute('max-inline-size', '720px');

      // Clear container and add view
      // eslint-disable-next-line svelte/no-dom-manipulating -- necessary for foliate-js custom element
      container.innerHTML = '';
      // eslint-disable-next-line svelte/no-dom-manipulating -- necessary for foliate-js custom element
      container.appendChild(foliateView!);
      view = foliateView;

      // Load the EPUB file
      const epubData = await window.api?.readEpubFile({ relativePath: epubPath });

      // Check if component was unmounted during file read
      if (!isMounted || !container) {
        logger.debug('[EPUB] Component unmounted during file read, aborting load');
        return;
      }

      if (!epubData) {
        throw new Error('Failed to read EPUB file');
      }

      // Create a File from the Uint8Array (foliate-js needs a File with name property)
      // Copy to a new ArrayBuffer to ensure it's not a SharedArrayBuffer
      const arrayBuffer = new ArrayBuffer(epubData.byteLength);
      new Uint8Array(arrayBuffer).set(epubData);

      // Extract filename from path for foliate-js
      const filename = epubPath.split('/').pop() || 'book.epub';
      const file = new File([arrayBuffer], filename, { type: 'application/epub+zip' });

      // Open the book
      await view!.open(file);

      // Check if component was unmounted during book open
      if (!isMounted || !container) {
        logger.debug('[EPUB] Component unmounted during book open, aborting load');
        return;
      }

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

      // Navigate to initial CFI if provided, otherwise go to the beginning
      if (initialCfi) {
        logger.debug('[EPUB] Restoring position to:', initialCfi);
        try {
          await view!.goTo(initialCfi);
          logger.debug('[EPUB] Position restored successfully');
        } catch (e) {
          console.warn('[EPUB] Failed to navigate to initial CFI:', e);
        }
      } else {
        logger.debug('[EPUB] No saved position, navigating to beginning');
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

      // Set up selection checking - poll for selection changes
      // foliate-js doesn't expose selection events, so we check periodically
      startSelectionChecking();

      // Apply any existing highlights
      if (highlights.length > 0) {
        applyHighlights(highlights);
      }

      // Apply theme styles
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
      tocItem?: TocItem;
    }>
  ): void {
    const { cfi, fraction, index } = event.detail;

    // fraction is already 0-1 representing overall book progress
    // Just convert to percentage
    const progress = (fraction || 0) * 100;

    onRelocate(cfi || '', progress, {
      index: index ?? 0,
      fraction: fraction || 0,
      totalLocations: totalSections
    });
  }

  function handleSectionLoad(_event: CustomEvent): void {
    // Section loaded - could be used for progress indication
  }

  // Handle annotation drawing - this is called by foliate-js when an annotation needs to be rendered
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

  // Start checking for text selection
  function startSelectionChecking(): void {
    // Stop any existing interval
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
    }

    // Check for selection changes every 200ms
    selectionCheckInterval = setInterval(() => {
      checkForSelection();
    }, 200);

    // Also add mouseup listener to container for quicker response
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
    // Small delay to let the selection complete
    setTimeout(() => {
      checkForSelection();
    }, 50);
  }

  // Calculate selection position relative to our container
  function calculateSelectionPosition(
    range: Range,
    doc: Document
  ): { x: number; y: number } {
    const rangeRect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // The range rect is relative to the iframe's viewport
    // We need to find the iframe and add its offset
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
      // Get the renderer and its contents directly - this bypasses closed shadow roots
      const v = view as unknown as Record<string, unknown>;
      const renderer = v.renderer as
        | {
            getContents?: () => Array<{ doc?: Document; index?: number }>;
          }
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
              // Calculate position relative to our container
              const position = calculateSelectionPosition(range, doc);

              // Try to get CFI
              try {
                const sectionIndex = content.index ?? 0;
                const cfi = view.getCFI(sectionIndex, range);

                if (
                  !currentSelection ||
                  currentSelection.text !== text ||
                  currentSelection.cfi !== cfi
                ) {
                  currentSelection = { text, cfi, range, position };
                  onTextSelected(currentSelection);
                }
                return;
              } catch {
                // Even without CFI, we can still show selection
                if (!currentSelection || currentSelection.text !== text) {
                  currentSelection = { text, cfi: '', range, position };
                  onTextSelected(currentSelection);
                }
                return;
              }
            }
          }
        } catch {
          // Cross-origin or other access error, ignore
        }
      }

      // No selection found, clear if we had one
      if (currentSelection) {
        currentSelection = null;
        onTextSelected(null);
      }
    } catch {
      // Ignore errors in selection checking
    }
  }

  // Apply highlights to the view
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

  // Store remove functions for highlights
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not reactive state, just stores cleanup functions
  const highlightRemoveFunctions = new Map<string, () => void>();

  // Public methods exposed to parent
  export async function goToCfi(cfi: string): Promise<void> {
    if (view) {
      await view.goTo(cfi);
    }
  }

  export async function goToSection(index: number): Promise<void> {
    if (view) {
      await view.goTo({ index });
    }
  }

  export async function goToHref(href: string): Promise<void> {
    if (view) {
      await view.goTo(href);
    }
  }

  export async function prevPage(): Promise<void> {
    if (view) {
      await view.prev();
    }
  }

  export async function nextPage(): Promise<void> {
    if (view) {
      await view.next();
    }
  }

  export function getView(): typeof view {
    return view;
  }

  // Add a highlight at the current selection
  export function addHighlight(id: string): boolean {
    if (!view || !currentSelection) {
      return false;
    }

    try {
      const cfi = currentSelection.cfi;
      view.addAnnotation({ value: cfi });
      highlightRemoveFunctions.set(id, () => {
        view?.addAnnotation({ value: cfi }, true);
      });
      currentSelection = null;
      onTextSelected(null);
      return true;
    } catch (e) {
      console.error('[EPUB] Failed to add highlight:', e);
      return false;
    }
  }

  // Remove a highlight by ID
  export function removeHighlight(id: string): boolean {
    const remove = highlightRemoveFunctions.get(id);
    if (remove) {
      remove();
      highlightRemoveFunctions.delete(id);
      return true;
    }
    return false;
  }

  // Clear current selection
  export function clearSelection(): void {
    currentSelection = null;
    onTextSelected(null);
  }

  // Watch for epubPath changes
  $effect(() => {
    if (epubPath) {
      loadEpub();
    }
  });

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

    // Watch for data-theme attribute changes
    themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'data-theme') {
          handleThemeChange();
        }
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    // Watch for system theme changes
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQueryList.addEventListener('change', handleThemeChange);
  });

  onDestroy(() => {
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
</style>
