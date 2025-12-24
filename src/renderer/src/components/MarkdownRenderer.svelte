<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  interface Props {
    text: string;
    onNoteClick?: (noteId: string, shiftKey?: boolean) => void;
  }

  let { text, onNoteClick }: Props = $props();

  interface NoteLinkPlaceholder {
    id: string;
    noteId: string;
    displayText: string;
  }

  function extractCodeSpans(text: string): {
    text: string;
    codeSpans: string[];
  } {
    const codeSpans: string[] = [];
    const codeSpanRegex = /`([^`]+)`/g;
    let match;
    let result = text;

    while ((match = codeSpanRegex.exec(text)) !== null) {
      const placeholder = `__CODE_SPAN_${codeSpans.length}__`;
      codeSpans.push(match[0]);
      result = result.replace(match[0], placeholder);
    }

    return { text: result, codeSpans };
  }

  function restoreCodeSpans(text: string, codeSpans: string[]): string {
    let result = text;
    codeSpans.forEach((codeSpan, index) => {
      result = result.replace(`__CODE_SPAN_${index}__`, codeSpan);
    });
    return result;
  }

  function extractNoteLinks(text: string): {
    text: string;
    noteLinks: NoteLinkPlaceholder[];
  } {
    const noteLinks: NoteLinkPlaceholder[] = [];
    const noteRegex =
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]|(\b[\w-]+\.md\b)|(NOTE_LINK_\d+)|(\b\d{4}-W\d{2}\b)/g;
    let match;
    let result = text;

    while ((match = noteRegex.exec(text)) !== null) {
      let noteId: string;
      let displayText: string;

      if (match[1]) {
        // [[note-id]] or [[note-id|display text]] format
        noteId = match[1];
        displayText = match[2] || noteId;
      } else if (match[3]) {
        // [note-id] format
        noteId = match[3];
        displayText = match[3];
      } else if (match[4]) {
        // note.md format
        noteId = match[4];
        displayText = match[4];
      } else if (match[5]) {
        // NOTE_LINK_N format
        noteId = match[5];
        displayText = match[5];
      } else if (match[6]) {
        // YYYY-WNN format (weekly notes)
        noteId = match[6];
        displayText = match[6];
      } else {
        continue;
      }

      const placeholder: NoteLinkPlaceholder = {
        id: `NOTELINK${noteLinks.length}PLACEHOLDER`,
        noteId,
        displayText
      };

      noteLinks.push(placeholder);
      result = result.replace(match[0], placeholder.id);
    }

    return { text: result, noteLinks };
  }

  function restoreNoteLinks(html: string, noteLinks: NoteLinkPlaceholder[]): string {
    let result = html;

    noteLinks.forEach((noteLink) => {
      const buttonHtml = `<button class="note-link" data-note-id="${noteLink.noteId}" title="Click to open note">${noteLink.displayText}</button>`;
      result = result.replaceAll(noteLink.id, buttonHtml);
    });

    return result;
  }

  const renderedHtml = $derived.by(() => {
    // Step 1: Extract code spans to preserve them from note link parsing
    const { text: textWithoutCode, codeSpans } = extractCodeSpans(text);

    // Step 2: Extract note links from text (but not from code spans)
    const { text: textWithoutNotes, noteLinks } = extractNoteLinks(textWithoutCode);

    // Step 3: Restore code spans before markdown processing
    const textWithRestoredCode = restoreCodeSpans(textWithoutNotes, codeSpans);

    // Step 4: Parse markdown
    let html: string;
    const parsedResult = marked.parse(textWithRestoredCode);
    if (typeof parsedResult === 'string') {
      html = parsedResult;
    } else {
      // If it's a promise, we need to handle this differently
      // For now, return a placeholder until we can make this async
      return '<div>Loading...</div>';
    }

    // Step 5: Restore note links as HTML buttons
    html = restoreNoteLinks(html, noteLinks);

    // Step 6: Sanitize HTML
    const sanitized = DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'p',
        'strong',
        'b',
        'em',
        'i',
        'code',
        'pre',
        'ul',
        'ol',
        'li',
        'blockquote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'br',
        'button',
        'span',
        'div',
        'img'
      ],
      ALLOWED_ATTR: ['class', 'data-note-id', 'title'],
      ALLOW_DATA_ATTR: true,
      KEEP_CONTENT: true
    });

    return sanitized;
  });

  function handleClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.classList.contains('note-link')) {
      const noteId = target.getAttribute('data-note-id');
      if (noteId) {
        const mouseEvent = event as MouseEvent;
        onNoteClick?.(noteId, mouseEvent.shiftKey);
      }
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      handleClick(event);
    }
  }
</script>

<div
  class="markdown-content"
  onclick={handleClick}
  onkeydown={handleKeydown}
  role="button"
  aria-label="Rendered markdown with clickable note links"
  tabindex="0"
>
  {@html renderedHtml}
</div>

<style>
  .markdown-content :global(p) {
    margin: 0 0 0.75em 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    margin: 1em 0 0.5em 0;
    font-weight: 600;
    line-height: 1.3;
  }

  .markdown-content :global(h1:first-child),
  .markdown-content :global(h2:first-child),
  .markdown-content :global(h3:first-child),
  .markdown-content :global(h4:first-child),
  .markdown-content :global(h5:first-child),
  .markdown-content :global(h6:first-child) {
    margin-top: 0;
  }

  .markdown-content :global(h1) {
    font-size: 1.25rem;
  }

  .markdown-content :global(h2) {
    font-size: 1.125rem;
  }

  .markdown-content :global(h3) {
    font-size: 1rem;
  }

  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    font-size: 0.9rem;
  }

  .markdown-content :global(strong),
  .markdown-content :global(b) {
    font-weight: 600;
  }

  .markdown-content :global(em),
  .markdown-content :global(i) {
    font-style: italic;
  }

  .markdown-content :global(code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.85em;
  }

  .markdown-content :global(pre) {
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.375rem;
    padding: 0.75rem;
    overflow-x: auto;
    margin: 0.75em 0;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.85em;
    line-height: 1.4;
  }

  .markdown-content :global(pre code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 0.75em 0;
    padding-left: 1.5rem;
  }

  .markdown-content :global(li) {
    margin: 0.25em 0;
  }

  .markdown-content :global(blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.2);
    padding-left: 1rem;
    margin: 0.75em 0;
    font-style: italic;
    color: var(--text-secondary);
  }

  .markdown-content :global(.note-link) {
    background: rgba(0, 0, 0, 0.03);
    color: #1a1a1a;
    border: none;
    border-radius: 0.25rem;
    padding: 0 0.175rem;
    margin: 0 0.125rem;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    text-decoration: underline;
    display: inline-flex;
    align-items: center;
    text-align: left;
    transition: all 0.2s ease;
    font-weight: 600;
  }

  .markdown-content :global(.note-link:hover) {
    background: rgba(0, 0, 0, 0.06);
    color: #0066cc;
  }

  @media (prefers-color-scheme: dark) {
    .markdown-content :global(code) {
      background: rgba(255, 255, 255, 0.1);
    }

    .markdown-content :global(pre) {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .markdown-content :global(blockquote) {
      border-left-color: rgba(255, 255, 255, 0.2);
    }

    .markdown-content :global(.note-link) {
      background: rgba(255, 255, 255, 0.06);
      color: #ffffff;
    }

    .markdown-content :global(.note-link:hover) {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
    }
  }
</style>
