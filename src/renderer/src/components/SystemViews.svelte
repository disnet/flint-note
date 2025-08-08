<script lang="ts">
  import { searchOverlayState } from '../stores/searchOverlay.svelte';

  interface Props {
    activeSystemView: 'inbox' | 'notes' | 'settings' | 'slash-commands' | null;
    onSystemViewSelect: (
      view: 'inbox' | 'notes' | 'settings' | 'slash-commands' | null
    ) => void;
  }

  let { onSystemViewSelect, activeSystemView }: Props = $props();

  function setActiveView(view: 'inbox' | 'notes' | 'settings' | 'slash-commands'): void {
    onSystemViewSelect(view);
  }

  function openSearchOverlay(): void {
    searchOverlayState.open();
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
        <polyline points="22,12 18,12 15,21 9,3 6,12 2,12"></polyline>
      </svg>
      Inbox
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
      All notes
    </button>

    <button class="nav-item" onclick={openSearchOverlay}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.35-4.35"></path>
      </svg>
      Search
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'slash-commands'}
      onclick={() => setActiveView('slash-commands')}
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
          d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l4.3 4.3c1 1 1 2.5 0 3.4L10.4 21c-1 1-2.5 1-3.4 0Z"
        ></path>
        <path d="M12 8 8 4l-8 8 4 4 12-12Z"></path>
        <path d="m7 17 5-5"></path>
      </svg>
      Slash Commands
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
        <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m12-6l-3 3 3 3m-6-6l3 3-3 3"></path>
      </svg>
      Settings
    </button>
  </div>
</div>

<style>
  .system-nav {
    display: flex;
    flex-direction: column;
    padding: 0.5rem 1.25rem;
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
</style>
