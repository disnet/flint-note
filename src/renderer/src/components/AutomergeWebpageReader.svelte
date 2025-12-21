<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import DOMPurify from 'dompurify';
  import type {
    WebpageHighlight,
    WebpageSelectionInfo,
    WebpageMetadata
  } from '../lib/automerge/types';

  interface Props {
    htmlContent: string;
    highlights?: WebpageHighlight[];
    onRelocate?: (progress: number) => void;
    onMetadataLoaded?: (metadata: WebpageMetadata | null) => void;
    onTextSelected?: (selection: WebpageSelectionInfo | null) => void;
    onError?: (error: Error) => void;
  }

  let {
    htmlContent,
    highlights = [],
    onRelocate = () => {},
    onMetadataLoaded = () => {},
    onTextSelected = () => {},
    onError = () => {}
  }: Props = $props();

  // State
  let container: HTMLDivElement | undefined = $state(undefined);
  let shadowRoot: ShadowRoot | null = null;
  let contentContainer: HTMLElement | null = null;
  let isMounted = $state(false);
  let isDarkMode = $state(false);
  let fullText = '';
  let selectionCheckInterval: ReturnType<typeof setInterval> | null = null;
  let currentSelection = $state<WebpageSelectionInfo | null>(null);
  let baseUrl: string | null = null;

  function checkDarkMode(): boolean {
    const dataTheme = document.documentElement.getAttribute('data-theme');
    if (dataTheme === 'dark') return true;
    if (dataTheme === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getReaderStyles(dark: boolean): string {
    const bg = dark ? '#1a1a1a' : '#ffffff';
    const text = dark ? '#e0e0e0' : '#1a1a1a';
    const linkColor = dark ? '#6db3f2' : '#0066cc';
    const highlightBg = dark ? 'rgba(255, 235, 59, 0.3)' : 'rgba(255, 235, 59, 0.5)';

    return `
      :host {
        display: block;
        width: 100%;
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

  function renderContent(): void {
    if (!htmlContent || !container || !isMounted) return;

    try {
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

      // Set up link click handling
      contentContainer.addEventListener('click', handleLinkClick);

      // Set up selection checking
      startSelectionChecking();

      // Set up scroll position tracking
      container.addEventListener('scroll', handleScroll);

      // Notify that content is loaded
      onMetadataLoaded(null);
    } catch (err) {
      console.error('[WebpageReader] Failed to render content:', err);
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  function handleScroll(): void {
    if (!container || !contentContainer) return;

    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    const progress = scrollHeight > 0 ? (scrollTop / scrollHeight) * 100 : 0;

    onRelocate(Math.min(100, Math.max(0, progress)));
  }

  function handleLinkClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const anchor = target.closest('a');

    if (anchor) {
      event.preventDefault();
      event.stopPropagation();

      const href = anchor.getAttribute('href');
      if (!href) return;

      let resolvedUrl: string;

      if (href.startsWith('http://') || href.startsWith('https://')) {
        resolvedUrl = href;
      } else if (baseUrl) {
        try {
          resolvedUrl = new URL(href, baseUrl).href;
        } catch {
          console.error('[WebpageReader] Failed to resolve relative URL', {
            href,
            baseUrl
          });
          return;
        }
      } else {
        console.warn('[WebpageReader] Cannot resolve relative URL without base URL', {
          href
        });
        return;
      }

      window.api?.openExternal({ url: resolvedUrl });
    }
  }

  function startSelectionChecking(): void {
    if (selectionCheckInterval) {
      clearInterval(selectionCheckInterval);
    }

    selectionCheckInterval = setInterval(() => {
      checkForSelection();
    }, 200);

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
    if (!shadowRoot || !contentContainer) return;

    try {
      const selection =
        (
          shadowRoot as ShadowRoot & { getSelection?: () => Selection | null }
        ).getSelection?.() || document.getSelection();

      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);

        if (!shadowRoot.contains(range.commonAncestorContainer)) {
          if (currentSelection) {
            currentSelection = null;
            onTextSelected(null);
          }
          return;
        }

        const text = range.toString().trim();
        if (text && text.length > 0) {
          const preRange = document.createRange();
          preRange.setStart(contentContainer, 0);
          preRange.setEnd(range.startContainer, range.startOffset);
          const startOffset = preRange.toString().length;
          const endOffset = startOffset + text.length;

          const { prefix, suffix } = extractSelectionContext(
            fullText,
            startOffset,
            endOffset
          );

          const rangeRect = range.getBoundingClientRect();

          // Use viewport-relative coordinates for fixed positioning
          const selectionInfo: WebpageSelectionInfo = {
            text,
            prefix,
            suffix,
            startOffset,
            endOffset,
            position: {
              x: rangeRect.left + rangeRect.width / 2,
              y: rangeRect.bottom
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

  function extractSelectionContext(
    text: string,
    startOffset: number,
    endOffset: number,
    contextLength: number = 30
  ): { prefix: string; suffix: string } {
    const prefix = text.slice(Math.max(0, startOffset - contextLength), startOffset);
    const suffix = text.slice(
      endOffset,
      Math.min(text.length, endOffset + contextLength)
    );
    return { prefix, suffix };
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

  function findHighlightInText(
    text: string,
    highlight: WebpageHighlight
  ): { start: number; end: number } | null {
    // First try exact match with context
    const searchPattern = highlight.prefix + highlight.text + highlight.suffix;
    let idx = text.indexOf(searchPattern);
    if (idx !== -1) {
      return {
        start: idx + highlight.prefix.length,
        end: idx + highlight.prefix.length + highlight.text.length
      };
    }

    // Try finding just the text content
    idx = text.indexOf(highlight.text);
    if (idx !== -1) {
      return {
        start: idx,
        end: idx + highlight.text.length
      };
    }

    // Fallback to stored offsets
    if (
      highlight.startOffset >= 0 &&
      highlight.endOffset <= text.length &&
      text.slice(highlight.startOffset, highlight.endOffset) === highlight.text
    ) {
      return {
        start: highlight.startOffset,
        end: highlight.endOffset
      };
    }

    return null;
  }

  function highlightTextRange(start: number, end: number, _id: string): void {
    if (!contentContainer) return;

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
        // Range might cross element boundaries
      }
    }
  }

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
    container?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  export function scrollToProgress(progress: number): void {
    if (!container) return;

    const scrollHeight = container.scrollHeight - container.clientHeight;
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

  // Watch for htmlContent changes
  $effect(() => {
    if (htmlContent && container && isMounted) {
      renderContent();
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
    contentContainer?.removeEventListener('click', handleLinkClick);
  });
</script>

<div class="webpage-reader" bind:this={container}>
  <!-- Shadow DOM content rendered here -->
</div>

<style>
  .webpage-reader {
    flex: 1;
    overflow-y: auto;
    background: var(--bg-primary);
  }
</style>
