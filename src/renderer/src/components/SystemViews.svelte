<script lang="ts">
  interface Props {
    onSystemViewSelect: (view: 'inbox' | 'notes' | 'search' | 'settings' | null) => void;
  }

  let { onSystemViewSelect }: Props = $props();

  function setActiveView(view: 'inbox' | 'notes' | 'search' | 'settings'): void {
    onSystemViewSelect(view);
  }
</script>

<div class="system-views">
  <div class="system-nav">
    <button class="nav-item" onclick={() => setActiveView('inbox')}>
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

    <button class="nav-item" onclick={() => setActiveView('notes')}>
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

    <button class="nav-item" onclick={() => setActiveView('search')}>
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

    <button class="nav-item" onclick={() => setActiveView('settings')}>
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
  .system-views {
    border-bottom: 1px solid var(--border-light);
  }

  .system-nav {
    padding: 0.5rem 0;
  }

  .nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.25rem;
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

  .nav-item svg {
    flex-shrink: 0;
  }
</style>
