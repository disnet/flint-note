<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import DOMPurify from 'dompurify';
  import type { WebpageHighlight, WebpageSelectionInfo, WebpageMetadata } from './types';
  import { findHighlightInText, extractSelectionContext } from './types';
  import { logger } from '../../../utils/logger';

  // Props
  let {
    webpagePath = '',
    highlights = [],
    onRelocate = (_progress: number) => {},
    onMetadataLoaded = (_metadata: WebpageMetadata | null) => {},
    onTextSelected = (_selection: WebpageSelectionInfo | null) => {},
    onError = (_error: Error) => {}
  }: {
    webpagePath: string;
    highlights?: WebpageHighlight[];
    onRelocate?: (progress: number) => void;
    onMetadataLoaded?: (metadata: WebpageMetadata | null) => void;
    onTextSelected?: (selection: WebpageSelectionInfo | null) => void;
    onError?: (error: Error) => void;
  } = $props();

  // State
  let container: HTMLDivElement;
  let shadowRoot: ShadowRoot | null = null;
  let contentContainer: HTMLElement | null = null;
  let isMounted = $state(false);
  let isDarkMode = $state(false);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let currentSelection = $state<WebpageSelectionInfo | null>(null);
  let fullText = ''; // Plain text content for offset calculations
  let selectionCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Check if dark mode is active
  function checkDarkMode(): boolean {
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme === 'dark') return true;
    if (dataTheme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // Get reader styles
  function getReaderStyles(dark: boolean): string {
    const bg = dark ? '#1a1a1a' : '#ffffff';
    const text = dark ? '#e0e0e0' : '#1a1a1a';
    const linkColor = dark ? '#6db3f2' : '#0066cc';
    const highlightBg = dark ? 'rgba(255, 235, 59, 0.3)' : 'rgba(255, 235, 59, 0.5)';

    return `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        overflow-y: auto;
        background: ${bg};
        color: ${text};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        -webkit-user-select: text;
        user-select: text;
        cursor: text;
      }

      .content-wrapper {
        max-width: 720px;
        margin: 0 auto;
        padding: 2rem 1.5rem;
        line-height: 1.7;
        -webkit-user-select: text;
        user-select: text;
        cursor: text;
      }

      * {
        -webkit-user-select: text;
        user-select: text;
      }

      article {
        font-size: 1.1rem;
      }

      h1 {
        font-size: 2rem;
        line-height: 1.3;
        margin-bottom: 0.5rem;
        font-weight: 700;
      }

      h2 {
        font-size: 1.5rem;
        margin-top: 2rem;
        margin-bottom: 1rem;
      }

      h3 {
        font-size: 1.25rem;
        margin-top: 1.5rem;
        margin-bottom: 0.75rem;
      }

      p {
        margin-bottom: 1.25rem;
      }

      .byline {
        color: ${dark ? '#999' : '#666'};
        font-style: italic;
        margin-bottom: 2rem;
      }

      a {
        color: ${linkColor};
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
        margin: 1rem 0;
      }

      blockquote {
        border-left: 4px solid ${dark ? '#444' : '#ddd'};
        margin: 1.5rem 0;
        padding-left: 1rem;
        color: ${dark ? '#aaa' : '#555'};
        font-style: italic;
      }

      pre, code {
        background: ${dark ? '#2a2a2a' : '#f5f5f5'};
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 0.9em;
      }

      code {
        padding: 0.2em 0.4em;
      }

      pre {
        padding: 1rem;
        overflow-x: auto;
      }

      pre code {
        padding: 0;
        background: none;
      }

      ul, ol {
        margin-bottom: 1.25rem;
        padding-left: 1.5rem;
      }

      li {
        margin-bottom: 0.5rem;
      }

      hr {
        border: none;
        border-top: 1px solid ${dark ? '#444' : '#ddd'};
        margin: 2rem 0;
      }

      figure {
        margin: 1.5rem 0;
      }

      figcaption {
        font-size: 0.9rem;
        color: ${dark ? '#888' : '#666'};
        text-align: center;
        margin-top: 0.5rem;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1.5rem 0;
      }

      th, td {
        border: 1px solid ${dark ? '#444' : '#ddd'};
        padding: 0.75rem;
        text-align: left;
      }

      th {
        background: ${dark ? '#2a2a2a' : '#f5f5f5'};
      }

      .highlight {
        background: ${highlightBg};
        border-radius: 2px;
        padding: 0 2px;
      }

      ::selection {
        background: ${dark ? 'rgba(100, 150, 255, 0.4)' : 'rgba(0, 100, 255, 0.2)'};
      }
    `;
  }

  async function loadWebpage(): Promise<void> {
    if (!webpagePath || !container || !isMounted) return;

    isLoading = true;
    loadError = null;

    try {
      // Read the webpage HTML
      const htmlContent = await window.api?.readWebpageFile({
        relativePath: webpagePath
      });

      if (!isMounted || !container) {
        logger.debug('[Webpage] Component unmounted during file read, aborting load');
        return;
      }

      if (!htmlContent) {
        throw new Error('Failed to read webpage file');
      }

      // Parse the HTML to extract body content
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      const bodyContent = doc.body.innerHTML;

      // Sanitize the HTML with DOMPurify
      const cleanHtml = DOMPurify.sanitize(bodyContent, {
        ADD_TAGS: [
          'article',
          'section',
          'header',
          'footer',
          'aside',
          'figure',
          'figcaption'
        ],
        ADD_ATTR: ['target'],
        FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover']
      });

      // Create shadow root if not already created
      if (!shadowRoot) {
        shadowRoot = container.attachShadow({ mode: 'open' });
      }

      // Create the styles and content
      isDarkMode = checkDarkMode();
      const styleElement = document.createElement('style');
      styleElement.textContent = getReaderStyles(isDarkMode);

      contentContainer = document.createElement('div');
      contentContainer.className = 'content-wrapper';
      contentContainer.innerHTML = cleanHtml;

      // Store plain text for offset calculations
      fullText = contentContainer.textContent || '';

      // Clear and add new content
      shadowRoot.innerHTML = '';
      shadowRoot.appendChild(styleElement);
      shadowRoot.appendChild(contentContainer);

      // Apply any existing highlights
      if (highlights.length > 0) {
        applyHighlights(highlights);
      }

      // Set up selection checking
      startSelectionChecking();

      // Set up scroll position tracking
      container.addEventListener('scroll', handleScroll);

      // Try to load metadata from the meta.json file
      try {
        const metaPath = webpagePath.replace('.html', '.meta.json');
        const metaContent = await window.api?.readWebpageFile({ relativePath: metaPath });
        if (metaContent) {
          const metadata = JSON.parse(metaContent) as WebpageMetadata;
          onMetadataLoaded(metadata);
        }
      } catch {
        // Metadata file might not exist, that's okay
        onMetadataLoaded(null);
      }

      isLoading = false;
    } catch (err) {
      console.error('Failed to load webpage:', err);
      loadError = err instanceof Error ? err.message : 'Failed to load webpage';
      isLoading = false;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function handleScroll(): void {
    if (!container || !contentContainer) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = contentContainer.scrollHeight - container.clientHeight;
    const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

    onRelocate(Math.min(100, Math.max(0, progress)));
  }

  function startSelectionChecking(): void {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
    }

    selectionCheckInterval = setInterval(() => {
      checkForSelection();
    }, 200);

    // Attach mouseup listener inside the shadow DOM for proper selection detection
    contentContainer?.addEventListener('mouseup', handleMouseUp);
  }

  function stopSelectionChecking(): void {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
      selectionCheckInterval = null;
    }
    contentContainer?.removeEventListener('mouseup', handleMouseUp);
  }

  function handleMouseUp(): void {
    setTimeout(() => {
      checkForSelection();
    }, 50);
  }

  function checkForSelection(): void {
    if (!shadowRoot) return;

    try {
      // Some browsers support getSelection on ShadowRoot (not in standard TS types)
      const selection =
        (
          shadowRoot as ShadowRoot & { getSelection?: () => Selection | null }
        ).getSelection?.() || document.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);

        // Check if selection is within our shadow root
        if (!shadowRoot.contains(range.commonAncestorContainer)) {
          if (currentSelection) {
            currentSelection = null;
            onTextSelected(null);
          }
          return;
        }

        const text = range.toString().trim();
        if (text && text.length > 0) {
          // Calculate offsets within the full text
          const preRange = document.createRange();
          preRange.setStart(contentContainer!, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const startOffset = preRange.toString().length;
          const endOffset = startOffset + text.length;

          // Extract context
          const { prefix, suffix } = extractSelectionContext(
            fullText,
            startOffset,
            endOffset
          );

          // Calculate position for popup
          const rangeRect = range.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          const selectionInfo: WebpageSelectionInfo = {
            text,
            prefix,
            suffix,
            startOffset,
            endOffset,
            position: {
              x: rangeRect.left + rangeRect.width / 2 - containerRect.left,
              y: rangeRect.bottom - containerRect.top
            }
          };

          if (!currentSelection || currentSelection.text !== text) {
            currentSelection = selectionInfo;
            onTextSelected(currentSelection);
          }
          return;
        }
      }

      if (currentSelection) {
        currentSelection = null;
        onTextSelected(null);
      }
    } catch {
      // Ignore selection errors
    }
  }

  function applyHighlights(highlightsToApply: WebpageHighlight[]): void {
    if (!contentContainer || !fullText) return;

    // Remove existing highlights first
    const existingHighlights = contentContainer.querySelectorAll('.highlight');
    existingHighlights.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });

    // Apply new highlights
    for (const highlight of highlightsToApply) {
      const location = findHighlightInText(fullText, highlight);
      if (location) {
        highlightTextRange(location.start, location.end, highlight.id);
      }
    }
  }

  function highlightTextRange(start: number, end: number, _id: string): void {
    if (!contentContainer) return;

    // Walk through text nodes to find and wrap the range
    const walker = document.createTreeWalker(
      contentContainer,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentOffset = 0;
    let startNode: Text | null = null;
    let startNodeOffset = 0;
    let endNode: Text | null = null;
    let endNodeOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const nodeLength = node.length;

      if (!startNode && currentOffset + nodeLength > start) {
        startNode = node;
        startNodeOffset = start - currentOffset;
      }

      if (startNode && currentOffset + nodeLength >= end) {
        endNode = node;
        endNodeOffset = end - currentOffset;
        break;
      }

      currentOffset += nodeLength;
    }

    if (startNode && endNode) {
      try {
        const range = document.createRange();
        range.setStart(startNode, startNodeOffset);
        range.setEnd(endNode, endNodeOffset);

        const span = document.createElement('span');
        span.className = 'highlight';
        range.surroundContents(span);
      } catch {
        // Range might cross element boundaries, handle gracefully
      }
    }
  }

  // Update theme styles
  function updateThemeStyles(): void {
    if (!shadowRoot) return;

    const styleElement = shadowRoot.querySelector('style');
    if (styleElement) {
      isDarkMode = checkDarkMode();
      styleElement.textContent = getReaderStyles(isDarkMode);
    }
  }

  // Public methods
  export function scrollToTop(): void {
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  export function scrollToProgress(progress: number): void {
    if (!container || !contentContainer) return;

    const scrollHeight = contentContainer.scrollHeight - container.clientHeight;
    const targetScroll = (progress / 100) * scrollHeight;
    container.scrollTo({ top: targetScroll, behavior: 'smooth' });
  }

  export function clearSelection(): void {
    currentSelection = null;
    onTextSelected(null);
  }

  export function refreshHighlights(): void {
    applyHighlights(highlights);
  }

  // Watch for webpagePath changes
  $effect(() => {
    if (webpagePath) {
      loadWebpage();
    }
  });

  // Watch for highlight changes
  $effect(() => {
    if (highlights && contentContainer) {
      applyHighlights(highlights);
    }
  });

  // Theme change observers
  let themeObserver: MutationObserver | null = null;
  let mediaQueryList: MediaQueryList | null = null;

  function handleThemeChange(): void {
    const newDarkMode = checkDarkMode();
    if (newDarkMode !== isDarkMode) {
      updateThemeStyles();
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
  });

  onDestroy(() => {
    isMounted = false;
    stopSelectionChecking();
    themeObserver?.disconnect();
    mediaQueryList?.removeEventListener('change', handleThemeChange);
    container?.removeEventListener('scroll', handleScroll);
  });
</script>

<div class="webpage-reader" bind:this={container}>
  {#if isLoading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Loading article...</p>
    </div>
  {:else if loadError}
    <div class="error-state">
      <div class="error-icon">!</div>
      <p>{loadError}</p>
      <button onclick={() => loadWebpage()}>Retry</button>
    </div>
  {/if}
</div>

<style>
  .webpage-reader {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: var(--bg-primary, #fff);
    position: relative;
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
