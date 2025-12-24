<script lang="ts">
  /**
   * Conversation list component for AI chat history
   * Shows recent conversations with title and date
   */
  import {
    getConversations,
    archiveConversation,
    type Conversation
  } from '../lib/automerge';

  interface Props {
    activeConversationId: string | null;
    onConversationSelect: (conversation: Conversation) => void;
    onNewConversation: () => void;
  }

  let { activeConversationId, onConversationSelect, onNewConversation }: Props = $props();

  const conversations = $derived(getConversations());

  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Today: show time
    if (diff < 86400000 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    // Yesterday
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Date used only for comparison, not reactive state
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth()
    ) {
      return 'Yesterday';
    }
    // This year: show month and day
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    // Older: show full date
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function handleArchive(event: Event, conversationId: string): void {
    event.stopPropagation();
    archiveConversation(conversationId);
  }
</script>

<div class="conversation-list">
  <div class="list-header">
    <span class="section-label">Conversations</span>
    <button class="new-btn" onclick={onNewConversation} title="New conversation">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
  </div>

  {#if conversations.length === 0}
    <div class="empty-state">
      <p>No conversations yet</p>
      <p class="empty-hint">Start a new chat to begin</p>
    </div>
  {:else}
    <div class="conversations" role="list">
      {#each conversations as conv (conv.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="conversation-item"
          class:active={activeConversationId === conv.id}
          onclick={() => onConversationSelect(conv)}
          role="listitem"
        >
          <div class="conv-icon">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
              ></path>
            </svg>
          </div>
          <div class="conv-content">
            <span class="conv-title">{conv.title}</span>
            <span class="conv-date">{formatDate(conv.updated)}</span>
          </div>
          <button
            class="archive-btn"
            onclick={(e) => handleArchive(e, conv.id)}
            title="Archive conversation"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="3 6 5 6 21 6"></polyline>
              <path
                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
              ></path>
            </svg>
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .conversation-list {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .list-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem 0.25rem;
  }

  .section-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .new-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
  }

  .new-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    color: var(--text-muted);
    text-align: center;
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
  }

  .empty-hint {
    font-size: 0.75rem;
    margin-top: 0.25rem;
  }

  .conversations {
    display: flex;
    flex-direction: column;
    padding: 0 0.75rem;
    overflow-y: auto;
    flex: 1;
  }

  .conversation-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.4rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.2s ease;
  }

  .conversation-item:hover {
    background: var(--bg-hover);
  }

  .conversation-item.active {
    background: var(--accent-light);
  }

  .conv-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .conv-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }

  .conv-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
  }

  .conv-date {
    font-size: 0.6875rem;
    color: var(--text-muted);
  }

  .archive-btn {
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .conversation-item:hover .archive-btn {
    display: flex;
  }

  .archive-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
