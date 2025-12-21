<script lang="ts">
  /**
   * PDF Reader Component
   *
   * Uses pdf.js to render PDF pages with:
   * - Canvas-based rendering
   * - Text layer for selection
   * - Continuous scrolling view
   * - Zoom controls
   * - Page navigation
   */

  import { onMount, onDestroy, tick, untrack } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import { TextLayer } from 'pdfjs-dist';
  import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
  import type { PDFDocumentProxy } from 'pdfjs-dist';
  import type { PdfOutlineItem, PdfHighlight } from '../lib/automerge';

  // Configure PDF.js worker (using Vite's URL import for local bundling)
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  /**
   * Selection info for highlight creation
   */
  export interface SelectionInfo {
    text: string;
    pageNumber: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  }

  // Props
  let {
    pdfData,
    initialPage = 1,
    highlights = [],
    zoomLevel = 100,
    onPageChange = (_page: number, _total: number) => {},
    onOutlineLoaded = (_outline: PdfOutlineItem[]) => {},
    onTextSelected = (_selection: SelectionInfo | null) => {},
    onAddHighlight = (
      _text: string,
      _pageNumber: number,
      _rects: SelectionInfo['rects']
    ) => '',
    onError = (_error: Error) => {}
  }: {
    pdfData: ArrayBuffer;
    initialPage?: number;
    highlights?: PdfHighlight[];
    zoomLevel?: number;
    onPageChange?: (page: number, total: number) => void;
    onOutlineLoaded?: (outline: PdfOutlineItem[]) => void;
    onTextSelected?: (selection: SelectionInfo | null) => void;
    onAddHighlight?: (
      text: string,
      pageNumber: number,
      rects: SelectionInfo['rects']
    ) => string;
    onError?: (error: Error) => void;
  } = $props();

  // State (reactive)
  let container: HTMLDivElement;
  let pagesContainer: HTMLDivElement;
  let pdfDoc = $state<PDFDocumentProxy | null>(null);
  let isLoading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(0);
  let scale = $derived(zoomLevel / 100);
  let currentSelection = $state<SelectionInfo | null>(null);
  let showSelectionPopup = $state(false);
  let selectionPopupPosition = $state({ x: 0, y: 0 });

  // Non-reactive caches (don't need to trigger UI updates)
  interface PageDimension {
    width: number;
    height: number;
  }
  let pageDimensions = new Map<number, PageDimension>();
  let renderedPages = new Set<number>();
  let pageElements = new Map<number, HTMLDivElement>();

  // Intersection observer for lazy page rendering
  let intersectionObserver: IntersectionObserver | null = null;

  // Load the PDF document
  async function loadPdf(): Promise<void> {
    isLoading = true;

    try {
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      pdfDoc = await loadingTask.promise;
      totalPages = pdfDoc.numPages;

      // Pre-calculate page dimensions
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        pageDimensions.set(i, { width: viewport.width, height: viewport.height });
      }

      // Load outline
      await loadOutline();

      isLoading = false;

      // Wait for DOM to update, then scroll to initial page
      await tick();
      if (initialPage > 1) {
        goToPage(initialPage);
      }

      // Setup intersection observer for lazy rendering
      setupIntersectionObserver();
    } catch (error) {
      console.error('[PDF Reader] Failed to load PDF:', error);
      onError(error instanceof Error ? error : new Error('Failed to load PDF'));
      isLoading = false;
    }
  }

  // Load PDF outline/bookmarks
  async function loadOutline(): Promise<void> {
    if (!pdfDoc) return;

    try {
      const outline = await pdfDoc.getOutline();
      if (outline) {
        const items = await parseOutline(outline);
        onOutlineLoaded(items);
      }
    } catch (error) {
      console.warn('[PDF Reader] Failed to load outline:', error);
    }
  }

  // Parse outline recursively
  async function parseOutline(
    items: Awaited<ReturnType<PDFDocumentProxy['getOutline']>>
  ): Promise<PdfOutlineItem[]> {
    if (!items || !pdfDoc) return [];

    const result: PdfOutlineItem[] = [];

    for (const item of items) {
      let pageNumber = 1;

      // Try to get page number from destination
      if (item.dest) {
        try {
          let dest = item.dest;
          if (typeof dest === 'string') {
            const resolved = await pdfDoc.getDestination(dest);
            dest = resolved ?? [];
          }
          if (Array.isArray(dest) && dest[0]) {
            const pageRef = dest[0];
            const pageIndex = await pdfDoc.getPageIndex(pageRef);
            pageNumber = pageIndex + 1;
          }
        } catch {
          // Ignore destination parsing errors
        }
      }

      const outlineItem: PdfOutlineItem = {
        label: item.title || 'Untitled',
        pageNumber
      };

      if (item.items && item.items.length > 0) {
        outlineItem.children = await parseOutline(item.items);
      }

      result.push(outlineItem);
    }

    return result;
  }

  // Setup intersection observer for lazy page rendering
  function setupIntersectionObserver(): void {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
          if (pageNum > 0) {
            if (entry.isIntersecting) {
              renderPage(pageNum);
            }
          }
        }
      },
      {
        root: container,
        rootMargin: '200px', // Pre-render pages slightly before they're visible
        threshold: 0
      }
    );

    // Observe all page placeholders
    for (const [, element] of pageElements) {
      intersectionObserver.observe(element);
    }
  }

  // Render a single page
  async function renderPage(pageNum: number): Promise<void> {
    if (!pdfDoc || renderedPages.has(pageNum)) return;

    const pageElement = pageElements.get(pageNum);
    if (!pageElement) return;

    renderedPages.add(pageNum);

    try {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      // Get device pixel ratio for high DPI rendering
      const dpr = window.devicePixelRatio || 1;

      // Create canvas with high DPI support
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-page-canvas';
      // Set actual size in memory (scaled for DPI)
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      // Set display size (CSS pixels)
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const context = canvas.getContext('2d');
      if (!context) return;

      // Scale context for high DPI
      context.scale(dpr, dpr);

      // Render page to canvas
      await page.render({
        canvasContext: context,
        viewport,
        canvas
      }).promise;

      // Create text layer container for selection (using pdf.js class name convention)
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      // Set CSS variable that pdf.js TextLayer needs for dimensions
      textLayerDiv.style.setProperty('--total-scale-factor', String(scale));

      // Use PDF.js TextLayer for proper text rendering and selection
      const textContent = await page.getTextContent();
      const textLayerInstance = new TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport
      });
      await textLayerInstance.render();

      // Ensure text layer has explicit dimensions
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      // Create highlight layer for annotations
      const highlightLayer = document.createElement('div');
      highlightLayer.className = 'pdf-highlight-layer';
      highlightLayer.style.width = `${viewport.width}px`;
      highlightLayer.style.height = `${viewport.height}px`;

      // Render existing highlights for this page
      const pageHighlights = highlights.filter((h) => h.pageNumber === pageNum);
      for (const highlight of pageHighlights) {
        for (const rect of highlight.rects) {
          const div = document.createElement('div');
          div.className = 'pdf-highlight';
          div.style.left = `${rect.x * viewport.width}px`;
          div.style.top = `${rect.y * viewport.height}px`;
          div.style.width = `${rect.width * viewport.width}px`;
          div.style.height = `${rect.height * viewport.height}px`;
          highlightLayer.appendChild(div);
        }
      }

      // Clear existing content and add new layers
      pageElement.innerHTML = '';
      pageElement.appendChild(canvas);
      pageElement.appendChild(highlightLayer);
      pageElement.appendChild(textLayerDiv);
    } catch (error) {
      console.error(`[PDF Reader] Failed to render page ${pageNum}:`, error);
      renderedPages.delete(pageNum);
    }
  }

  // Re-render all visible pages when zoom changes
  async function reRenderPages(): Promise<void> {
    if (!pdfDoc) return;

    // Clear rendered pages to force re-render
    renderedPages = new Set();

    // Re-render currently visible pages
    for (const [pageNum, element] of pageElements) {
      const rect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
        await renderPage(pageNum);
      }
    }
  }

  // Handle scroll to track current page
  function handleScroll(): void {
    if (!pagesContainer) return;

    const containerRect = container.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;

    let closestPage = 1;
    let closestDistance = Infinity;

    for (const [pageNum, element] of pageElements) {
      const rect = element.getBoundingClientRect();
      const pageCenter = rect.top + rect.height / 2;
      const distance = Math.abs(pageCenter - containerCenter);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestPage = pageNum;
      }
    }

    if (closestPage !== currentPage) {
      currentPage = closestPage;
      onPageChange(currentPage, totalPages);
    }
  }

  // Navigate to a specific page
  export function goToPage(pageNum: number): void {
    if (pageNum < 1 || pageNum > totalPages || !container) return;

    const element = pageElements.get(pageNum);
    if (element) {
      // Use container.scrollTo instead of scrollIntoView to avoid affecting parent containers
      const elementTop = element.offsetTop - container.offsetTop;
      container.scrollTo({ top: elementTop, behavior: 'smooth' });
    }
  }

  // Navigate to previous page
  export function prevPage(): void {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }

  // Navigate to next page
  export function nextPage(): void {
    if (currentPage < totalPages) {
      goToPage(currentPage + 1);
    }
  }

  // Handle text selection
  function handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      currentSelection = null;
      showSelectionPopup = false;
      onTextSelected(null);
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      currentSelection = null;
      showSelectionPopup = false;
      onTextSelected(null);
      return;
    }

    // Find which page the selection is in
    const anchorNode = selection.anchorNode;
    if (!anchorNode) return;

    const textLayer = (anchorNode.parentElement as HTMLElement)?.closest('.textLayer');
    if (!textLayer) return;

    const pageElement = textLayer.closest('.pdf-page') as HTMLElement;
    if (!pageElement) return;

    const pageNum = parseInt(pageElement.getAttribute('data-page') || '0');
    if (pageNum <= 0) return;

    // Get selection rectangles (normalized to page dimensions)
    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects());
    const pageRect = pageElement.getBoundingClientRect();
    const dims = pageDimensions.get(pageNum);
    if (!dims) return;

    const pageWidth = dims.width * scale;
    const pageHeight = dims.height * scale;

    const normalizedRects = rects.map((rect) => ({
      x: (rect.left - pageRect.left) / pageWidth,
      y: (rect.top - pageRect.top) / pageHeight,
      width: rect.width / pageWidth,
      height: rect.height / pageHeight
    }));

    currentSelection = {
      text,
      pageNumber: pageNum,
      rects: normalizedRects
    };

    // Position popup near selection
    if (rects.length > 0) {
      const lastRect = rects[rects.length - 1];
      selectionPopupPosition = {
        x: lastRect.right,
        y: lastRect.bottom + 5
      };
      showSelectionPopup = true;
    }

    onTextSelected(currentSelection);
  }

  // Add highlight from current selection
  function handleAddHighlight(): void {
    if (!currentSelection) return;

    const id = onAddHighlight(
      currentSelection.text,
      currentSelection.pageNumber,
      currentSelection.rects
    );

    if (id) {
      // Re-render the page to show the new highlight
      renderedPages.delete(currentSelection.pageNumber);
      renderPage(currentSelection.pageNumber);
    }

    // Clear selection
    window.getSelection()?.removeAllRanges();
    currentSelection = null;
    showSelectionPopup = false;
  }

  // Svelte action to register page element
  function registerPageElement(element: HTMLDivElement, pageNum: number) {
    pageElements.set(pageNum, element);
    if (intersectionObserver) {
      intersectionObserver.observe(element);
    }
    return {
      destroy() {
        pageElements.delete(pageNum);
        if (intersectionObserver) {
          intersectionObserver.unobserve(element);
        }
      }
    };
  }

  // Effect: Load PDF when data changes
  $effect(() => {
    if (pdfData) {
      // Use untrack to prevent reading other state during load
      untrack(() => {
        loadPdf();
      });
    }
  });

  // Effect: Re-render when zoom changes
  $effect(() => {
    // Read zoomLevel to create dependency
    void zoomLevel;
    const doc = pdfDoc;
    const loading = isLoading;

    if (doc && !loading) {
      // Use untrack to prevent this from creating a loop
      untrack(() => {
        reRenderPages();
      });
    }
  });

  // Effect: Re-render highlights when they change
  $effect(() => {
    const currentHighlights = highlights;
    const doc = pdfDoc;
    const loading = isLoading;

    if (doc && !loading) {
      untrack(() => {
        // Find affected pages and re-render them
        const affectedPages = new Set(currentHighlights.map((h) => h.pageNumber));
        for (const pageNum of affectedPages) {
          if (renderedPages.has(pageNum)) {
            renderedPages.delete(pageNum);
            renderPage(pageNum);
          }
        }
      });
    }
  });

  onMount(() => {
    // Add selection change listener
    document.addEventListener('selectionchange', handleSelectionChange);
  });

  onDestroy(() => {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }
    document.removeEventListener('selectionchange', handleSelectionChange);
  });
