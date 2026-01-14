<script lang="ts">
  /**
   * Note Shelf Panel Component
   *
   * A floating panel that displays notes and conversations added to the shelf.
   * Items can be expanded/collapsed to show their content.
   */
  import { automergeShelfStore, type ShelfItem } from '../lib/automerge';
  import ShelfItemComponent from './ShelfItem.svelte';
  import PanelModeSwitcher from './PanelModeSwitcher.svelte';

  interface Props {
    /** Whether the panel is currently open */
    isOpen: boolean;
    /** Whether the panel is expanded to a full sidebar */
    isExpanded?: boolean;
    /** Close callback */
    onClose: () => void;
    /** Toggle expand/collapse callback */
    onToggleExpand?: () => void;
    /** Navigate to item callback */
    onNavigate?: (type: 'note' | 'conversation', id: string) => void;
    /** Switch to chat panel callback (only used in expanded mode) */
    onSwitchToChat?: () => void;
  }

  let {
    isOpen,
    isExpanded = false,
    onClose,
    onToggleExpand,
    onNavigate,
    onSwitchToChat
  }: Props = $props();

  // Shelf items are reactive via Automerge - no initialization needed
  const items = $derived(automergeShelfStore.items);

  function handleToggle(item: ShelfItem): void {
    automergeShelfStore.toggleExpanded(item.type, item.id);
  }

  function handleRemove(item: ShelfItem): void {
    automergeShelfStore.removeItem(item.type, item.id);
  }

  function handleNavigate(item: ShelfItem): void {
    onNavigate?.(item.type, item.id);
  }

  function handleClearAll(): void {
    automergeShelfStore.clear();
  }
</script>

{#if isOpen}
  <div class="shelf-panel" class:visible={isOpen} class:expanded={isExpanded}>
    <div class="shelf-panel-inner">
      <!-- Header -->
      <div class="shelf-header">
        {#if onSwitchToChat}
          <PanelModeSwitcher
            activePanel="shelf"
            onSwitch={(panel) => panel === 'chat' && onSwitchToChat?.()}
          />
        {/if}
        <h3 class="header-title">Shelf</h3>
        <div class="header-actions">
          {#if items.length > 0}
            <button
              class="header-btn"
              onclick={handleClearAll}
              title="Clear all"
              aria-label="Clear all items from shelf"
            >
              <svg
                width="16"
                height="16"
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
          {/if}
          {#if onToggleExpand}
            <button
              class="header-btn"
              onclick={onToggleExpand}
              title={isExpanded ? 'Collapse to floating panel' : 'Expand to sidebar'}
              aria-label={isExpanded ? 'Collapse to floating panel' : 'Expand to sidebar'}
            >
              {#if isExpanded}
                <!-- Collapse icon (arrows pointing inward) -->
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="4 14 10 14 10 20"></polyline>
                  <polyline points="20 10 14 10 14 4"></polyline>
                  <line x1="14" y1="10" x2="21" y2="3"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              {:else}
                <!-- Expand icon (arrows pointing outward) -->
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <polyline points="9 21 3 21 3 15"></polyline>
                  <line x1="21" y1="3" x2="14" y2="10"></line>
                  <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
              {/if}
            </button>
          {/if}
          <button
            class="header-btn"
            onclick={onClose}
            title="Close"
            aria-label="Close shelf"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="shelf-content">
        {#if items.length === 0}
          <div class="empty-state">
            <div class="empty-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
                <path
                  d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
                ></path>
              </svg>
            </div>
            <h4>Shelf is empty</h4>
            <p>
              Add notes or conversations to your shelf for quick reference while working.
            </p>
            <p class="hint">
              Use the "Add to Shelf" button in the note or conversation header.
            </p>
          </div>
        {:else}
          <div class="shelf-items">
            {#each items as item (item.type + '-' + item.id)}
              <ShelfItemComponent
                itemType={item.type}
                itemId={item.id}
                isExpanded={item.isExpanded}
                onToggle={() => handleToggle(item)}
                onRemove={() => handleRemove(item)}
                onNavigate={() => handleNavigate(item)}
              />
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .shelf-panel {
    position: fixed;
    bottom: 24px; /* Covers where FAB was (FAB is hidden when panel is open) */
    right: 24px;
    width: 400px;
    max-height: 60vh;
    min-height: 200px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 4px 16px rgba(0, 0, 0, 0.08);
    z-index: 999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    transition:
      opacity 0.2s ease,
      transform 0.2s ease;
  }

  .shelf-panel.visible {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  /* Adjust position for screenshot mode (40px frame inset) - only for floating mode */
  :global([data-screenshot-mode]) .shelf-panel:not(.expanded) {
    bottom: 64px;
    right: 64px;
  }

  /* Expanded sidebar mode - flows in parent container */
  .shelf-panel.expanded {
    position: relative;
    bottom: auto;
    right: auto;
    top: auto;
    left: auto;
    width: 100%;
    max-height: none;
    min-height: 0;
    height: 100%;
    border-radius: 0;
    border: none;
    box-shadow: none;
    transform: none;
    opacity: 1;
  }

  .shelf-panel.expanded.visible {
    transform: none;
  }

  .shelf-panel-inner {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Header */
  .shelf-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  /* Make header draggable in expanded (sidebar) mode for Electron window */
  .shelf-panel.expanded .shelf-header {
    -webkit-app-region: drag;
  }

  .header-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary);
    flex: 1;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .header-btn {
    padding: 4px;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-app-region: no-drag;
  }

  .header-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Content */
  .shelf-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 24px;
    text-align: center;
    color: var(--text-secondary);
  }

  .empty-icon {
    color: var(--text-muted);
    margin-bottom: 16px;
    opacity: 0.6;
  }

  .empty-state h4 {
    margin: 0 0 8px;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .empty-state .hint {
    margin-top: 12px;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  /* Items list */
  .shelf-items {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  /* Mobile responsive */
  @media (max-width: 767px) {
    .shelf-panel:not(.expanded) {
      left: 12px;
      right: 12px;
      bottom: calc(12px + var(--safe-area-bottom, 0px));
      width: auto;
    }
  }
</style>
