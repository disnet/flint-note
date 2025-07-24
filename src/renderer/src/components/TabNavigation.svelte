<script lang="ts">
  interface Tab {
    id: string;
    label: string;
  }

  interface Props {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
  }

  let { tabs, activeTab, onTabChange }: Props = $props();
</script>

<nav class="tab-navigation">
  {#each tabs as tab (tab.id)}
    <button
      class="tab"
      class:active={tab.id === activeTab}
      onclick={() => onTabChange(tab.id)}
    >
      {tab.label}
    </button>
  {/each}
</nav>

<style>
  .tab-navigation {
    display: flex;
    gap: 0;
  }

  .tab {
    background: none;
    border: none;
    padding: 0.75rem 1.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    border-bottom: 2px solid transparent;
    position: relative;
  }

  .tab:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tab.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
    background: var(--bg-secondary);
  }

  .tab:focus {
    outline: none;
    box-shadow: 0 0 0 2px var(--accent-primary-alpha);
  }
</style>
