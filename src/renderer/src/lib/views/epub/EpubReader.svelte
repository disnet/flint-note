<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { TocItem, EpubMetadata, EpubLocation } from './types';

  // Props
  let {
    epubPath = '',
    initialCfi = '',
    onRelocate = (_cfi: string, _progress: number, _location: EpubLocation) => {},
    onTocLoaded = (_toc: TocItem[]) => {},
    onMetadataLoaded = (_metadata: EpubMetadata) => {},
    onError = (_error: Error) => {}
  }: {
    epubPath: string;
    initialCfi?: string;
    onRelocate?: (cfi: string, progress: number, location: EpubLocation) => void;
    onTocLoaded?: (toc: TocItem[]) => void;
    onMetadataLoaded?: (metadata: EpubMetadata) => void;
    onError?: (error: Error) => void;
  } = $props();

  // State
  let container: HTMLDivElement;
  let view:
    | (HTMLElement & {
        open: (file: File | Blob) => Promise<void>;
        goTo: (target: string | { index: number }) => Promise<void>;
        goToFraction: (fraction: number) => Promise<void>;
        prev: () => Promise<void>;
        next: () => Promise<void>;
        book?: {
          toc?: TocItem[];
          metadata?: EpubMetadata;
          sections?: { size: number }[];
        };
        renderer?: {
          setStyles?: (styles: string) => void;
        };
      })
    | null = $state(null);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let totalSections = $state(0);

  // Dynamic import of foliate-js view module
  async function initializeFoliateView(): Promise<void> {
    try {
      // Import the view module to register the custom element
      await import('foliate-js/view.js');
    } catch (err) {
      console.error('Failed to load foliate-js:', err);
      throw new Error('Failed to initialize EPUB reader');
    }
  }

  async function loadEpub(): Promise<void> {
    if (!epubPath || !container) return;

    isLoading = true;
    loadError = null;

    try {
      // Initialize foliate-js
      await initializeFoliateView();

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
        console.log('[EPUB] Restoring position to:', initialCfi);
        try {
          await view!.goTo(initialCfi);
          console.log('[EPUB] Position restored successfully');
        } catch (e) {
          console.warn('[EPUB] Failed to navigate to initial CFI:', e);
        }
      } else {
        console.log('[EPUB] No saved position to restore');
      }

      // Set up event listeners
      view!.addEventListener('relocate', handleRelocate as (event: Event) => void);
      view!.addEventListener('load', handleSectionLoad as (event: Event) => void);

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

  // Watch for epubPath changes
  $effect(() => {
    if (epubPath) {
      loadEpub();
    }
  });

  onMount(() => {
    // Initial load will be triggered by $effect when epubPath is set
  });

  onDestroy(() => {
    if (view) {
      view.removeEventListener('relocate', handleRelocate as (event: Event) => void);
      view.removeEventListener('load', handleSectionLoad as (event: Event) => void);
    }
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
