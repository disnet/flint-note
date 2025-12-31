<script lang="ts">
  /**
   * System navigation views for the Automerge sidebar
   * Includes Notes, Daily, Inbox, Review, Routines, Note Types, and Settings
   */
  import {
    getReviewStats,
    isSessionAvailable,
    getUnprocessedCount,
    getRoutinesDueNow
  } from '../lib/automerge';

  interface Props {
    activeSystemView:
      | 'settings'
      | 'search'
      | 'types'
      | 'daily'
      | 'review'
      | 'inbox'
      | 'routines'
      | null;
    onSystemViewSelect: (
      view: 'settings' | 'types' | 'daily' | 'review' | 'inbox' | 'routines' | null
    ) => void;
  }

  let { onSystemViewSelect, activeSystemView }: Props = $props();

  // Get review stats for badge
  const reviewStats = $derived(getReviewStats());
  const sessionAvailable = $derived(isSessionAvailable());
  const reviewDueCount = $derived(sessionAvailable ? reviewStats.dueThisSession : 0);

  // Get inbox unprocessed count for badge
  const inboxCount = $derived(getUnprocessedCount());

  // Get routines due count for badge
  const routinesDueCount = $derived(getRoutinesDueNow().length);

  function setActiveView(
    view: 'settings' | 'types' | 'daily' | 'review' | 'inbox' | 'routines'
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
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline>
        <path
          d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
        ></path>
      </svg>
      Inbox
      {#if inboxCount > 0}
        <span class="badge">{inboxCount}</span>
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
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
      </svg>
      Review
      {#if reviewDueCount > 0}
        <span class="badge">{reviewDueCount}</span>
      {/if}
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'routines'}
      onclick={() => setActiveView('routines')}
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
        />
      </svg>
      Routines
      {#if routinesDueCount > 0}
        <span class="badge">{routinesDueCount}</span>
      {/if}
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'types'}
      onclick={() => setActiveView('types')}
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
          d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
        ></path>
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

  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .nav-item.active {
    background: var(--accent-light);
    color: var(--text-primary);
  }

  .nav-item svg {
    flex-shrink: 0;
  }

  .badge {
    margin-left: auto;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    background: var(--accent-primary);
    color: var(--bg-primary);
    border-radius: 10px;
    min-width: 1.25rem;
    text-align: center;
  }
</style>
