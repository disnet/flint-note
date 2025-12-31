<script lang="ts">
  /**
   * Actions menu popup for notes in the safe zone.
   * Shows options: Pin, Add to Shelf, Preview mode, Enable review, Archive/Unarchive, Show in Finder
   */
  interface Props {
    visible: boolean;
    x: number;
    y: number;
    isPinned: boolean;
    isOnShelf: boolean;
    isPreviewMode: boolean;
    isReviewEnabled: boolean;
    isArchived: boolean;
    showPreviewMode?: boolean;
    showShowInFinder?: boolean;
    onClose: () => void;
    onPin: () => void;
    onUnpin: () => void;
    onAddToShelf: () => void;
    onTogglePreview: () => void;
    onToggleReview: () => void;
    onArchive: () => void;
    onUnarchive: () => void;
    onShowInFinder?: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    y,
    isPinned,
    isOnShelf,
    isPreviewMode,
    isReviewEnabled,
    isArchived,
    showPreviewMode = true,
    showShowInFinder = false,
    onClose,
    onPin,
    onUnpin,
    onAddToShelf,
    onTogglePreview,
    onToggleReview,
    onArchive,
    onUnarchive,
    onShowInFinder
  }: Props = $props();

  let menuElement: HTMLDivElement | undefined = $state();

  function handlePinClick(): void {
    if (isPinned) {
      onUnpin();
    } else {
      onPin();
    }
    onClose();
  }

  function handleShelfClick(): void {
    onAddToShelf();
    onClose();
  }

  function handlePreviewClick(): void {
    onTogglePreview();
    onClose();
  }

  function handleReviewClick(): void {
    onToggleReview();
    onClose();
  }

  function handleArchiveClick(): void {
    if (isArchived) {
      onUnarchive();
    } else {
      onArchive();
    }
    onClose();
  }

  function handleShowInFinderClick(): void {
    onShowInFinder?.();
    onClose();
  }

  function handleMouseDown(e: MouseEvent): void {
    e.preventDefault();
  }

  // Close on click outside
  function handleClickOutside(e: MouseEvent): void {
    if (menuElement && !menuElement.contains(e.target as Node)) {
      onClose();
    }
  }

  // Handle keyboard
  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      onClose();
    }
  }

  $effect(() => {
    if (!visible) return;

    document.addEventListener('mousedown', handleClickOutside, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  });

  // Adjust position to stay within viewport
  $effect(() => {
    if (visible && menuElement) {
      const rect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position if needed
      if (rect.right > viewportWidth) {
        menuElement.style.left = `${viewportWidth - rect.width - 8}px`;
      }

      // Adjust vertical position if needed
      if (rect.bottom > viewportHeight) {
        menuElement.style.top = `${viewportHeight - rect.height - 8}px`;
      }
    }
  });
</script>

{#if visible}
  <div
    bind:this={menuElement}
    class="actions-menu"
    style="left: {x}px; top: {y}px;"
    role="menu"
  >
    <!-- Pin/Unpin -->
    <button
      type="button"
      class="menu-item"
      onclick={handlePinClick}
      onmousedown={handleMouseDown}
      role="menuitem"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={isPinned ? 'currentColor' : 'none'}
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 17v5"></path>
        <path
          d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        ></path>
      </svg>
      <span>{isPinned ? 'Unpin Note' : 'Pin Note'}</span>
    </button>

    <!-- Add to Shelf -->
    <button
      type="button"
      class="menu-item"
      class:disabled={isOnShelf}
      onclick={handleShelfClick}
      onmousedown={handleMouseDown}
      disabled={isOnShelf}
      role="menuitem"
    >
      <svg
        width="14"
        height="14"
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
      <span>{isOnShelf ? 'On Shelf' : 'Add to Shelf'}</span>
    </button>

    <div class="menu-divider"></div>

    {#if showPreviewMode}
      <!-- Preview Mode -->
      <button
        type="button"
        class="menu-item"
        class:active={isPreviewMode}
        onclick={handlePreviewClick}
        onmousedown={handleMouseDown}
        role="menuitem"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
        <span>Preview Mode</span>
        {#if isPreviewMode}
          <svg
            class="check-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        {/if}
      </button>
    {/if}

    <!-- Enable Review -->
    <button
      type="button"
      class="menu-item"
      class:active={isReviewEnabled}
      onclick={handleReviewClick}
      onmousedown={handleMouseDown}
      role="menuitem"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 2v4"></path>
        <path d="M12 18v4"></path>
        <path d="m4.93 4.93 2.83 2.83"></path>
        <path d="m16.24 16.24 2.83 2.83"></path>
        <path d="M2 12h4"></path>
        <path d="M18 12h4"></path>
        <path d="m4.93 19.07 2.83-2.83"></path>
        <path d="m16.24 7.76 2.83-2.83"></path>
      </svg>
      <span>{isReviewEnabled ? 'Disable Review' : 'Enable Review'}</span>
      {#if isReviewEnabled}
        <svg
          class="check-icon"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      {/if}
    </button>

    {#if showShowInFinder}
      <div class="menu-divider"></div>

      <!-- Show in Finder -->
      <button
        type="button"
        class="menu-item"
        onclick={handleShowInFinderClick}
        onmousedown={handleMouseDown}
        role="menuitem"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
          ></path>
        </svg>
        <span>Show in Finder</span>
      </button>
    {/if}

    <div class="menu-divider"></div>

    <!-- Archive/Unarchive -->
    <button
      type="button"
      class="menu-item"
      class:danger={!isArchived}
      onclick={handleArchiveClick}
      onmousedown={handleMouseDown}
      role="menuitem"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="21 8 21 21 3 21 3 8"></polyline>
        <rect x="1" y="3" width="22" height="5"></rect>
        <line x1="10" y1="12" x2="14" y2="12"></line>
      </svg>
      <span>{isArchived ? 'Unarchive Note' : 'Archive Note'}</span>
    </button>
  </div>
{/if}

<style>
  .actions-menu {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    min-width: 180px;
    padding: 0.25rem;
    pointer-events: auto;
  }

  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 0.375rem;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .menu-item:hover:not(:disabled) {
    background: var(--bg-secondary);
  }

  .menu-item:disabled,
  .menu-item.disabled {
    opacity: 0.5;
    cursor: default;
  }

  .menu-item.active {
    color: var(--accent-primary);
  }

  .menu-item.danger {
    color: var(--error, #dc2626);
  }

  .menu-item.danger:hover:not(:disabled) {
    background: var(--error-bg, rgba(220, 38, 38, 0.1));
  }

  .menu-item svg {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .menu-item.active svg {
    color: var(--accent-primary);
  }

  .menu-item.danger svg {
    color: var(--error, #dc2626);
  }

  .menu-item span {
    flex: 1;
  }

  .check-icon {
    color: var(--accent-primary);
    margin-left: auto;
  }

  .menu-divider {
    height: 1px;
    background: var(--border-light);
    margin: 0.25rem 0.5rem;
  }
</style>
