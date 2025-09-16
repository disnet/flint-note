<script lang="ts">
  interface Props {
    activeSystemView:
      | 'daily'
      | 'notes'
      | 'settings'
      | 'slash-commands'
      | 'custom-functions'
      | null;
    onSystemViewSelect: (
      view: 'daily' | 'notes' | 'settings' | 'slash-commands' | 'custom-functions' | null
    ) => void;
  }

  let { onSystemViewSelect, activeSystemView }: Props = $props();

  function setActiveView(
    view: 'daily' | 'notes' | 'settings' | 'slash-commands' | 'custom-functions'
  ): void {
    onSystemViewSelect(view);
  }
</script>

<div class="system-views">
  <div class="system-nav">
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
        <path d="M10 3l-7 7 7 7"></path>
        <path d="M21 3l-7 7 7 7"></path>
      </svg>
      Slash Commands
    </button>

    <button
      class="nav-item"
      class:active={activeSystemView === 'custom-functions'}
      onclick={() => setActiveView('custom-functions')}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M14.5 4H20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-5.5"></path>
        <polyline points="14.5,1 14.5,8 21,8"></polyline>
        <path d="M10,21H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h6l4,4v7"></path>
        <line x1="7" y1="10" x2="8" y2="10"></line>
        <line x1="7" y1="14" x2="10" y2="14"></line>
      </svg>
      Custom Functions
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
</style>
