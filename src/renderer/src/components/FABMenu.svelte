<script lang="ts">
  /**
   * Floating Action Button Menu
   *
   * Displays a FAB that expands into a popup menu on hover,
   * showing options for Chat and Shelf.
   * Hidden when a panel is open.
   */
  import Tooltip from './Tooltip.svelte';

  interface Props {
    /** Whether the chat panel is currently open */
    chatOpen: boolean;
    /** Whether the shelf panel is currently open */
    shelfOpen: boolean;
    /** Toggle chat panel callback */
    onToggleChat: () => void;
    /** Toggle shelf panel callback */
    onToggleShelf: () => void;
  }

  let { chatOpen, shelfOpen, onToggleChat, onToggleShelf }: Props = $props();

  let isHovered = $state(false);
  let hoverTimeout: ReturnType<typeof setTimeout> | null = null;

  // Any panel is open
  const panelOpen = $derived(chatOpen || shelfOpen);

  // Show expanded menu only when hovered and no panel is open
  const showExpandedMenu = $derived(isHovered && !panelOpen);

  // Reset hover state when panel closes (from any source)
  let wasPanelOpen = $state(false);
  $effect(() => {
    if (wasPanelOpen && !panelOpen) {
      // Panel just closed - reset hover state
      isHovered = false;
      if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
      }
    }
    wasPanelOpen = panelOpen;
  });

  function handleMouseEnter(): void {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    isHovered = true;
  }

  function handleMouseLeave(): void {
    // Small delay before hiding to prevent flickering
    hoverTimeout = setTimeout(() => {
      isHovered = false;
    }, 150);
  }

  function handleChatClick(): void {
    onToggleChat();
  }

  function handleShelfClick(): void {
    onToggleShelf();
  }
</script>

{#if !panelOpen}
  <div
    class="fab-container"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    role="group"
    aria-label="Action menu"
  >
    <!-- Shelf button (appears above on hover) -->
    <Tooltip text="Shelf" position="left">
      <button
        class="fab-button shelf-button"
        class:visible={showExpandedMenu}
        onclick={handleShelfClick}
        aria-label="Open Shelf"
        tabindex={showExpandedMenu ? 0 : -1}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
          <path
            d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
          ></path>
        </svg>
      </button>
    </Tooltip>

    <!-- Main FAB / Chat button (always in same position) -->
    <Tooltip text="Agent" position="left">
      <button
        class="fab-main"
        class:expanded={showExpandedMenu}
        onclick={showExpandedMenu ? handleChatClick : undefined}
        aria-label={showExpandedMenu ? 'Open AI Chat' : 'Open menu'}
      >
        <!-- Chat bubble icon -->
        <svg
          width="22"
          height="22"
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
      </button>
    </Tooltip>
  </div>
{/if}

<style>
  .fab-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  /* Main FAB button - always at the bottom position */
  .fab-main {
    position: relative;
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
  }

  .fab-main:hover {
    transform: scale(1.05);
    box-shadow:
      0 6px 16px rgba(0, 0, 0, 0.2),
      0 3px 6px rgba(0, 0, 0, 0.15);
  }

  .fab-main:active {
    transform: scale(0.95);
  }

  /* When expanded, shrink to match shelf button size */
  .fab-main.expanded {
    width: 48px;
    height: 48px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .fab-main.expanded:hover {
    transform: scale(1.08);
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Shelf button - appears above main button */
  .fab-button {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: none;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.08);
    opacity: 0;
    transform: translateY(10px) scale(0.8);
    pointer-events: none;
    transition:
      transform 0.2s ease,
      opacity 0.2s ease,
      box-shadow 0.15s ease,
      background-color 0.15s ease,
      color 0.15s ease;
  }

  .fab-button.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }

  .fab-button:hover {
    transform: scale(1.08);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1);
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .fab-button:active {
    transform: scale(0.95);
  }
</style>
