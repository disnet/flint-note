<script lang="ts">
  /**
   * Mobile Floating Action Bar
   *
   * Horizontal bar at the bottom of the screen with always-visible icon buttons:
   * Search, New Note, Agent, and Shelf.
   */

  interface Props {
    onSearch: () => void;
    onNewNote: () => void;
    onOpenChat: () => void;
    onOpenShelf: () => void;
    hidden?: boolean;
  }

  let { onSearch, onNewNote, onOpenChat, onOpenShelf, hidden = false }: Props = $props();

  let keyboardVisible = $state(false);

  if (typeof window !== 'undefined' && 'visualViewport' in window) {
    const vv = window.visualViewport!;
    const checkKeyboard = () => {
      // If visual viewport is significantly shorter than the window, keyboard is up
      keyboardVisible = window.innerHeight - vv.height > 100;
    };
    $effect(() => {
      vv.addEventListener('resize', checkKeyboard);
      return () => vv.removeEventListener('resize', checkKeyboard);
    });
  }
</script>

{#if !hidden && !keyboardVisible}
  <div class="mobile-action-bar">
    <button class="action-btn" onclick={onSearch} aria-label="Search">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <circle cx="11" cy="11" r="8"></circle>
        <path d="M21 21l-4.35-4.35"></path>
      </svg>
    </button>

    <button class="action-btn" onclick={onNewNote} aria-label="New Note">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M12 5v14M5 12h14"></path>
      </svg>
    </button>

    <button class="action-btn" onclick={onOpenChat} aria-label="Agent">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"></path>
      </svg>
    </button>

    <button class="action-btn" onclick={onOpenShelf} aria-label="Shelf">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path
          d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2zM3 10h18M3 15h18"
        ></path>
      </svg>
    </button>
  </div>
{/if}

<style>
  .mobile-action-bar {
    position: fixed;
    bottom: calc(16px + var(--safe-area-bottom, 0px));
    left: 50%;
    transform: translateX(-50%);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 0px;
    padding: 2px 6px;
    border-radius: 22px;
    background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  .action-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition:
      color 0.15s ease,
      background 0.15s ease;
  }

  .action-btn:active {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  @media (hover: hover) {
    .action-btn:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
  }

  @media (hover: none) {
    .action-btn:active {
      background: var(--bg-hover);
    }
  }

  /* Hide on desktop */
  @media (min-width: 768px) {
    .mobile-action-bar {
      display: none;
    }
  }
</style>
