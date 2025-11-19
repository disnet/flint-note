<script lang="ts">
  import { inboxStore } from '../stores/inboxStore.svelte';
  import { reviewStore } from '../stores/reviewStore.svelte';

  interface Props {
    activeSystemView:
      | 'inbox'
      | 'daily'
      | 'notes'
      | 'settings'
      | 'workflows'
      | 'review'
      | null;
    onSystemViewSelect: (
      view: 'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review' | null
    ) => void;
  }

  let { onSystemViewSelect, activeSystemView }: Props = $props();

  const inboxCount = $derived(inboxStore.count);
  const reviewDueCount = $derived(reviewStore.stats.dueThisSession);

  function setActiveView(
    view: 'inbox' | 'daily' | 'notes' | 'settings' | 'workflows' | 'review'
  ): void {
    onSystemViewSelect(view);
  }
</script>

<div class="system-views">
  <div class="system-nav">
    <button
      class="nav-item"
      class:active={activeSystemView === 'inbox'}
      onclick={() => setActiveView('inbox')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
        <path
          d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        ></path>
      </svg>
      Inbox
      {#if inboxCount > 0}
        <span class="count-badge">{inboxCount}</span>
      {/if}
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'daily'}
      onclick={() => setActiveView('daily')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="16" y1="2" x2="16" y2="6"></line>
        <line x1="8" y1="2" x2="8" y2="6"></line>
        <line x1="3" y1="10" x2="21" y2="10"></line>
      </svg>
      Daily
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'review'}
      onclick={() => setActiveView('review')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"
        ></path>
      </svg>
      Review
      {#if reviewDueCount > 0}
        <span class="count-badge">{reviewDueCount}</span>
      {/if}
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'workflows'}
      onclick={() => setActiveView('workflows')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path
          d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"
        ></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      Routines
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'notes'}
      onclick={() => setActiveView('notes')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14,2 14,8 20,8"></polyline>
      </svg>
      Note Types
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'settings'}
      onclick={() => setActiveView('settings')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="3"></circle>
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
        ></path>
      </svg>
      Settings
    </button>
  </div>
</div>

<style>
  .system-nav {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 0.75rem;
  }

  .nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.4rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
  }

  .nav-item.active {
    background: var(--accent-light);
  }

  .nav-item svg {
    flex-shrink: 0;
  }

  .count-badge {
    margin-left: auto;
    background: var(--accent-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 0.75rem;
    min-width: 1.25rem;
    text-align: center;
  }

  .nav-item.active .count-badge {
    background: var(--accent-primary);
    opacity: 0.9;
  }
</style>
