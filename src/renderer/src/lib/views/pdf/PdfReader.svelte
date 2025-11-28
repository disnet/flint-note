<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type {
    PdfOutlineItem,
    PdfMetadata,
    PdfLocation,
    PdfHighlight,
    PdfSelectionInfo
  } from './types';
  import * as pdfjsLib from 'pdfjs-dist';
  import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

  // Set up the worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  // Props
  let {
    pdfPath = '',
    initialPage = 1,
    scale = 1.5,
    highlights = [],
    onRelocate = (_page: number, _progress: number, _location: PdfLocation) => {},
    onOutlineLoaded = (_outline: PdfOutlineItem[]) => {},
    onMetadataLoaded = (_metadata: PdfMetadata) => {},
    onTextSelected = (_selection: PdfSelectionInfo | null) => {},
    onError = (_error: Error) => {}
  }: {
    pdfPath: string;
    initialPage?: number;
    scale?: number;
    highlights?: PdfHighlight[];
    onRelocate?: (page: number, progress: number, location: PdfLocation) => void;
    onOutlineLoaded?: (outline: PdfOutlineItem[]) => void;
    onMetadataLoaded?: (metadata: PdfMetadata) => void;
    onTextSelected?: (selection: PdfSelectionInfo | null) => void;
    onError?: (error: Error) => void;
  } = $props();

  // State
  let container: HTMLDivElement;
  let pagesContainer: HTMLDivElement | undefined = $state();
  let isMounted = $state(false);
  let isDarkMode = $state(false);
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = $state(null);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let totalPages = $state(0);
  let currentPage = $state(1);
  // These Map/Set instances are used for internal pdf.js rendering state,
  // not for driving Svelte reactivity, so SvelteMap/SvelteSet are not needed
  /* eslint-disable svelte/prefer-svelte-reactivity */
  let renderedPages = new Set<number>();
  let pageObserver: IntersectionObserver | null = null;
  let pageElements: Map<number, HTMLDivElement> = new Map();
  let textLayers: Map<number, HTMLDivElement> = new Map();
  let highlightLayers: Map<number, HTMLDivElement> = new Map();
  let pageViewports: Map<number, { width: number; height: number; scale: number }> =
    new Map();
  /* eslint-enable svelte/prefer-svelte-reactivity */

  // Selection tracking
  let selectionCheckInterval: ReturnType<typeof setInterval> | null = null;
  let lastSelectionText = '';
  let currentSelection = $state<PdfSelectionInfo | null>(null);

  // Scale tracking for re-render on change
  let lastScale = scale;

  // Check if dark mode is active
  function checkDarkMode(): boolean {
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme === 'dark') return true;
    if (dataTheme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  async function loadPdf(): Promise<void> {
    if (!pdfPath || !container || !isMounted) return;

    isLoading = true;
    loadError = null;

    try {
      // Load the PDF file
      const pdfData = await window.api?.readPdfFile({ relativePath: pdfPath });

      if (!isMounted || !container) {
        return;
      }

      if (!pdfData) {
        throw new Error('Failed to read PDF file');
      }

      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({ data: pdfData });
      pdfDoc = await loadingTask.promise;

      if (!isMounted || !container) {
        return;
      }

      totalPages = pdfDoc.numPages;

      // Get metadata
      try {
        const metadata = await pdfDoc.getMetadata();
        if (metadata.info) {
          const info = metadata.info as Record<string, unknown>;
          onMetadataLoaded({
            title: info.Title as string | undefined,
            author: info.Author as string | undefined,
            subject: info.Subject as string | undefined,
            keywords: info.Keywords as string | undefined,
            creator: info.Creator as string | undefined,
            producer: info.Producer as string | undefined
          });
        }
      } catch {
        // Metadata may not be available
      }

      // Get outline
      try {
        const outline = await pdfDoc.getOutline();
        if (outline) {
          interface OutlineItem {
            title: string;
            dest: string | unknown[];
            items?: OutlineItem[];
          }
          const convertOutline = (items: OutlineItem[]): PdfOutlineItem[] => {
            return items.map((item) => ({
              title: item.title,
              dest: item.dest as string | unknown[],
              items: item.items ? convertOutline(item.items) : undefined
            }));
          };
          onOutlineLoaded(convertOutline(outline as OutlineItem[]));
        } else {
          onOutlineLoaded([]);
        }
      } catch {
        onOutlineLoaded([]);
      }

      // Create page placeholders
      await createPagePlaceholders();

      // Set up intersection observer for lazy rendering
      setupPageObserver();

      // Navigate to initial page (instant scroll for restoration)
      if (initialPage > 1 && initialPage <= totalPages) {
        await goToPage(initialPage, false);
      } else {
        // Render first few pages
        await renderVisiblePages();
      }

      isLoading = false;
    } catch (err) {
      console.error('Failed to load PDF:', err);
      loadError = err instanceof Error ? err.message : 'Failed to load PDF';
      isLoading = false;
      onError(err instanceof Error ? err : new Error('Failed to load PDF'));
    }
  }

  // PDF.js requires direct DOM manipulation for canvas/page rendering
  // which is outside Svelte's control, so we disable this lint rule here
  /* eslint-disable svelte/no-dom-manipulating */
  async function createPagePlaceholders(): Promise<void> {
    if (!pdfDoc || !pagesContainer) return;

    // Clear existing content
    pagesContainer.innerHTML = '';
    pageElements.clear();
    renderedPages.clear();

    for (let i = 1; i <= totalPages; i++) {
      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.dataset.pageNumber = String(i);

      // Get page to determine dimensions
      const page = await pdfDoc.getPage(i);
      const viewport = page.getViewport({ scale });

      pageDiv.style.width = `${viewport.width}px`;
      pageDiv.style.height = `${viewport.height}px`;

      // Add page number label
      const pageLabel = document.createElement('div');
      pageLabel.className = 'page-label';
      pageLabel.textContent = `Page ${i}`;
      pageDiv.appendChild(pageLabel);

      pagesContainer.appendChild(pageDiv);
      pageElements.set(i, pageDiv);
    }
  }
  /* eslint-enable svelte/no-dom-manipulating */

  function setupPageObserver(): void {
    if (pageObserver) {
      pageObserver.disconnect();
    }

    pageObserver = new IntersectionObserver(
      (entries) => {
        let mostVisiblePage = currentPage;
        let maxRatio = 0;

        for (const entry of entries) {
          const pageNumber = parseInt(
            entry.target.getAttribute('data-page-number') || '1'
          );

          if (entry.isIntersecting) {
            // Render page if not already rendered
            if (!renderedPages.has(pageNumber)) {
              renderPage(pageNumber);
            }

            // Track most visible page
            if (entry.intersectionRatio > maxRatio) {
              maxRatio = entry.intersectionRatio;
              mostVisiblePage = pageNumber;
            }
          }
        }

        // Update current page if changed
        if (mostVisiblePage !== currentPage && maxRatio > 0.1) {
          currentPage = mostVisiblePage;
          const progress = (currentPage / totalPages) * 100;
          onRelocate(currentPage, progress, { pageNumber: currentPage, totalPages });
        }
      },
      {
        root: container,
        rootMargin: '100px 0px',
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1]
      }
    );

    // Observe all page elements
    for (const pageDiv of pageElements.values()) {
      pageObserver.observe(pageDiv);
    }
  }

  async function renderPage(pageNumber: number): Promise<void> {
    if (!pdfDoc || renderedPages.has(pageNumber)) return;

    const pageDiv = pageElements.get(pageNumber);
    if (!pageDiv) return;

    renderedPages.add(pageNumber);

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      // Store viewport info for later use
      pageViewports.set(pageNumber, {
        width: viewport.width,
        height: viewport.height,
        scale
      });

      // Create canvas with HiDPI/Retina support
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      const context = canvas.getContext('2d');
      if (!context) return;

      const dpr = window.devicePixelRatio || 1;

      // Set actual canvas size in memory (scaled up for crisp rendering)
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);

      // Set display size via CSS (original dimensions)
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      // Remove placeholder label
      const label = pageDiv.querySelector('.page-label');
      if (label) {
        label.remove();
      }

      // Add canvas
      pageDiv.appendChild(canvas);

      // Create highlight layer (rendered behind text layer)
      const highlightDiv = document.createElement('div');
      highlightDiv.className = 'pdf-highlight-layer';
      highlightDiv.style.width = `${viewport.width}px`;
      highlightDiv.style.height = `${viewport.height}px`;
      pageDiv.appendChild(highlightDiv);
      highlightLayers.set(pageNumber, highlightDiv);

      // Create text layer container (using pdf.js class name convention)
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      // Set CSS variable that pdf.js TextLayer needs for dimensions
      textLayerDiv.style.setProperty('--total-scale-factor', String(scale));
      pageDiv.appendChild(textLayerDiv);
      textLayers.set(pageNumber, textLayerDiv);

      // Render page to canvas with HiDPI scaling
      const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;
      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas,
        transform
      }).promise;

      // Render text layer using pdf.js built-in TextLayer
      const textContent = await page.getTextContent();
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textLayerDiv,
        viewport: viewport
      });
      await textLayer.render();

      // Ensure text layer has explicit dimensions (fallback if CSS vars don't work)
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      // Render existing highlights for this page
      renderHighlightsForPage(pageNumber);
    } catch (err) {
      console.error(`Failed to render page ${pageNumber}:`, err);
    }
  }

  async function renderVisiblePages(): Promise<void> {
    // Render first 3 pages initially
    for (let i = 1; i <= Math.min(3, totalPages); i++) {
      await renderPage(i);
    }
  }

  // Highlight rendering
  function renderHighlightsForPage(pageNumber: number): void {
    const highlightLayer = highlightLayers.get(pageNumber);
    if (!highlightLayer) return;

    // Clear existing highlights
    highlightLayer.innerHTML = '';

    // Find highlights for this page
    const pageHighlights = highlights.filter((h) => h.pageNumber === pageNumber);

    for (const highlight of pageHighlights) {
      for (const rect of highlight.rects) {
        const highlightEl = document.createElement('div');
        highlightEl.className = 'pdf-highlight';
        highlightEl.dataset.highlightId = highlight.id;
        highlightEl.style.left = `${rect.x}px`;
        highlightEl.style.top = `${rect.y}px`;
        highlightEl.style.width = `${rect.width}px`;
        highlightEl.style.height = `${rect.height}px`;
        highlightLayer.appendChild(highlightEl);
      }
    }
  }

  // Re-render all highlights when highlights prop changes
  $effect(() => {
    if (highlights) {
      for (const pageNumber of highlightLayers.keys()) {
        renderHighlightsForPage(pageNumber);
      }
    }
  });

  // Handle scale changes - re-render all pages
  async function handleScaleChange(): Promise<void> {
    if (!pdfDoc || !pagesContainer || !isMounted) return;

    // Store current scroll position relative to current page
    const savedPage = currentPage;

    // Clear rendered state
    renderedPages.clear();
    textLayers.clear();
    highlightLayers.clear();
    pageViewports.clear();

    // Disconnect observer temporarily
    if (pageObserver) {
      pageObserver.disconnect();
    }

    // Re-create placeholders with new scale
    await createPagePlaceholders();

    // Re-setup observer
    setupPageObserver();

    // Navigate back to saved page (instant, no smooth scroll)
    await goToPage(savedPage, false);
  }

  // Watch for scale changes
  $effect(() => {
    if (scale !== lastScale && pdfDoc && isMounted) {
      lastScale = scale;
      handleScaleChange();
    }
  });

  // Selection detection
  function checkForSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      if (currentSelection) {
        currentSelection = null;
        onTextSelected(null);
        lastSelectionText = '';
      }
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText || selectedText === lastSelectionText) {
      return;
    }

    lastSelectionText = selectedText;

    // Find which page the selection is in
    const range = selection.getRangeAt(0);
    const textLayerDiv = range.startContainer.parentElement?.closest(
      '.textLayer'
    ) as HTMLElement | null;

    if (!textLayerDiv) {
      return;
    }

    const pageDiv = textLayerDiv.closest('.pdf-page') as HTMLElement | null;
    if (!pageDiv) {
      return;
    }

    const pageNumber = parseInt(pageDiv.dataset.pageNumber || '1', 10);
    const viewport = pageViewports.get(pageNumber);
    if (!viewport) {
      return;
    }

    // Get selection rectangles relative to text layer
    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];
    const clientRects = range.getClientRects();
    const textLayerRect = textLayerDiv.getBoundingClientRect();

    for (let i = 0; i < clientRects.length; i++) {
      const clientRect = clientRects[i];
      rects.push({
        x: clientRect.left - textLayerRect.left,
        y: clientRect.top - textLayerRect.top,
        width: clientRect.width,
        height: clientRect.height
      });
    }

    if (rects.length === 0) {
      return;
    }

    // Calculate position for popup (bottom center of last rect, in viewport coords)
    const lastClientRect = clientRects[clientRects.length - 1];
    const containerRect = container.getBoundingClientRect();

    const selectionInfo: PdfSelectionInfo = {
      text: selectedText,
      pageNumber,
      startOffset: getTextOffset(textLayerDiv, range.startContainer, range.startOffset),
      endOffset: getTextOffset(textLayerDiv, range.endContainer, range.endOffset),
      rects,
      position: {
        x: lastClientRect.left + lastClientRect.width / 2 - containerRect.left,
        y: lastClientRect.bottom - containerRect.top
      }
    };

    currentSelection = selectionInfo;
    onTextSelected(selectionInfo);
  }

  // Calculate text offset within the text layer
  function getTextOffset(textLayerDiv: HTMLElement, node: Node, offset: number): number {
    let totalOffset = 0;
    const walker = document.createTreeWalker(textLayerDiv, NodeFilter.SHOW_TEXT, null);

    let currentNode = walker.nextNode();
    while (currentNode) {
      if (currentNode === node) {
        return totalOffset + offset;
      }
      totalOffset += currentNode.textContent?.length || 0;
      currentNode = walker.nextNode();
    }

    return totalOffset + offset;
  }

  // Handle mouseup for faster selection detection
  function handleMouseUp(): void {
    // Small delay to ensure selection is finalized
    setTimeout(checkForSelection, 50);
  }

  // Start selection monitoring
  function startSelectionMonitoring(): void {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
    }
    selectionCheckInterval = setInterval(checkForSelection, 200);

    // Also listen for mouseup on the container
    container?.addEventListener('mouseup', handleMouseUp);
  }

  // Stop selection monitoring
  function stopSelectionMonitoring(): void {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
      selectionCheckInterval = null;
    }
    container?.removeEventListener('mouseup', handleMouseUp);
  }

  // Public method to clear selection
  export function clearSelection(): void {
    window.getSelection()?.removeAllRanges();
    currentSelection = null;
    lastSelectionText = '';
    onTextSelected(null);
  }

  // Public methods
  export async function goToPage(pageNumber: number, smooth = true): Promise<void> {
    if (pageNumber < 1 || pageNumber > totalPages) return;

    const pageDiv = pageElements.get(pageNumber);
    if (pageDiv && container) {
      // Calculate scroll position relative to container
      const containerRect = container.getBoundingClientRect();
      const pageRect = pageDiv.getBoundingClientRect();
      const scrollTop = container.scrollTop + (pageRect.top - containerRect.top);

      container.scrollTo({
        top: scrollTop,
        behavior: smooth ? 'smooth' : 'instant'
      });

      // Ensure page is rendered
      if (!renderedPages.has(pageNumber)) {
        await renderPage(pageNumber);
      }
    }
  }

  export async function prevPage(): Promise<void> {
    if (currentPage > 1) {
      await goToPage(currentPage - 1);
    }
  }

  export async function nextPage(): Promise<void> {
    if (currentPage < totalPages) {
      await goToPage(currentPage + 1);
    }
  }

  export async function navigateToOutlineItem(dest: string | unknown[]): Promise<void> {
    if (!pdfDoc) return;

    try {
      let pageNumber = 1;

      if (typeof dest === 'string') {
        // Named destination
        const destObj = await pdfDoc.getDestination(dest);
        if (destObj) {
          const ref = destObj[0];
          pageNumber = (await pdfDoc.getPageIndex(ref)) + 1;
        }
      } else if (Array.isArray(dest) && dest.length > 0) {
        // Explicit destination
        const ref = dest[0];
        if (ref && typeof ref === 'object') {
          pageNumber =
            (await pdfDoc.getPageIndex(ref as { num: number; gen: number })) + 1;
        }
      }

      await goToPage(pageNumber, false);
    } catch (err) {
      console.error('Failed to navigate to outline item:', err);
    }
  }

  onMount(() => {
    isMounted = true;
    isDarkMode = checkDarkMode();

    // Watch for theme changes
    const themeObserver = new MutationObserver(() => {
      isDarkMode = checkDarkMode();
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (): void => {
      isDarkMode = checkDarkMode();
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    loadPdf();

    // Start selection monitoring after a short delay to ensure container is ready
    setTimeout(() => {
      startSelectionMonitoring();
    }, 100);

    return () => {
      themeObserver.disconnect();
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  });

  onDestroy(() => {
    isMounted = false;

    stopSelectionMonitoring();

    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }

    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }

    pageElements.clear();
    textLayers.clear();
    highlightLayers.clear();
    pageViewports.clear();
    renderedPages.clear();
  });

  // Reload when path changes
  $effect(() => {
    if (pdfPath && isMounted) {
      loadPdf();
    }
  });
</script>

<div class="pdf-reader" class:dark-mode={isDarkMode} bind:this={container}>
  {#if isLoading}
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>Loading PDF...</p>
    </div>
  {:else if loadError}
    <div class="error">
      <p>Failed to load PDF</p>
      <p class="error-message">{loadError}</p>
    </div>
  {:else}
    <div class="pages-container" bind:this={pagesContainer}></div>
  {/if}
</div>

<style>
  .pdf-reader {
    width: 100%;
    height: 100%;
    overflow: auto;
    background: var(--bg-secondary, #f5f5f5);
  }

  .pdf-reader.dark-mode {
    background: #1a1a1a;
  }

  .pdf-reader.dark-mode :global(.pdf-canvas) {
    filter: invert(0.9) hue-rotate(180deg);
  }

  .pages-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    min-width: fit-content;
  }

  :global(.pdf-page) {
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .dark-mode :global(.pdf-page) {
    background: #2a2a2a;
  }

  :global(.pdf-canvas) {
    display: block;
    max-width: 100%;
    height: auto;
    position: relative;
    z-index: 0;
  }

  :global(.page-label) {
    color: var(--text-muted, #999);
    font-size: 0.875rem;
  }

  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted, #666);
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--border-light, #e0e0e0);
    border-top-color: var(--accent-primary, #007bff);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 1rem;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error {
    color: var(--text-error, #d32f2f);
  }

  .error-message {
    font-size: 0.875rem;
    color: var(--text-muted, #666);
    margin-top: 0.5rem;
  }

  /* Highlight layer - between canvas and text layer */
  :global(.pdf-highlight-layer) {
    position: absolute;
    left: 0;
    top: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    z-index: 1;
  }

  :global(.pdf-highlight) {
    position: absolute;
    background: rgba(255, 235, 59, 0.4);
    mix-blend-mode: multiply;
    border-radius: 2px;
  }

  .dark-mode :global(.pdf-highlight) {
    background: rgba(255, 235, 59, 0.3);
    mix-blend-mode: screen;
  }

  /* Text layer for selection - using pdf.js styles */
  :global(.textLayer) {
    position: absolute;
    text-align: initial;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    -webkit-text-size-adjust: none;
    -moz-text-size-adjust: none;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    z-index: 2;
    pointer-events: auto;
  }

  :global(.textLayer :is(span, br)) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    pointer-events: auto;
    -webkit-user-select: text;
    -moz-user-select: text;
    user-select: text;
  }

  :global(.textLayer > :not(.markedContent)),
  :global(.textLayer .markedContent span:not(.markedContent)) {
    z-index: 1;
  }

  :global(.textLayer ::selection) {
    background: rgba(0, 100, 255, 0.3);
  }
</style>
