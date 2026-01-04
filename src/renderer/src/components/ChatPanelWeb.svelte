<script lang="ts">
  import { isWeb } from '../lib/platform.svelte';
  import ChatPanel from './ChatPanel.svelte';
  import ComingSoon from './ComingSoon.svelte';

  interface Props {
    isOpen: boolean;
    isExpanded?: boolean;
    onClose: () => void;
    onToggleExpand?: () => void;
    onGoToSettings: () => void;
    initialMessage?: string;
    onInitialMessageConsumed?: () => void;
    onSwitchToShelf?: () => void;
  }

  let {
    isOpen,
    isExpanded = false,
    onClose,
    onToggleExpand,
    onGoToSettings,
    initialMessage,
    onInitialMessageConsumed,
    onSwitchToShelf
  }: Props = $props();
</script>

{#if isWeb()}
  {#if isOpen}
    <div class="chat-panel-web" class:expanded={isExpanded}>
      <div class="panel-header">
        <h3>AI Agent</h3>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      <ComingSoon
        title="AI Agent"
        description="Chat with an AI that understands your notes and helps you find connections."
        icon="chat"
      />
    </div>
  {/if}
{:else}
  <ChatPanel
    {isOpen}
    {isExpanded}
    {onClose}
    {onToggleExpand}
    {onGoToSettings}
    {initialMessage}
    {onInitialMessageConsumed}
    {onSwitchToShelf}
  />
{/if}

<style>
  .chat-panel-web {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 400px;
    height: 500px;
    background: var(--bg-primary);
    border-radius: 0.75rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    z-index: 1001;
    overflow: hidden;
  }

  .chat-panel-web.expanded {
    position: relative;
    bottom: auto;
    right: auto;
    width: 100%;
    height: 100%;
    border-radius: 0;
    box-shadow: none;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .panel-header h3 {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    padding: 0.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Mobile responsive */
  @media (max-width: 767px) {
    .chat-panel-web {
      left: 12px;
      right: 12px;
      bottom: calc(12px + var(--safe-area-bottom, 0px));
      width: auto;
      height: calc(100vh - 100px);
      max-height: 500px;
    }
  }
</style>
