<script lang="ts">
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import type { UnifiedThread } from '../stores/unifiedChatStore.svelte';

  interface Props {
    onThreadSelect?: (threadId: string) => void;
    onThreadDelete?: (threadId: string) => void;
  }

  let { onThreadSelect, onThreadDelete }: Props = $props();

  let searchQuery = $state<string>('');
  let selectedThreadId = $state<string | null>(null);
  let showDeleteConfirm = $state<string | null>(null);
  let showArchived = $state<boolean>(false);
  let editingTags = $state<string | null>(null);
  let tagInput = $state<string>('');

  // Get thread data from store
  const activeThread = $derived(unifiedChatStore.activeThread);
  const allThreads = $derived(unifiedChatStore.getThreadsForCurrentVault());
  const archivedThreads = $derived(allThreads.filter((t) => t.isArchived));
  const sortedThreads = $derived(
    allThreads
      .filter((t) => !t.isArchived)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
  );

  // Filtered threads based on search and archive status
  const filteredThreads = $derived.by<UnifiedThread[]>(() => {
    const threads = showArchived ? archivedThreads : sortedThreads;

    if (!searchQuery.trim()) {
      return threads;
    }

    return unifiedChatStore.searchThreadsInVault(searchQuery.trim());
  });

  function handleThreadSelect(threadId: string): void {
    unifiedChatStore.switchToThread(threadId);
    selectedThreadId = threadId;
    onThreadSelect?.(threadId);
  }

  async function handleNewThread(): Promise<void> {
    const newThreadId = await unifiedChatStore.createThread();
    selectedThreadId = newThreadId;
    onThreadSelect?.(newThreadId);
  }

  function handleArchiveThread(threadId: string, event: Event): void {
    event.stopPropagation();
    if (showArchived) {
      unifiedChatStore.unarchiveThread(threadId);
    } else {
      unifiedChatStore.archiveThread(threadId);
    }
  }

  function handleDeleteThread(threadId: string, event: Event): void {
    event.stopPropagation();
    if (showDeleteConfirm === threadId) {
      unifiedChatStore.deleteThread(threadId);
      showDeleteConfirm = null;
      onThreadDelete?.(threadId);
    } else {
      showDeleteConfirm = threadId;
      // Auto-hide confirmation after 3 seconds
      setTimeout(() => {
        if (showDeleteConfirm === threadId) {
          showDeleteConfirm = null;
        }
      }, 3000);
    }
  }

  function cancelDelete(event: Event): void {
    event.stopPropagation();
    showDeleteConfirm = null;
  }

  function handleTagEdit(threadId: string, event: Event): void {
    event.stopPropagation();
    const thread = allThreads.find((t) => t.id === threadId);
    if (thread) {
      editingTags = threadId;
      tagInput = (thread.tags || []).join(', ');
    }
  }

  function saveTagsForThread(threadId: string): void {
    const tags = tagInput
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    unifiedChatStore.updateThread(threadId, { tags });
    editingTags = null;
    tagInput = '';
  }

  function cancelTagEdit(): void {
    editingTags = null;
    tagInput = '';
  }

  function handleTagKeydown(event: KeyboardEvent, threadId: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      saveTagsForThread(threadId);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelTagEdit();
    }
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffHours < 1) {
      return 'Just now';
    } else if (diffHours < 24) {
      return `${Math.floor(diffHours)}h ago`;
    } else if (diffDays < 7) {
      return `${Math.floor(diffDays)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  function truncateTitle(title: string, maxLength: number = 40): string {
    return title.length > maxLength ? title.slice(0, maxLength) + '...' : title;
  }

  function getFirstUserMessage(thread: UnifiedThread): string {
    const firstUserMsg = thread.messages.find((msg) => msg.sender === 'user');
    if (!firstUserMsg) return 'No messages yet';

    const preview = firstUserMsg.text.slice(0, 100);
    return preview.length === 100 ? preview + '...' : preview;
  }
</script>

<div class="thread-list">
  <!-- Header -->
  <div class="thread-list-header">
    <div class="header-top">
      <h3 class="list-title">
        {showArchived ? 'Archived Threads' : 'Conversation Threads'}
      </h3>
      <div class="header-actions">
        <button
          class="archive-toggle-btn"
          class:active={showArchived}
          onclick={() => (showArchived = !showArchived)}
          title={showArchived ? 'Show active threads' : 'Show archived threads'}
        >
          {showArchived ? '📤' : '📁'}
        </button>
        {#if !showArchived}
          <button
            class="new-thread-btn"
            onclick={handleNewThread}
            title="Start new conversation"
          >
            <span class="btn-icon">+</span>
            New
          </button>
        {/if}
      </div>
    </div>

    <!-- Search -->
    <div class="search-container">
      <input
        type="text"
        placeholder="Search threads..."
        bind:value={searchQuery}
        class="search-input"
      />
      <span class="search-icon">🔍</span>
    </div>
  </div>

  <!-- Thread List -->
  <div class="thread-items">
    {#if filteredThreads.length === 0}
      <div class="empty-state">
        {#if searchQuery.trim()}
          <p>No threads found matching "{searchQuery}"</p>
        {:else if showArchived}
          <p>No archived threads</p>
        {:else}
          <p>No conversation threads yet</p>
          <button class="start-thread-btn" onclick={handleNewThread}>
            Start your first conversation
          </button>
        {/if}
      </div>
    {:else}
      {#each filteredThreads as thread (thread.id)}
        <div
          class="thread-item"
          class:active={thread.id === activeThread?.id}
          class:selected={thread.id === selectedThreadId}
          onclick={() => handleThreadSelect(thread.id)}
          role="button"
          tabindex="0"
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleThreadSelect(thread.id);
            }
          }}
        >
          <div class="thread-main">
            <div class="thread-header">
              <h4 class="thread-title">
                {truncateTitle(thread.title)}
              </h4>
              <span class="thread-time">
                {formatDate(thread.lastActivity)}
              </span>
            </div>

            <p class="thread-preview">
              {getFirstUserMessage(thread)}
            </p>

            <div class="thread-meta">
              <span class="message-count">
                {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
              </span>
              {#if thread.notesDiscussed.length > 0}
                <span class="notes-count">
                  • {thread.notesDiscussed.length} note{thread.notesDiscussed.length === 1
                    ? ''
                    : 's'}
                </span>
              {/if}
              {#if thread.costInfo?.totalCost > 0}
                <span class="cost-info" title="Total conversation cost">
                  • ${(thread.costInfo.totalCost / 100).toFixed(3)}
                </span>
              {/if}
              {#if thread.isArchived}
                <span class="archived-badge">Archived</span>
              {/if}
            </div>

            <!-- Tags section -->
            {#if editingTags === thread.id}
              <div class="tag-edit-section">
                <input
                  type="text"
                  placeholder="Add tags (comma separated)"
                  bind:value={tagInput}
                  class="tag-input"
                  onkeydown={(e) => handleTagKeydown(e, thread.id)}
                  onclick={(e) => e.stopPropagation()}
                />
                <div class="tag-edit-actions">
                  <button
                    class="tag-save-btn"
                    onclick={(e) => {
                      e.stopPropagation();
                      saveTagsForThread(thread.id);
                    }}
                  >
                    ✓
                  </button>
                  <button
                    class="tag-cancel-btn"
                    onclick={(e) => {
                      e.stopPropagation();
                      cancelTagEdit();
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            {:else if thread.tags && thread.tags.length > 0}
              <div class="thread-tags">
                {#each thread.tags as tag (tag)}
                  <span class="tag">{tag}</span>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Thread Actions -->
          <div class="thread-actions">
            {#if showDeleteConfirm === thread.id}
              <div class="delete-confirm">
                <button
                  class="confirm-btn delete-btn"
                  onclick={(e) => handleDeleteThread(thread.id, e)}
                  title="Confirm delete"
                >
                  ✓
                </button>
                <button
                  class="confirm-btn cancel-btn"
                  onclick={cancelDelete}
                  title="Cancel delete"
                >
                  ✕
                </button>
              </div>
            {:else}
              <button
                class="action-btn tag-btn"
                onclick={(e) => handleTagEdit(thread.id, e)}
                title="Edit tags"
              >
                🏷️
              </button>
              <button
                class="action-btn archive-btn"
                onclick={(e) => handleArchiveThread(thread.id, e)}
                title={showArchived ? 'Unarchive thread' : 'Archive thread'}
              >
                {showArchived ? '📤' : '📁'}
              </button>
              <button
                class="action-btn delete-btn"
                onclick={(e) => handleDeleteThread(thread.id, e)}
                title="Delete thread"
              >
                🗑️
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .thread-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  .thread-list-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .list-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .new-thread-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .new-thread-btn:hover {
    background: var(--accent-hover);
  }

  .archive-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.375rem;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .archive-toggle-btn:hover {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .archive-toggle-btn.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .btn-icon {
    font-weight: bold;
    font-size: 1rem;
  }

  .search-container {
    position: relative;
  }

  .search-input {
    width: 100%;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: border-color 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .search-input::placeholder {
    color: var(--text-placeholder);
  }

  .search-icon {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-secondary);
    pointer-events: none;
  }

  .thread-items {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .thread-item {
    display: flex;
    align-items: flex-start;
    padding: 1rem;
    margin-bottom: 0.5rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
  }

  .thread-item:hover {
    background: var(--bg-secondary);
    border-color: var(--accent-primary);
  }

  .thread-item.active {
    background: var(--accent-light);
    border-color: var(--accent-primary);
  }

  .thread-item.selected {
    background: var(--bg-tertiary);
  }

  .thread-main {
    flex: 1;
    min-width: 0;
  }

  .thread-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
  }

  .thread-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 0.5rem;
  }

  .thread-time {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .thread-preview {
    margin: 0 0 0.5rem 0;
    font-size: 0.825rem;
    color: var(--text-secondary);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .thread-meta {
    display: flex;
    align-items: center;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .message-count,
  .notes-count,
  .cost-info {
    margin-right: 0.5rem;
  }

  .cost-info {
    color: var(--accent-primary);
    font-weight: 500;
  }

  .archived-badge {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.7rem;
    margin-left: 0.5rem;
  }

  .thread-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: 1rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .thread-item:hover .thread-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .action-btn:hover {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .delete-confirm {
    display: flex;
    gap: 0.25rem;
  }

  .confirm-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: bold;
    transition: all 0.2s ease;
  }

  .confirm-btn.delete-btn {
    background: #ef4444;
    color: white;
  }

  .confirm-btn.delete-btn:hover {
    background: #dc2626;
  }

  .confirm-btn.cancel-btn {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .confirm-btn.cancel-btn:hover {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .empty-state {
    text-align: center;
    padding: 2rem 1rem;
    color: var(--text-secondary);
  }

  .empty-state p {
    margin: 0 0 1rem 0;
    font-size: 0.875rem;
  }

  .start-thread-btn {
    padding: 0.75rem 1.5rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .start-thread-btn:hover {
    background: var(--accent-hover);
  }

  /* Tag-related styles */
  .tag-edit-section {
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tag-input {
    flex: 1;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.75rem;
  }

  .tag-input:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  .tag-edit-actions {
    display: flex;
    gap: 0.25rem;
  }

  .tag-save-btn,
  .tag-cancel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .tag-save-btn {
    background: var(--accent-primary);
    color: white;
  }

  .tag-save-btn:hover {
    background: var(--accent-hover);
  }

  .tag-cancel-btn {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .tag-cancel-btn:hover {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .thread-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.5rem;
  }

  .tag {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--accent-light);
    color: var(--accent-primary);
    border-radius: 0.25rem;
    font-size: 0.7rem;
    font-weight: 500;
  }

  /* Scrollbar styling */
  .thread-items::-webkit-scrollbar {
    width: 8px;
  }

  .thread-items::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
  }

  .thread-items::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  }

  .thread-items::-webkit-scrollbar-thumb:hover {
    background: rgba(0, 0, 0, 0.5);
  }
</style>
