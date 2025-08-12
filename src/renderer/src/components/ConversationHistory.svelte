<script lang="ts">
  import { conversationStore } from '../stores/conversationStore.svelte';
  import type { Conversation } from '../stores/conversationStore.svelte';

  interface Props {
    onConversationSelect: (conversationId: string) => void;
    onNewConversation: () => void;
  }

  let { onConversationSelect, onNewConversation }: Props = $props();

  function selectConversation(conversationId: string): void {
    onConversationSelect(conversationId);
  }

  function startNewConversation(): void {
    onNewConversation();
  }

  function deleteConversation(event: Event, conversationId: string): void {
    event.stopPropagation();
    if (confirm('Delete this conversation? This action cannot be undone.')) {
      conversationStore.deleteConversation(conversationId);
    }
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  }

  function getMessageCount(conversation: Conversation): number {
    return conversation.messages.length;
  }

  function getLastMessagePreview(conversation: Conversation): string {
    if (conversation.messages.length === 0) return 'No messages';

    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const preview = lastMessage.text.slice(0, 100).trim();
    return preview + (lastMessage.text.length > 100 ? '...' : '');
  }
</script>

<div class="conversation-history">
  <div class="header">
    <h3 class="title">Conversations</h3>
    <button
      class="new-conversation-btn"
      onclick={startNewConversation}
      title="Start new conversation"
      aria-label="Start new conversation"
    >
      <svg
        width="16"
        height="16"
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

  <div class="conversation-list">
    {#if conversationStore.conversations.length === 0}
      <div class="empty-state">
        <p class="empty-message">No conversations yet</p>
        <p class="empty-hint">Start a new conversation to get started</p>
      </div>
    {:else}
      {#each conversationStore.conversations as conversation (conversation.id)}
        <div
          class="conversation-item"
          class:active={conversation.id === conversationStore.activeConversationId}
          onclick={() => selectConversation(conversation.id)}
          onkeydown={(e) => e.key === 'Enter' && selectConversation(conversation.id)}
          role="button"
          tabindex="0"
        >
          <div class="conversation-main">
            <div class="conversation-header">
              <h4 class="conversation-title">{conversation.title}</h4>
              <button
                class="delete-btn"
                onclick={(e) => deleteConversation(e, conversation.id)}
                title="Delete conversation"
                aria-label="Delete conversation"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="3,6 5,6 21,6"></polyline>
                  <path
                    d="m6,6 1,14c0,1.1.9,2 2,2h6c1.1,0 2-.9 2-2l1-14M15,6V4c0-1.1-.9-2-2-2h-2c-1.1,0-2 .9-2 2v2"
                  ></path>
                </svg>
              </button>
            </div>
            <p class="conversation-preview">{getLastMessagePreview(conversation)}</p>
            <div class="conversation-meta">
              <span class="message-count">{getMessageCount(conversation)} messages</span>
              <span class="conversation-date">{formatDate(conversation.updatedAt)}</span>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .conversation-history {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .new-conversation-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 0.375rem;
    background: var(--accent-primary);
    color: white;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .new-conversation-btn:hover {
    background: var(--accent-hover);
    transform: scale(1.05);
  }

  .conversation-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .conversation-list::-webkit-scrollbar {
    width: 6px;
  }

  .conversation-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .conversation-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .conversation-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  .empty-state {
    padding: 2rem 1rem;
    text-align: center;
  }

  .empty-message {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .empty-hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .conversation-item {
    display: block;
    width: 100%;
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    position: relative;
  }

  .conversation-item:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent-light);
  }

  .conversation-item.active {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    box-shadow: 0 2px 4px var(--shadow-light);
  }

  .conversation-main {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .conversation-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .conversation-title {
    margin: 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.2;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.2s ease;
    opacity: 0;
    flex-shrink: 0;
  }

  .conversation-item:hover .delete-btn {
    opacity: 1;
  }

  .delete-btn:hover {
    background: var(--message-agent-bg);
    color: var(--accent-primary);
    transform: scale(1.1);
  }

  .conversation-preview {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .conversation-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.6875rem;
    color: var(--text-muted);
  }

  .message-count {
    font-weight: 500;
  }

  .conversation-date {
    font-style: italic;
  }

  /* Keyboard navigation */
  .conversation-item:focus {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }
</style>
