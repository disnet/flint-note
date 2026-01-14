<script lang="ts">
  /**
   * Individual Shelf Item Component
   *
   * Displays a note or conversation on the shelf with expand/collapse functionality.
   * Notes use a full CodeMirror editor for editing.
   */
  import {
    getNote,
    getConversationEntry,
    getNoteType,
    automergeShelfStore
  } from '../lib/automerge';
  import ShelfEditor from './ShelfEditor.svelte';

  interface Props {
    /** Type of item (note or conversation) */
    itemType: 'note' | 'conversation';
    /** ID of the item */
    itemId: string;
    /** Whether content is expanded */
    isExpanded: boolean;
    /** Toggle expand/collapse callback */
    onToggle: () => void;
    /** Remove from shelf callback */
    onRemove: () => void;
    /** Navigate to item callback */
    onNavigate: () => void;
  }

  let { itemType, itemId, isExpanded, onToggle, onRemove, onNavigate }: Props = $props();

  // Reference to the shelf editor for focusing
  let shelfEditorRef: ShelfEditor | null = $state(null);
  // Reference to the item element for scrolling
  let itemElement: HTMLElement | null = $state(null);

  // Scroll and focus when this item is the pending focus target
  $effect(() => {
    if (
      isExpanded &&
      itemType === 'note' &&
      automergeShelfStore.pendingFocusId === itemId
    ) {
      // Scroll item into view first
      if (itemElement) {
        itemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      // Then focus editor after scroll and mount complete
      setTimeout(() => {
        shelfEditorRef?.focus();
        automergeShelfStore.setPendingFocus(null);
      }, 150);
    }
  });

  // Get item data based on type
  const note = $derived(itemType === 'note' ? getNote(itemId) : undefined);
  const conversationEntry = $derived(
    itemType === 'conversation' ? getConversationEntry(itemId) : undefined
  );
  const noteType = $derived(note ? getNoteType(note.type) : undefined);

  // Compute display properties
  const title = $derived.by(() => {
    if (itemType === 'note' && note) {
      return note.title || 'Untitled';
    }
    if (itemType === 'conversation' && conversationEntry) {
      return conversationEntry.title || 'Untitled Conversation';
    }
    return 'Unknown';
  });

  const icon = $derived.by(() => {
    if (itemType === 'note' && noteType) {
      return noteType.icon || '📝';
    }
    return null; // Conversations use SVG icon
  });

  const isArchived = $derived.by(() => {
    if (itemType === 'note' && note) return note.archived;
    if (itemType === 'conversation' && conversationEntry)
      return conversationEntry.archived;
    return false;
  });

  // For conversations: message preview not available (full conversations stored in OPFS)
  // TODO: Consider loading preview asynchronously when expanded
  const recentMessages: { role: string; content: string }[] = $derived.by(() => {
    // Message preview disabled - would need async load from OPFS
    return [];
  });

  // Check if item exists (not deleted)
  const exists = $derived(
    (itemType === 'note' && note !== undefined) ||
      (itemType === 'conversation' && conversationEntry !== undefined)
  );

  function handleTitleClick(event: MouseEvent): void {
    event.stopPropagation();
    onNavigate();
  }

  function handleRemoveClick(event: MouseEvent): void {
    event.stopPropagation();
    onRemove();
  }
</script>

{#if exists}
  <div class="shelf-item" class:archived={isArchived} bind:this={itemElement}>
    <!-- Header row -->
    <div class="item-header">
      <button
        class="disclosure-btn"
        class:expanded={isExpanded}
        onclick={onToggle}
        aria-label={isExpanded ? 'Collapse' : 'Expand'}
        aria-expanded={isExpanded}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      <span class="item-icon">
        {#if itemType === 'conversation'}
          <!-- Chat bubble icon -->
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            ></path>
          </svg>
        {:else}
          <!-- Note emoji icon -->
          <span class="emoji-icon">{icon}</span>
        {/if}
      </span>

      <button class="item-title" onclick={handleTitleClick} title="Open {itemType}">
        {title}
      </button>

      <button
        class="remove-btn"
        onclick={handleRemoveClick}
        title="Remove from shelf"
        aria-label="Remove from shelf"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>

    <!-- Expanded content -->
    {#if isExpanded}
      <div class="item-content">
        {#if itemType === 'note'}
          <!-- Note content editor with CRDT sync -->
          <ShelfEditor bind:this={shelfEditorRef} noteId={itemId} />
        {:else if itemType === 'conversation'}
          <!-- Conversation messages preview -->
          {#if recentMessages.length > 0}
            <div class="messages-preview">
              {#each recentMessages as message, index (index)}
                <div class="message-preview" class:user={message.role === 'user'}>
                  <span class="message-role"
                    >{message.role === 'user' ? 'You' : 'AI'}:</span
                  >
                  <span class="message-text">{message.content}</span>
                </div>
              {/each}
            </div>
          {:else}
            <div class="empty-content">No messages</div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <!-- Item was deleted - show placeholder that auto-removes -->
  <div class="shelf-item deleted">
    <div class="item-header">
      <span class="item-icon">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </span>
      <span class="item-title deleted-text">Item not found</span>
      <button
        class="remove-btn"
        onclick={handleRemoveClick}
        title="Remove from shelf"
        aria-label="Remove from shelf"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
{/if}

<style>
  .shelf-item {
    border-bottom: 1px solid var(--border-light);
  }

  .shelf-item:last-child {
    border-bottom: none;
  }

  .shelf-item.archived {
    opacity: 0.6;
  }

  .shelf-item.deleted {
    opacity: 0.5;
    background: var(--bg-secondary);
  }

  /* Header row */
  .item-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 12px;
    min-height: 40px;
    position: sticky;
    top: 0;
    background: var(--bg-primary);
    z-index: 1;
  }

  .disclosure-btn {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: transform 0.15s ease;
  }

  .disclosure-btn:hover {
    color: var(--text-secondary);
    background: var(--bg-hover);
  }

  .disclosure-btn.expanded {
    transform: rotate(90deg);
  }

  .item-icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .emoji-icon {
    font-size: 16px;
    line-height: 1;
  }

  .item-title {
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    margin: 0;
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: 1rem;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border-radius: 4px;
  }

  .item-title:hover {
    background: var(--bg-hover);
    color: var(--accent-primary);
  }

  .deleted-text {
    color: var(--text-muted);
    font-style: italic;
    cursor: default;
  }

  .deleted-text:hover {
    background: none;
    color: var(--text-muted);
  }

  .remove-btn {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .item-header:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Content area */
  .item-content {
    padding: 0 12px 12px 24px; /* Extra left padding for gutter plus button */
    animation: slideDown 0.15s ease;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .empty-content {
    font-size: 0.9rem;
    color: var(--text-muted);
    font-style: italic;
    padding: 8px 10px;
  }

  /* Conversation messages preview */
  .messages-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-secondary);
    padding: 8px 10px;
    border-radius: 6px;
  }

  .message-preview {
    font-size: 0.9rem;
    line-height: 1.4;
    color: var(--text-secondary);
  }

  .message-preview.user {
    color: var(--text-primary);
  }

  .message-role {
    font-weight: 600;
    margin-right: 4px;
    color: var(--text-muted);
  }

  .message-preview.user .message-role {
    color: var(--accent-primary);
  }

  .message-text {
    word-break: break-word;
  }
</style>
