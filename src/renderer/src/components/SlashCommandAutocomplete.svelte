<script lang="ts">
  import {
    slashCommandsStore,
    type SlashCommand
  } from '../stores/slashCommandsStore.svelte.ts';

  interface Props {
    query: string;
    onSelect: (command: SlashCommand) => void;
    onCancel: () => void;
    selectedIndex: number;
  }

  let { query, onSelect, selectedIndex }: Props = $props();

  // Filter commands based on the query
  function getFilteredCommands(): SlashCommand[] {
    const allCommands = slashCommandsStore.allCommands;

    if (!query) {
      return allCommands.slice(0, 5); // Show first 5 if no query
    }

    return slashCommandsStore.searchCommands(query);
  }

  let filteredCommands = $derived(getFilteredCommands());

  function handleCommandClick(command: SlashCommand): void {
    onSelect(command);
  }

  function handleMouseEnter(_index: number): void {
    // We could emit an event to update selectedIndex if needed
    // For now, let parent handle keyboard navigation
  }
</script>

<div class="autocomplete-container">
  {#if slashCommandsStore.allCommands.length === 0}
    <div class="autocomplete-dropdown">
      <div class="no-results">
        <span class="no-results-text">No slash commands configured</span>
        <span class="no-results-hint"
          >Create your first command in Settings → Slash Commands</span
        >
      </div>
    </div>
  {:else if filteredCommands.length > 0}
    <div class="autocomplete-dropdown">
      <div class="dropdown-header">
        <span class="dropdown-title">Slash Commands</span>
        <span class="dropdown-count">{filteredCommands.length} available</span>
      </div>
      <div class="commands-list">
        {#each filteredCommands as command, index (command.id)}
          <button
            class="command-item"
            class:selected={index === selectedIndex}
            onclick={() => handleCommandClick(command)}
            onmouseenter={() => handleMouseEnter(index)}
          >
            <div class="command-info">
              <div class="command-name">/{command.name}</div>
              <div class="command-instruction">
                {command.instruction}
              </div>
            </div>
          </button>
        {/each}
      </div>
      <div class="dropdown-footer">
        <span class="dropdown-hint">↑↓ navigate • Enter to select • Escape to cancel</span
        >
      </div>
    </div>
  {:else if query}
    <div class="autocomplete-dropdown">
      <div class="no-results">
        <span class="no-results-text">No commands found for "{query}"</span>
        <span class="no-results-hint">Try a different search term</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .autocomplete-container {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    margin-bottom: 0.5rem;
  }

  .autocomplete-dropdown {
    background: var(--bg-secondary);
    border: 1px solid var(--border-medium);
    border-radius: 0.75rem;
    box-shadow: var(--shadow-medium);
    overflow: hidden;
    max-height: 300px;
    display: flex;
    flex-direction: column;
  }

  .dropdown-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-tertiary);
  }

  .dropdown-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .dropdown-count {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .commands-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .command-item {
    width: 100%;
    padding: 0.75rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .command-item:last-child {
    border-bottom: none;
  }

  .command-item:hover,
  .command-item.selected {
    background: var(--accent-light);
  }

  .command-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .command-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent-primary);
    font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  }

  .command-instruction {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .dropdown-footer {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-tertiary);
  }

  .dropdown-hint {
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .no-results {
    padding: 1rem 0.75rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .no-results-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .no-results-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Scrollbar styling */
  .commands-list::-webkit-scrollbar {
    width: 6px;
  }

  .commands-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .commands-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .commands-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
</style>