</script>

<div class="pdf-reader" bind:this={container} onscroll={handleScroll}>
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading PDF...</p>
    </div>
  {:else if pdfDoc}
    <div class="pdf-pages" bind:this={pagesContainer}>
      {#each Array.from({ length: totalPages }, (_, i) => i + 1) as pageNum (pageNum)}
        {@const dims = pageDimensions.get(pageNum)}
        <div
          class="pdf-page"
          data-page={pageNum}
          style="width: {dims ? dims.width * scale : 612}px; height: {dims
            ? dims.height * scale
            : 792}px;"
          use:registerPageElement={pageNum}
        >
          {#if !renderedPages.has(pageNum)}
            <div class="page-placeholder">
              <span class="page-number">Page {pageNum}</span>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Selection popup for highlighting -->
  {#if showSelectionPopup && currentSelection}
    <div
      class="selection-popup"
      style="left: {selectionPopupPosition.x}px; top: {selectionPopupPosition.y}px;"
    >
      <button class="highlight-button" onclick={handleAddHighlight}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path
            d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 0 2.8l-8.4 8.4a2 2 0 0 1-1.4.6H7a2 2 0 0 1-2-2v-3.6a2 2 0 0 1 .6-1.4l8.4-8.4a2 2 0 0 1 1.4-.6z"
          ></path>
        </svg>
        Highlight
      </button>
    </div>
  {/if}
</div>

<style>
  .pdf-reader {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: var(--bg-secondary, #f5f5f5);
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
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

  .pdf-pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 24px;
    /* Allow horizontal scrolling when zoomed in */
    min-width: min-content;
  }

  .pdf-page {
    position: relative;
    background: white;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .page-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-tertiary, #f9f9f9);
  }

  .page-number {
    color: var(--text-muted, #999);
    font-size: 0.875rem;
  }

  .pdf-page :global(.pdf-page-canvas) {
    display: block;
  }

  /* Text layer for selection - using pdf.js styles */
  .pdf-page :global(.textLayer) {
    position: absolute;
    text-align: initial;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    caret-color: CanvasText;
    /* Text layer should be above canvas for selection */
    z-index: 2;
  }

  .pdf-page :global(.textLayer :is(span, br)) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    pointer-events: auto;
    /* Override global user-select: none from body */
    -webkit-user-select: text;
    -moz-user-select: text;
    user-select: text;
  }

  .pdf-page :global(.textLayer > :not(.markedContent)),
  .pdf-page :global(.textLayer .markedContent span:not(.markedContent)) {
    z-index: 1;
  }

  .pdf-page :global(.textLayer ::selection) {
    background: rgba(0, 100, 255, 0.3);
  }

  .pdf-page :global(.pdf-highlight-layer) {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    /* Ensure highlight layer doesn't block text selection */
    z-index: 1;
  }

  .pdf-page :global(.pdf-highlight) {
    position: absolute;
    background: rgba(255, 235, 59, 0.4);
    mix-blend-mode: multiply;
    border-radius: 2px;
  }

  .selection-popup {
    position: fixed;
    z-index: 100;
    background: var(--bg-elevated, white);
    border: 1px solid var(--border-light, #e0e0e0);
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
    font-size: 0.875rem;
    color: var(--text-primary, #333);
    transition:
      background-color 0.15s,
      color 0.15s;
  }

  .highlight-button:hover {
    background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  }
</style>
