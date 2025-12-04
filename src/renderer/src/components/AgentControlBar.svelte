<script lang="ts">
  import { unifiedChatStore } from '../stores/unifiedChatStore.svelte';
  import type { UnifiedThread } from '../stores/unifiedChatStore.svelte';

  interface Props {
    onShowAll?: () => void;
  }

  let { onShowAll }: Props = $props();

  let showConversationList = $state(false);
  let dropdownButton: HTMLButtonElement;
  let dropdownList = $state<HTMLDivElement>();

  const recentThreads = $derived(unifiedChatStore.sortedThreads.slice(0, 5));

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

  async function handleArchiveThread(threadId: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    await unifiedChatStore.archiveThread(threadId);
    // Close dropdown if we archived the active thread
    if (unifiedChatStore.activeThreadId === threadId) {
      showConversationList = false;
    }
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
                <div
                  class="conversation-item"
                  class:active={unifiedChatStore.activeThreadId === thread.id}
                  onclick={() => selectConversation(thread)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectConversation(thread);
                    }
                  }}
                  role="button"
                  tabindex="0"
                >
                  <div class="conversation-main">
                    <div class="conversation-title">{thread.title}</div>
                  </div>

                  <div class="conversation-actions">
                    <button
                      class="action-btn archive-btn"
                      onclick={(e) => handleArchiveThread(thread.id, e)}
                      title="Archive thread"
                    >
                      📁
                    </button>
                  </div>
                </div>
              {/each}

              <div class="separator"></div>

              <button
                class="show-all-btn"
                onclick={() => {
                  showConversationList = false;
                  onShowAll?.();
                }}
                title="Show all conversations"
              >
                Show all
              </button>
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
    padding-bottom: 0.375rem;
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.375rem 1rem;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.2s ease;
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

  .conversation-main {
    flex: 1;
    min-width: 0;
  }

  .conversation-actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: 0.5rem;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .conversation-item:hover .conversation-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 1rem;
    filter: grayscale(0.3) brightness(1.1);
  }

  .action-btn:hover {
    background: var(--bg-primary);
    border-color: var(--border-medium);
    filter: grayscale(0) brightness(1.2);
    transform: scale(1.05);
  }

  .conversation-item.active .action-btn {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
    filter: grayscale(0) brightness(1.3);
  }

  .conversation-item.active .action-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    border-color: rgba(255, 255, 255, 0.4);
    filter: grayscale(0) brightness(1.4);
  }

  .conversation-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-conversations {
    padding: 2rem 1rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  .separator {
    height: 1px;
    background: var(--border-light);
    margin: 0.5rem 0;
  }

  .show-all-btn {
    display: block;
    width: 100%;
    padding: 0.375rem 1rem;
    background: transparent;
    border: none;
    text-align: left;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .show-all-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
