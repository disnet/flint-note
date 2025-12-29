<script lang="ts">
  /**
   * Panel Mode Switcher Component
   *
   * A dropdown button that allows switching between Chat and Shelf panels.
   * Used in both ChatPanel and ShelfPanel headers.
   */

  interface Props {
    /** The currently active panel */
    activePanel: 'chat' | 'shelf';
    /** Callback when switching to a different panel */
    onSwitch: (panel: 'chat' | 'shelf') => void;
  }

  let { activePanel, onSwitch }: Props = $props();

  let showDropdown = $state(false);

  const panelConfig = {
    chat: {
      label: 'Agent',
      icon: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z'
    },
    shelf: {
      label: 'Shelf',
      icon: 'M22 12h-6l-2 3h-4l-2-3H2',
      icon2:
        'M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
    }
  };

  function handleSelect(panel: 'chat' | 'shelf'): void {
    showDropdown = false;
    if (panel !== activePanel) {
      onSwitch(panel);
    }
  }
</script>

<div class="mode-switcher-container">
  <button
    class="mode-switcher-btn"
    onclick={() => (showDropdown = !showDropdown)}
    aria-label="Switch panel mode"
    aria-expanded={showDropdown}
  >
    {#if activePanel === 'chat'}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d={panelConfig.chat.icon}></path>
      </svg>
    {:else}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d={panelConfig.shelf.icon}></path>
        <path d={panelConfig.shelf.icon2}></path>
      </svg>
    {/if}
    <svg
      class="chevron"
      class:open={showDropdown}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  </button>
  {#if showDropdown}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="mode-switcher-dropdown" onmouseleave={() => (showDropdown = false)}>
      <button
        class="mode-option"
        class:active={activePanel === 'chat'}
        onclick={() => handleSelect('chat')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d={panelConfig.chat.icon}></path>
        </svg>
        <span>{panelConfig.chat.label}</span>
      </button>
      <button
        class="mode-option"
        class:active={activePanel === 'shelf'}
        onclick={() => handleSelect('shelf')}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d={panelConfig.shelf.icon}></path>
          <path d={panelConfig.shelf.icon2}></path>
        </svg>
        <span>{panelConfig.shelf.label}</span>
      </button>
    </div>
  {/if}
</div>

<style>
  .mode-switcher-container {
    position: relative;
  }

  .mode-switcher-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 6px;
    border: 1px solid var(--border-light);
    background: var(--bg-secondary);
    color: var(--text-primary);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .mode-switcher-btn:hover {
    background: var(--bg-hover);
    border-color: var(--border-medium, var(--border-light));
  }

  .mode-switcher-btn .chevron {
    transition: transform 0.15s ease;
  }

  .mode-switcher-btn .chevron.open {
    transform: rotate(180deg);
  }

  .mode-switcher-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    min-width: 140px;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1);
    z-index: 100;
    overflow: hidden;
  }

  .mode-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border: none;
    background: none;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.1s ease;
    text-align: left;
  }

  .mode-option:hover {
    background: var(--bg-hover);
  }

  .mode-option.active {
    background: var(--bg-tertiary, var(--bg-secondary));
    color: var(--accent-primary);
  }

  .mode-option.active:hover {
    background: var(--bg-tertiary, var(--bg-secondary));
  }
</style>
