<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';
  import { notesStore } from '../services/noteStore.svelte';
  import { workspacesStore } from '../stores/workspacesStore.svelte';
  import { notesShelfStore } from '../stores/notesShelfStore.svelte';
  import { sidebarState } from '../stores/sidebarState.svelte';
  import { reviewStore } from '../stores/reviewStore.svelte';
  import { getChatService } from '../services/chatService';

  interface Props {
    text: string;
    onNoteClick?: (noteId: string, shiftKey?: boolean) => void;
  }

  let { text, onNoteClick }: Props = $props();

  // Reference to the markdown content container for image loading
  let markdownContainer: HTMLDivElement;

  // Cache for blob URLs (non-reactive, just for performance)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const imageBlobCache = new Map<string, string>();

  // Load images after render
  $effect(() => {
    // Depend on text and renderedHtml to re-run when content changes
    const _content = text;
    void _content;

    if (!markdownContainer) return;

    // Find all images that need loading
    const images = markdownContainer.querySelectorAll('img[data-image-path]');
    images.forEach(async (img) => {
      const imgElement = img as HTMLImageElement;
      const path = imgElement.dataset.imagePath;
      if (!path) return;

      // Check cache first
      if (imageBlobCache.has(path)) {
        imgElement.src = imageBlobCache.get(path)!;
        imgElement.classList.remove('rendered-image-loading');
        return;
      }

      try {
        const imageData = await window.api?.readImageFile({ relativePath: path });
        if (imageData) {
          const ext = path.split('.').pop()?.toLowerCase() || 'png';
          const mimeTypes: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp'
          };
          // Create a new Uint8Array with a proper ArrayBuffer to satisfy TypeScript
          const buffer = new Uint8Array(imageData).buffer;
          const blob = new Blob([buffer], { type: mimeTypes[ext] || 'image/png' });
          const blobUrl = URL.createObjectURL(blob);
          imageBlobCache.set(path, blobUrl);
          imgElement.src = blobUrl;
          imgElement.classList.remove('rendered-image-loading');
        } else {
          imgElement.classList.add('rendered-image-error');
          imgElement.alt = `Failed to load: ${path}`;
        }
      } catch (error) {
        console.error('Failed to load image:', path, error);
        imgElement.classList.add('rendered-image-error');
      }
    });
  });

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuNoteId = $state<string | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });
  let contextMenuReviewEnabled = $state(false);
  let moveSubmenuOpen = $state(false);
  let submenuOpenLeft = $state(false);

  // Get all workspaces for move menu
  let allWorkspaces = $derived(workspacesStore.workspaces);

  function handleSubmenuEnter(event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const submenuWidth = 150; // approximate width

    // Check if submenu would overflow right edge
    submenuOpenLeft = rect.right + submenuWidth > window.innerWidth;
    moveSubmenuOpen = true;
  }

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

  interface InlineImagePlaceholder {
    id: string;
    altText: string;
    path: string;
  }

  function extractInlineImages(text: string): {
    text: string;
    images: InlineImagePlaceholder[];
  } {
    const images: InlineImagePlaceholder[] = [];
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    let result = text;

    while ((match = imageRegex.exec(text)) !== null) {
      // Only process images from attachments/images directory
      if (match[2].startsWith('attachments/images/')) {
        const placeholder: InlineImagePlaceholder = {
          id: `__IMAGE_PLACEHOLDER_${images.length}__`,
          altText: match[1],
          path: match[2]
        };
        images.push(placeholder);
        result = result.replace(match[0], placeholder.id);
      }
    }

    return { text: result, images };
  }

  function restoreInlineImages(html: string, images: InlineImagePlaceholder[]): string {
    let result = html;

    for (const image of images) {
      const imageHtml = `
        <div class="inline-image-wrapper">
          <img
            class="rendered-image rendered-image-loading"
            alt="${escapeHtml(image.altText)}"
            data-image-path="${escapeHtml(image.path)}"
          />
          <div class="image-control-bar">
            <span class="image-alt-text">${escapeHtml(image.altText) || '(no alt text)'}</span>
            <button class="image-path-button" data-path="${escapeHtml(image.path)}" title="Open in file explorer">
              ${escapeHtml(image.path)}
            </button>
          </div>
        </div>
      `;

      result = result.replace(image.id, imageHtml);
    }

    return result;
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
        if (match[2]) {
          // Has display text
          displayText = match[2];
        } else {
          // ID-only link - look up the note's title
          const note = notesStore.notes.find((n) => n.id === noteId);
          displayText = note?.title || noteId;
        }
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
      // Look up the note and its type to get the icon
      const note = notesStore.notes.find((n) => n.id === noteLink.noteId);
      let iconHtml = '';

      if (note) {
        const noteType = notesStore.noteTypes.find((t) => t.name === note.type);
        if (noteType?.icon) {
          iconHtml = `<span class="note-link-icon">${noteType.icon}</span>`;
        }
      }

      const buttonHtml = `<button class="note-link" data-note-id="${noteLink.noteId}" title="Click to open note">${iconHtml}${noteLink.displayText}</button>`;
      result = result.replaceAll(noteLink.id, buttonHtml);
    });

    return result;
  }

  const renderedHtml = $derived.by(() => {
    // Step 1: Extract code spans to preserve them from note link parsing
    const { text: textWithoutCode, codeSpans } = extractCodeSpans(text);

    // Step 2: Extract inline images from text (but not from code spans)
    const { text: textWithoutImages, images } = extractInlineImages(textWithoutCode);

    // Step 3: Extract note links from text (but not from code spans or images)
    const { text: textWithoutNotes, noteLinks } = extractNoteLinks(textWithoutImages);

    // Step 4: Restore code spans before markdown processing
    const textWithRestoredCode = restoreCodeSpans(textWithoutNotes, codeSpans);

    // Step 5: Parse markdown
    let html: string;
    const parsedResult = marked.parse(textWithRestoredCode);
    if (typeof parsedResult === 'string') {
      html = parsedResult;
    } else {
      // If it's a promise, we need to handle this differently
      // For now, return a placeholder until we can make this async
      return '<div>Loading...</div>';
    }

    // Step 6: Restore note links as HTML buttons
    html = restoreNoteLinks(html, noteLinks);

    // Step 7: Restore inline images as HTML
    html = restoreInlineImages(html, images);

    // Step 8: Sanitize HTML
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
      ALLOWED_ATTR: [
        'class',
        'data-note-id',
        'title',
        'alt',
        'src',
        'data-image-path',
        'data-path'
      ],
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
    } else if (target.classList.contains('image-path-button')) {
      event.preventDefault();
      event.stopPropagation();
      const path = target.getAttribute('data-path');
      if (path) {
        handleImagePathClick(path);
      }
    }
  }

  async function handleImagePathClick(relativePath: string): Promise<void> {
    try {
      const absolutePath = await window.api?.getImageAbsolutePath({
        relativePath
      });
      if (absolutePath) {
        await window.api?.showItemInFolder({ path: absolutePath });
      }
    } catch (error) {
      console.error('Failed to open image location:', error);
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      handleClick(event);
    }
  }

  // Context menu handlers
  async function handleContextMenu(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('note-link')) return;

    const noteId = target.getAttribute('data-note-id');
    if (!noteId) return;

    event.preventDefault();
    contextMenuNoteId = noteId;

    // Check review status for this note
    contextMenuReviewEnabled = await reviewStore.isReviewEnabled(noteId);

    // Calculate position with viewport bounds checking
    const menuWidth = 180;
    const menuHeight = 200;
    const padding = 8;

    let x = event.clientX;
    let y = event.clientY;

    // Adjust if menu would overflow right edge
    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Adjust if menu would overflow bottom edge
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure menu doesn't go off left or top edge
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    contextMenuPosition = { x, y };
    contextMenuOpen = true;
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
    contextMenuNoteId = null;
    moveSubmenuOpen = false;
  }

  function handleGlobalClick(event: MouseEvent): void {
    if (contextMenuOpen) {
      const target = event.target as Element;
      if (!target.closest('.wikilink-context-menu')) {
        closeContextMenu();
      }
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && contextMenuOpen) {
      closeContextMenu();
    }
  }

  // Context menu action handlers
  async function handleOpenInShelf(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      const note = notesStore.notes.find((n) => n.id === contextMenuNoteId);
      if (!note) return;

      const chatService = getChatService();
      const noteContent = await chatService.getNote({ identifier: note.id });

      if (noteContent) {
        await notesShelfStore.addNote(note.id, note.title, noteContent.content);

        // Open the right sidebar in notes mode if not already visible
        if (
          !sidebarState.rightSidebar.visible ||
          sidebarState.rightSidebar.mode !== 'notes'
        ) {
          await sidebarState.setRightSidebarMode('notes');
          if (!sidebarState.rightSidebar.visible) {
            await sidebarState.toggleRightSidebar();
          }
        }
      }
    } catch (error) {
      console.error('[MarkdownRenderer] Failed to add note to shelf:', error);
    }

    closeContextMenu();
  }

  async function handleArchive(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      const chatService = getChatService();
      const vault = await chatService.getCurrentVault();
      if (!vault) {
        console.error('No vault available');
        return;
      }

      await chatService.archiveNote({
        vaultId: vault.id,
        identifier: contextMenuNoteId
      });
    } catch (error) {
      console.error('[MarkdownRenderer] Failed to archive note:', error);
    }

    closeContextMenu();
  }

  async function handleToggleReview(): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      if (contextMenuReviewEnabled) {
        await reviewStore.disableReview(contextMenuNoteId);
      } else {
        await reviewStore.enableReview(contextMenuNoteId);
      }
    } catch (error) {
      console.error('[MarkdownRenderer] Failed to toggle review:', error);
    }

    closeContextMenu();
  }

  async function handleOpenInWorkspace(workspaceId: string): Promise<void> {
    if (!contextMenuNoteId) return;

    try {
      // Switch to the target workspace
      await workspacesStore.switchWorkspace(workspaceId);

      // Add the note to temporary tabs in that workspace
      await workspacesStore.addTab(contextMenuNoteId, 'navigation');
    } catch (error) {
      console.error('[MarkdownRenderer] Failed to open note in workspace:', error);
    }

    closeContextMenu();
  }
