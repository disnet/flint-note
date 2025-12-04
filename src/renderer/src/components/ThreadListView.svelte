<script lang="ts">
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import type { UnifiedThread } from '../stores/unifiedChatStore.svelte';

  interface Props {
    onBack: () => void;
    onNewThread: () => void;
    onSelectThread: (threadId: string) => void;
  }

  let { onBack, onNewThread, onSelectThread }: Props = $props();

  let searchQuery = $state('');

  const allThreads = $derived(unifiedChatStore.sortedThreads);

  const filteredThreads = $derived(
    searchQuery.trim() === ''
      ? allThreads
      : allThreads.filter((thread) => {
          const query = searchQuery.toLowerCase();
          // Search in title
          if (thread.title.toLowerCase().includes(query)) {
            return true;
          }
          // Search in message content
          return thread.messages.some((message) =>
            message.text.toLowerCase().includes(query)
          );
        })
  );

  function getLastMessageTime(thread: UnifiedThread): Date {
    if (thread.messages.length === 0) {
      return thread.lastActivity;
    }
    return thread.messages[thread.messages.length - 1].timestamp;
  }

  function formatTimestamp(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;

    return date.toLocaleDateString();
  }

  function selectThread(thread: UnifiedThread): void {
    onSelectThread(thread.id);
  }

  async function handleArchiveThread(threadId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    await unifiedChatStore.archiveThread(threadId);
  }
</script>

<div class="thread-list-view">
  <div class="thread-list-header">
    <button
      class="back-btn"
      onclick={onBack}
      title="Go back"
      aria-label="Go back to conversation"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>

    <input
      type="text"
      class="search-input"
      placeholder="Search conversations..."
      bind:value={searchQuery}
    />

    <button class="new-btn" onclick={onNewThread} title="New conversation">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      New
    </button>
  </div>

  <div class="thread-list-separator"></div>

  <div class="thread-list-items">
    {#if filteredThreads.length > 0}
      {#each filteredThreads as thread (thread.id)}
        <div
          class="thread-item"
          class:active={unifiedChatStore.activeThreadId === thread.id}
          onclick={() => selectThread(thread)}
          onkeydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectThread(thread);
            }
          }}
          role="button"
          tabindex="0"
        >
          <div class="thread-content">
            <div class="thread-title">{thread.title}</div>
            <div class="thread-date">{formatTimestamp(getLastMessageTime(thread))}</div>
          </div>

          <button
            class="thread-archive-btn"
            onclick={(e) => handleArchiveThread(thread.id, e)}
            title="Archive thread"
          >
            📁
          </button>
        </div>
      {/each}
    {:else}
      <div class="no-threads">
        {searchQuery.trim() === '' ? 'No conversations yet' : 'No matching conversations'}
      </div>
    {/if}
  </div>
</div>

<style>
  .thread-list-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  .thread-list-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .back-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--border-medium);
  }

  .search-input {
    flex: 1;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
    outline: none;
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .search-input:focus {
    border-color: var(--accent-primary);
    background: var(--bg-primary);
  }

  .new-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .new-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--border-medium);
  }

  .thread-list-separator {
    height: 1px;
    background: var(--border-light);
    flex-shrink: 0;
  }

  .thread-list-items {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
  }

  .thread-list-items::-webkit-scrollbar {
    width: 6px;
  }

  .thread-list-items::-webkit-scrollbar-track {
    background: transparent;
  }

  .thread-list-items::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .thread-list-items::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .thread-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .thread-item:hover {
    background: var(--bg-tertiary);
  }

  .thread-item.active {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .thread-item.active .thread-title {
    color: var(--bg-primary);
  }

  .thread-item.active .thread-date {
    color: rgba(255, 255, 255, 0.8);
  }

  .thread-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
    min-width: 0;
  }

  .thread-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .thread-date {
    font-size: 0.75rem;
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .thread-archive-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    margin-left: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1rem;
    filter: grayscale(0.3) brightness(1.1);
  }

  .thread-archive-btn:hover {
    background: var(--bg-primary);
    border-color: var(--border-medium);
    filter: grayscale(0) brightness(1.2);
    transform: scale(1.05);
  }

  .thread-item.active .thread-archive-btn {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
    filter: grayscale(0) brightness(1.3);
  }

  .thread-item.active .thread-archive-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.4);
    filter: grayscale(0) brightness(1.4);
  }

  .no-threads {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
