<script lang="ts">
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import type { UnifiedThread } from '../stores/unifiedChatStore.svelte';

  let showConversationList = $state(false);
  let dropdownButton: HTMLButtonElement;
  let dropdownList = $state<HTMLDivElement>();

  const recentThreads = $derived(unifiedChatStore.sortedThreads.slice(0, 10));

  async function createNewThread(): Promise<void> {
    // Create a new thread without archiving the current one
    await unifiedChatStore.createThread();
  }

  function toggleConversationList(): void {
    showConversationList = !showConversationList;
  }

  function selectConversation(thread: UnifiedThread): void {
    unifiedChatStore.switchToThread(thread.id);
    showConversationList = false;
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

  // Close conversation list when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as Element;
    if (!target.closest('.conversation-dropdown')) {
      showConversationList = false;
    }
  }

  // Position the dropdown dynamically
  $effect(() => {
    if (showConversationList && dropdownButton && dropdownList) {
      const buttonRect = dropdownButton.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      // Calculate position
      let top = buttonRect.bottom + 8; // 8px gap
      let left = buttonRect.right - 320; // Align right edge of dropdown with right edge of button

      // Adjust if dropdown would go off-screen horizontally
      if (left < 8) {
        left = 8; // Leave 8px margin from left edge
      } else if (left + 320 > viewportWidth - 8) {
        left = viewportWidth - 320 - 8; // Leave 8px margin from right edge
      }

      // Adjust if dropdown would go off-screen vertically
      if (top + 400 > viewportHeight - 8) {
        top = buttonRect.top - 400 - 8; // Show above button instead
        if (top < 8) {
          top = 8; // If still doesn't fit, position at top with margin
        }
      }

      dropdownList.style.top = `${top}px`;
      dropdownList.style.left = `${left}px`;
    }
  });

  $effect(() => {
    if (showConversationList) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
    return undefined;
  });
</script>

<div class="control-bar">
  <div class="control-buttons">
    <div class="conversation-dropdown">
      <button
        bind:this={dropdownButton}
        class="control-btn"
        onclick={toggleConversationList}
        title="Switch to recent conversation"
        aria-label="Show recent conversations"
        aria-expanded={showConversationList}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="M13 8l-2 2-2-2" />
        </svg>
        History
        <svg
          class="dropdown-arrow"
          class:rotated={showConversationList}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {#if showConversationList}
        <div bind:this={dropdownList} class="conversation-list">
          <div class="conversation-list-header">
            <h4>Recent Conversations</h4>
          </div>
          <div class="conversation-items">
            {#if recentThreads.length > 0}
              {#each recentThreads as thread (thread.id)}
                <button
                  class="conversation-item"
                  class:active={unifiedChatStore.activeThreadId === thread.id}
                  onclick={() => selectConversation(thread)}
                >
                  <div class="conversation-title">{thread.title}</div>
                  <div class="conversation-meta">
                    <span class="conversation-time"
                      >{formatTimestamp(thread.lastActivity)}</span
                    >
                    {#if thread.messages.length > 0}
                      <span class="conversation-count"
                        >{thread.messages.length} messages</span
                      >
                    {/if}
                  </div>
                </button>
              {/each}
            {:else}
              <div class="no-conversations">No recent conversations</div>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <button
      class="control-btn"
      onclick={createNewThread}
      title="Start new conversation"
      aria-label="New conversation"
    >
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
</div>

<style>
  .control-bar {
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
    flex-shrink: 0;
  }

  .control-buttons {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .control-btn {
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

  .control-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border-color: var(--border-medium);
  }

  .control-btn svg {
    flex-shrink: 0;
  }

  .conversation-dropdown {
    position: relative;
  }

  .dropdown-arrow {
    margin-left: 0.25rem;
    transition: transform 0.2s ease;
  }

  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }

  .conversation-list {
    position: fixed;
    width: 320px;
    max-height: 400px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    z-index: 9999;
    overflow: hidden;
    /* Position will be set dynamically via JavaScript */
  }

  .conversation-list-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .conversation-list-header h4 {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .conversation-items {
    max-height: 320px;
    overflow-y: auto;
  }

  .conversation-items::-webkit-scrollbar {
    width: 6px;
  }

  .conversation-items::-webkit-scrollbar-track {
    background: transparent;
  }

  .conversation-items::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .conversation-items::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .conversation-item {
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .conversation-item:last-child {
    border-bottom: none;
  }

  .conversation-item:hover {
    background: var(--bg-tertiary);
  }

  .conversation-item.active {
    background: var(--accent-primary);
    color: var(--bg-primary);
  }

  .conversation-item.active .conversation-title {
    color: var(--bg-primary);
  }

  .conversation-item.active .conversation-meta {
    color: rgba(255, 255, 255, 0.8);
  }

  .conversation-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-tertiary);
  }

  .conversation-time {
    font-weight: 500;
  }

  .conversation-count {
    opacity: 0.8;
  }

  .no-conversations {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.875rem;
  }
</style>
