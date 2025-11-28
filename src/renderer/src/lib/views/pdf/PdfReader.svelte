<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { PdfOutlineItem, PdfMetadata, PdfLocation } from './types';
  import * as pdfjsLib from 'pdfjs-dist';
  import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

  // Set up the worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  // Props
  let {
    pdfPath = '',
    initialPage = 1,
    onRelocate = (_page: number, _progress: number, _location: PdfLocation) => {},
    onOutlineLoaded = (_outline: PdfOutlineItem[]) => {},
    onMetadataLoaded = (_metadata: PdfMetadata) => {},
    onError = (_error: Error) => {}
  }: {
    pdfPath: string;
    initialPage?: number;
    onRelocate?: (page: number, progress: number, location: PdfLocation) => void;
    onOutlineLoaded?: (outline: PdfOutlineItem[]) => void;
    onMetadataLoaded?: (metadata: PdfMetadata) => void;
    onError?: (error: Error) => void;
  } = $props();

  // State
  let container: HTMLDivElement;
  let pagesContainer: HTMLDivElement;
  let isMounted = $state(false);
  let isDarkMode = $state(false);
  let pdfDoc: pdfjsLib.PDFDocumentProxy | null = $state(null);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let totalPages = $state(0);
  let currentPage = $state(1);
  let renderedPages = new Set<number>();
  let pageObserver: IntersectionObserver | null = null;
  let pageElements: Map<number, HTMLDivElement> = new Map();
  let scale = 1.5;

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

      // Navigate to initial page
      if (initialPage > 1 && initialPage <= totalPages) {
        await goToPage(initialPage);
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

      // Create canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Remove placeholder label
      const label = pageDiv.querySelector('.page-label');
      if (label) {
        label.remove();
      }

      // Add canvas
      pageDiv.appendChild(canvas);

      // Render page
      await page.render({
        canvasContext: context,
        viewport: viewport,
        canvas
      }).promise;
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

  // Public methods
  export async function goToPage(pageNumber: number): Promise<void> {
    if (pageNumber < 1 || pageNumber > totalPages) return;

    const pageDiv = pageElements.get(pageNumber);
    if (pageDiv && container) {
      pageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

      await goToPage(pageNumber);
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

    return () => {
      themeObserver.disconnect();
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  });

  onDestroy(() => {
    isMounted = false;

    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }

    if (pdfDoc) {
      pdfDoc.destroy();
      pdfDoc = null;
    }

    pageElements.clear();
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
    overflow-y: auto;
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
</style>
