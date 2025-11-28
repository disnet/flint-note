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
        'span'
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
</style>
