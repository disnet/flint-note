<script lang="ts">
  /**
   * Mobile Floating Action Button
   *
   * Context-sensitive FAB that changes its primary action based on the current view.
   * Tapping shows a popup menu with the primary action and secondary actions.
   */
  import { getActiveSystemView } from '../lib/automerge';

  interface Props {
    /** Callback to create a new note */
    onNewNote: () => void;
    /** Callback to toggle the drawer (hamburger action) */
    onToggleDrawer: () => void;
    /** Callback to go to next review card */
    onNextReviewCard?: () => void;
    /** Callback to process inbox item */
    onProcessInbox?: () => void;
    /** Whether to hide the FAB */
    hidden?: boolean;
  }

  let {
    onNewNote,
    onToggleDrawer,
    onNextReviewCard,
    onProcessInbox,
    hidden = false
  }: Props = $props();

  let isMenuOpen = $state(false);

  // Get current context for determining FAB action
  const systemView = $derived(getActiveSystemView());

  interface FABAction {
    icon: 'plus' | 'arrow-right' | 'check' | 'menu' | 'eye' | 'pin';
    label: string;
    action: () => void;
  }

  // Determine the primary action based on context
  const primaryAction = $derived.by((): FABAction => {
    // If settings view, just show menu toggle
    if (systemView === 'settings') {
      return {
        icon: 'menu',
        label: 'Menu',
        action: onToggleDrawer
      };
    }

    // Review view - next card
    if (systemView === 'review' && onNextReviewCard) {
      return {
        icon: 'arrow-right',
        label: 'Next Card',
        action: onNextReviewCard
      };
    }

    // Inbox view - process
    if (systemView === 'inbox' && onProcessInbox) {
      return {
        icon: 'check',
        label: 'Process',
        action: onProcessInbox
      };
    }

    // Default action: New Note
    return {
      icon: 'plus',
      label: 'New Note',
      action: onNewNote
    };
  });

  // Secondary actions shown in expanded menu
  const secondaryActions = $derived.by((): FABAction[] => {
    const actions: FABAction[] = [];

    // Always include menu toggle
    if (primaryAction.icon !== 'menu') {
      actions.push({
        icon: 'menu',
        label: 'Menu',
        action: onToggleDrawer
      });
    }

    // Include new note if not primary
    if (primaryAction.icon !== 'plus') {
      actions.push({
        icon: 'plus',
        label: 'New Note',
        action: onNewNote
      });
    }

    return actions;
  });

  function handlePrimaryClick(): void {
    if (isMenuOpen) {
      isMenuOpen = false;
    }
    primaryAction.action();
  }

  function handleLongPress(): void {
    if (secondaryActions.length > 0) {
      isMenuOpen = true;
    }
  }

  function handleSecondaryClick(action: FABAction): void {
    isMenuOpen = false;
    action.action();
  }

  function handleBackdropClick(): void {
    isMenuOpen = false;
  }

  // Long press detection
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let isPressing = $state(false);

  function handleTouchStart(): void {
    isPressing = true;
    pressTimer = setTimeout(() => {
      if (isPressing) {
        handleLongPress();
      }
    }, 500);
  }

  function handleTouchEnd(): void {
    isPressing = false;
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  function handleTouchCancel(): void {
    isPressing = false;
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  }

  // Icon rendering helper
  function getIconPath(icon: FABAction['icon']): string {
    switch (icon) {
      case 'plus':
        return 'M12 5v14M5 12h14';
      case 'arrow-right':
        return 'M5 12h14M12 5l7 7-7 7';
      case 'check':
        return 'M20 6L9 17l-5-5';
      case 'menu':
        return 'M3 12h18M3 6h18M3 18h18';
      case 'eye':
        return 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z';
      case 'pin':
        return 'M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48';
      default:
        return '';
    }
  }
</script>

{#if !hidden}
  <!-- Backdrop when menu is open -->
  {#if isMenuOpen}
    <button class="fab-backdrop" onclick={handleBackdropClick} aria-label="Close menu"
    ></button>
  {/if}

  <div class="mobile-fab-container" class:menu-open={isMenuOpen}>
    <!-- Secondary action buttons (shown when menu open) -->
    {#if isMenuOpen}
      <div class="secondary-actions">
        {#each secondaryActions as action, i}
          <button
            class="fab-secondary"
            style:animation-delay="{i * 50}ms"
            onclick={() => handleSecondaryClick(action)}
            aria-label={action.label}
          >
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
              <path d={getIconPath(action.icon)}></path>
            </svg>
            <span class="action-label">{action.label}</span>
          </button>
        {/each}
      </div>
    {/if}

    <!-- Primary FAB button -->
    <button
      class="fab-primary"
      class:pressed={isPressing}
      onclick={handlePrimaryClick}
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
      ontouchcancel={handleTouchCancel}
      aria-label={primaryAction.label}
      aria-expanded={isMenuOpen}
    >
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
        <path d={getIconPath(primaryAction.icon)}></path>
      </svg>
    </button>
  </div>
{/if}

<style>
  .fab-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999;
    border: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .mobile-fab-container {
    position: fixed;
    bottom: calc(24px + var(--safe-area-bottom, 0px));
    right: calc(24px + var(--safe-area-right, 0px));
    z-index: 1000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }

  .fab-primary {
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
      0 4px 12px rgba(0, 0, 0, 0.2),
      0 2px 4px rgba(0, 0, 0, 0.1);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .fab-primary:active,
  .fab-primary.pressed {
    transform: scale(0.95);
    box-shadow:
      0 2px 6px rgba(0, 0, 0, 0.15),
      0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .secondary-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .fab-secondary {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 28px;
    border: none;
    background: var(--bg-elevated);
    color: var(--text-primary);
    cursor: pointer;
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.15),
      0 1px 2px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.2s ease forwards;
    opacity: 0;
    transform: translateY(10px) scale(0.9);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .fab-secondary:active {
    transform: scale(0.95);
    background: var(--bg-hover);
  }

  @keyframes slideIn {
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .action-label {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
  }

  /* Hide on desktop - only show on mobile */
  @media (min-width: 768px) {
    .mobile-fab-container {
      display: none;
    }
    .fab-backdrop {
      display: none;
    }
  }
</style>
