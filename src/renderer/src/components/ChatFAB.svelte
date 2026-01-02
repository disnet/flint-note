<script lang="ts">
  /**
   * Floating Action Button for AI Chat
   *
   * Displays a chat bubble icon that expands into a chat panel when clicked.
   * Positioned in the bottom-right corner of the main content area.
   */

  interface Props {
    /** Whether the chat panel is currently open */
    isOpen: boolean;
    /** Toggle callback */
    onToggle: () => void;
  }

  let { isOpen, onToggle }: Props = $props();
</script>

<button
  class="chat-fab"
  class:open={isOpen}
  onclick={onToggle}
  title={isOpen ? 'Close AI Chat' : 'Open AI Chat'}
  aria-label={isOpen ? 'Close AI Chat' : 'Open AI Chat'}
>
  {#if isOpen}
    <!-- Close icon (X) -->
    <svg
      width="24"
      height="24"
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
  {:else}
    <!-- Chat bubble icon -->
    <svg
      width="24"
      height="24"
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
  {/if}
</button>

<style>
  .chat-fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--accent-primary);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      background-color 0.2s ease;
    z-index: 1000;
  }

  /* Adjust position for screenshot mode (40px frame inset) */
  :global([data-screenshot-mode]) .chat-fab {
    bottom: 64px;
    right: 64px;
  }

  .chat-fab:hover {
    transform: scale(1.05);
    box-shadow:
      0 6px 16px rgba(0, 0, 0, 0.2),
      0 3px 6px rgba(0, 0, 0, 0.15);
  }

  .chat-fab:active {
    transform: scale(0.95);
  }

  .chat-fab.open {
    background: var(--bg-tertiary, var(--bg-secondary));
    color: var(--text-primary);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .chat-fab svg {
    transition: transform 0.2s ease;
  }

  .chat-fab.open svg {
    transform: rotate(90deg);
  }
</style>
