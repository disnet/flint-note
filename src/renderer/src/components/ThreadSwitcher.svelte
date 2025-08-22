<script lang="ts">
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';

  interface Props {
    onNewThread?: () => void;
    onThreadSwitch?: (threadId: string) => void;
  }

  let { onNewThread, onThreadSwitch }: Props = $props();

  let isDropdownOpen = $state<boolean>(false);
  let dropdownButton: HTMLButtonElement;

  // Get thread data from store - don't destructure to preserve reactivity
  const activeThread = $derived(unifiedChatStore.activeThread);
  const sortedThreads = $derived(unifiedChatStore.getThreadsForCurrentVault());

  function handleNewThread(): void {
    unifiedChatStore.createThread();
    isDropdownOpen = false;
    onNewThread?.();
  }

  function handleThreadSelect(threadId: string): void {
    unifiedChatStore.switchToThread(threadId);
    isDropdownOpen = false;
    onThreadSwitch?.(threadId);
  }

  function toggleDropdown(): void {
    isDropdownOpen = !isDropdownOpen;
  }

  function handleKeyDown(event: KeyboardEvent, threadId?: string): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (threadId) {
        handleThreadSelect(threadId);
      } else {
        handleNewThread();
      }
    }
  }

  // Close dropdown when clicking outside
  $effect(() => {
    if (!isDropdownOpen) return;

    function handleClickOutside(event: MouseEvent): void {
      if (dropdownButton && !dropdownButton.contains(event.target as Node)) {
        isDropdownOpen = false;
      }
    }

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  });

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

  function truncateTitle(title: string, maxLength: number = 30): string {
    return title.length > maxLength ? title.slice(0, maxLength) + '...' : title;
  }
</script>

<div class="thread-switcher">
  <button
    class="thread-button"
    bind:this={dropdownButton}
    onclick={toggleDropdown}
    aria-expanded={isDropdownOpen}
    aria-haspopup="true"
    aria-label="Switch between AI conversation threads"
  >
    <div class="thread-info">
      <span class="thread-title">
        {activeThread?.title || 'New Thread'}
      </span>
      <span class="thread-meta">
        {#if activeThread}
          {activeThread.messages.length} messages • {formatDate(
            activeThread.lastActivity
          )}
        {:else}
          No messages yet
        {/if}
      </span>
    </div>
    <span class="dropdown-icon" class:open={isDropdownOpen}>▼</span>
  </button>

  {#if isDropdownOpen}
    <div class="dropdown-menu" role="menu">
      <button
        class="dropdown-item new-thread"
        onclick={handleNewThread}
        onkeydown={(e) => handleKeyDown(e)}
        role="menuitem"
      >
        <span class="item-icon">+</span>
        <span class="item-text">New Thread</span>
      </button>

      {#if sortedThreads.length > 0}
        <div class="dropdown-separator"></div>

        <div class="thread-list">
          {#each sortedThreads.slice(0, 10) as thread (thread.id)}
            <button
              class="dropdown-item thread-item"
              class:active={thread.id === activeThread?.id}
              onclick={() => handleThreadSelect(thread.id)}
              onkeydown={(e) => handleKeyDown(e, thread.id)}
              role="menuitem"
            >
              <div class="thread-item-content">
                <div class="thread-item-header">
                  <span class="thread-item-title">
                    {truncateTitle(thread.title)}
                  </span>
                  <span class="thread-item-time">
                    {formatDate(thread.lastActivity)}
                  </span>
                </div>
                <div class="thread-item-meta">
                  {thread.messages.length} messages
                  {#if thread.notesDiscussed.length > 0}
                    • {thread.notesDiscussed.length} note{thread.notesDiscussed.length ===
                    1
                      ? ''
                      : 's'}
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>

        {#if sortedThreads.length > 10}
          <div class="dropdown-item more-threads">
            <span class="item-text">+ {sortedThreads.length - 10} more threads...</span>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .thread-switcher {
    position: relative;
    width: 100%;
  }

  .thread-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .thread-button:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-primary);
  }

  .thread-button:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px var(--accent-light);
  }

  .thread-info {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex: 1;
    min-width: 0;
  }

  .thread-title {
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .thread-meta {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-top: 0.25rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .dropdown-icon {
    margin-left: 0.5rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .dropdown-icon.open {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    box-shadow: var(--shadow-medium);
    margin-top: 0.25rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    transition: background-color 0.2s ease;
    font-size: 0.875rem;
    text-align: left;
  }

  .dropdown-item:hover {
    background: var(--bg-secondary);
  }

  .dropdown-item:focus {
    outline: none;
    background: var(--bg-secondary);
  }

  .dropdown-item.active {
    background: var(--accent-light);
    color: var(--accent-primary);
  }

  .dropdown-item.new-thread {
    border-bottom: 1px solid var(--border-light);
    font-weight: 500;
  }

  .item-icon {
    margin-right: 0.75rem;
    font-weight: bold;
    color: var(--accent-primary);
  }

  .item-text {
    flex: 1;
  }

  .dropdown-separator {
    height: 1px;
    background: var(--border-light);
    margin: 0.5rem 0;
  }

  .thread-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .thread-item-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .thread-item-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.25rem;
  }

  .thread-item-title {
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 0.5rem;
  }

  .thread-item-time {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .thread-item-meta {
    font-size: 0.75rem;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .more-threads {
    font-size: 0.75rem;
    color: var(--text-secondary);
    font-style: italic;
    cursor: default;
  }

  .more-threads:hover {
    background: transparent;
  }

  /* Scrollbar styling for dropdown */
  .dropdown-menu::-webkit-scrollbar {
    width: 6px;
  }

  .dropdown-menu::-webkit-scrollbar-track {
    background: transparent;
  }

  .dropdown-menu::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .dropdown-menu::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
</style>