</script>

<div
  bind:this={markdownContainer}
  class="markdown-content"
  onclick={handleClick}
  onkeydown={handleKeydown}
  oncontextmenu={handleContextMenu}
  role="button"
  aria-label="Rendered markdown with clickable note links"
  tabindex="0"
>
  {@html renderedHtml}
</div>

<!-- Global event listeners for context menu -->
<svelte:window onclick={handleGlobalClick} onkeydown={handleGlobalKeydown} />

<!-- Context menu for wikilinks -->
{#if contextMenuOpen}
  <div
    class="wikilink-context-menu"
    style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
    role="menu"
  >
    <button class="context-menu-item" onclick={handleOpenInShelf} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
      </svg>
      <span class="menu-item-label">Open in Shelf</span>
      <span class="menu-item-shortcut">⇧Click</span>
    </button>
    {#if allWorkspaces.length > 0}
      <div
        class="context-menu-item submenu-trigger"
        role="menuitem"
        tabindex="0"
        onmouseenter={handleSubmenuEnter}
        onmouseleave={() => (moveSubmenuOpen = false)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
          <polyline points="10 17 15 12 10 7"></polyline>
          <line x1="15" y1="12" x2="3" y2="12"></line>
        </svg>
        <span class="menu-item-label">Open in Workspace</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="submenu-arrow"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
        {#if moveSubmenuOpen}
          <div class="submenu" class:submenu-left={submenuOpenLeft} role="menu">
            {#each allWorkspaces as workspace (workspace.id)}
              <button
                class="context-menu-item"
                onclick={() => handleOpenInWorkspace(workspace.id)}
                role="menuitem"
              >
                <span class="workspace-icon">{workspace.icon}</span>
                <span class="menu-item-label">{workspace.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
    <button class="context-menu-item" onclick={handleToggleReview} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      {contextMenuReviewEnabled ? 'Disable Review' : 'Enable Review'}
    </button>
    <button class="context-menu-item" onclick={handleArchive} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="21 8 21 21 3 21 3 8"></polyline>
        <rect x="1" y="3" width="22" height="5"></rect>
        <line x1="10" y1="12" x2="14" y2="12"></line>
      </svg>
      Archive
    </button>
  </div>
{/if}

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

  .markdown-content :global(.note-link-icon) {
    font-size: 0.9em;
    line-height: 1;
    display: inline-block;
    vertical-align: baseline;
    margin-right: 0.25em;
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

  /* Context menu styles */
  .wikilink-context-menu {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 160px;
    padding: 0.25rem;
  }

  .context-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 0.25rem;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .context-menu-item:hover {
    background: var(--bg-secondary);
  }

  .context-menu-item svg {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .menu-item-label {
    flex: 1;
  }

  .menu-item-shortcut {
    font-size: 0.6875rem;
    color: var(--text-muted);
    margin-left: auto;
  }

  /* Submenu styles */
  .submenu-trigger {
    position: relative;
    cursor: pointer;
  }

  .submenu-arrow {
    margin-left: auto;
    flex-shrink: 0;
  }

  .submenu {
    position: absolute;
    left: 100%;
    top: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 140px;
    padding: 0.25rem;
    z-index: 1001;
  }

  .submenu.submenu-left {
    left: auto;
    right: 100%;
  }

  .workspace-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  /* Inline image styles */
  .markdown-content :global(.inline-image-wrapper) {
    display: block;
    margin: 0.75em 0;
  }

  .markdown-content :global(.rendered-image) {
    max-width: 100%;
    height: auto;
    border-radius: 4px;
    border: 1px solid var(--border-light, #e0e0e0);
    display: block;
  }

  .markdown-content :global(.rendered-image-loading) {
    min-height: 100px;
    background: var(--bg-secondary, #f5f5f5);
  }

  .markdown-content :global(.rendered-image-error) {
    min-height: 60px;
    background: var(--bg-secondary, #f5f5f5);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-error, #d32f2f);
    font-size: 0.8125rem;
    padding: 1rem;
    border: 1px dashed var(--border-light, #e0e0e0);
  }

  .markdown-content :global(.image-control-bar) {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 4px;
    font-size: 0.8125rem;
    align-items: center;
  }

  .markdown-content :global(.image-alt-text) {
    flex: 1;
    color: var(--text-secondary, #666);
  }

  .markdown-content :global(.image-path-button) {
    padding: 0.125rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-muted, #999);
    font-size: 0.75rem;
    cursor: pointer;
    text-decoration: underline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    font-family: inherit;
  }

  .markdown-content :global(.image-path-button:hover) {
    color: var(--accent-primary, #2196f3);
  }
</style>
