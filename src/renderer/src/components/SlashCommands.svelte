<script lang="ts">
  import type { SlashCommand } from '../types/chat';

  export let isOpen: boolean = false;
  export let query: string = '';
  export let position: { x: number; y: number } = { x: 0, y: 0 };
  export let maxHeight: number = 400;
  export let close: () => void;
  export let command: (command: SlashCommand, args: string[]) => void;

  let commandsContainer: HTMLElement;
  let selectedIndex = 0;

  // Mock commands for now
  const commands: SlashCommand[] = [
    {
      name: 'create',
      description: 'Create a new note',
      category: 'note',
      handler: async () => {}
    },
    {
      name: 'find',
      description: 'Find existing notes',
      category: 'note',
      handler: async () => {}
    },
    {
      name: 'update',
      description: 'Update an existing note',
      category: 'note',
      handler: async () => {}
    },
    {
      name: 'delete',
      description: 'Delete a note',
      category: 'note',
      handler: async () => {}
    },
    {
      name: 'switch-vault',
      description: 'Switch to a different vault',
      category: 'vault',
      handler: async () => {}
    },
    {
      name: 'list-vaults',
      description: 'List all available vaults',
      category: 'vault',
      handler: async () => {}
    },
    {
      name: 'weather',
      description: 'Get current weather for a location',
      category: 'tool',
      handler: async () => {}
    },
    {
      name: 'forecast',
      description: 'Get weather forecast for a location',
      category: 'tool',
      handler: async () => {}
    },
    {
      name: 'weekly-review',
      description: 'Generate weekly review template',
      category: 'prompt',
      handler: async () => {}
    },
    {
      name: 'brainstorm',
      description: 'Start brainstorming session',
      category: 'prompt',
      handler: async () => {}
    },
    {
      name: 'help',
      description: 'Show available commands',
      category: 'system',
      handler: async () => {}
    }
  ];

  // Filter commands based on query
  $: filteredCommands = commands.filter(
    (cmd) =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(0, selectedIndex - 1);
        scrollToSelected();
        break;
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(filteredCommands.length - 1, selectedIndex + 1);
        scrollToSelected();
        break;
      case 'Enter':
        event.preventDefault();
        if (filteredCommands[selectedIndex]) {
          command(filteredCommands[selectedIndex], []);
        }
        break;
      case 'Escape':
        event.preventDefault();
        close();
        break;
    }
  };

  const scrollToSelected = (): void => {
    if (commandsContainer) {
      const selectedElement = commandsContainer.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case 'note':
        return '📝';
      case 'vault':
        return '📁';
      case 'prompt':
        return '💭';
      case 'system':
        return '⚙️';
      default:
        return '📋';
    }
  };

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'note':
        return '#28a745';
      case 'vault':
        return '#007bff';
      case 'prompt':
        return '#6f42c1';
      case 'system':
        return '#6c757d';
      default:
        return '#007bff';
    }
  };

  // Handle click outside to close
  const handleClickOutside = (event: MouseEvent): void => {
    if (!isOpen) return;

    const target = event.target as HTMLElement;
    const palette = document.querySelector('.command-palette') as HTMLElement;

    if (palette && !palette.contains(target)) {
      close();
    }
  };

  // Bind to window for global keyboard handling and click outside
  if (typeof window !== 'undefined') {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('click', handleClickOutside);
    } else {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleClickOutside);
    }
  }
</script>

{#if isOpen}
  <div
    class="command-palette"
    style="left: {position.x}px; top: {position.y}px; max-height: {maxHeight}px;"
    role="listbox"
    aria-label="Command palette"
  >
    <div class="command-header">
      <span class="command-prefix">/</span>
      <span class="command-query">{query}</span>
    </div>

    {#if filteredCommands.length > 0}
      <div class="commands-container" bind:this={commandsContainer}>
        {#each filteredCommands as cmd, index (cmd.name)}
          <button
            class="command-item"
            class:selected={index === selectedIndex}
            onclick={() => command(cmd, ['' + index])}
            role="option"
            aria-selected={index === selectedIndex}
          >
            <div class="command-icon" style="color: {getCategoryColor(cmd.category)}">
              {getCategoryIcon(cmd.category)}
            </div>
            <div class="command-content">
              <div class="command-name">
                <span class="command-slash">/</span>{command.name}
              </div>
              <div class="command-description">
                {cmd.description}
              </div>
            </div>
            <div class="command-category">
              {cmd.category}
            </div>
          </button>
        {/each}
      </div>
    {:else}
      <div class="no-commands">
        <span class="no-commands-icon">🔍</span>
        <span class="no-commands-text">No commands found</span>
      </div>
    {/if}

    <div class="command-footer">
      <div class="command-hint">
        <kbd>↑</kbd><kbd>↓</kbd> to navigate • <kbd>Enter</kbd> to select • <kbd>Esc</kbd>
        to close
      </div>
    </div>
  </div>
{/if}

<style>
  .command-palette {
    position: fixed;
    background: white;
    border: 1px solid #e9ecef;
    border-radius: 0.75rem;
    box-shadow:
      0 10px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    z-index: 1000;
    min-width: 400px;
    max-width: 500px;
    max-height: 400px;
    overflow: hidden;
    backdrop-filter: blur(10px);
  }

  .command-header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #f1f3f4;
    background-color: #f8f9fa;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .command-prefix {
    color: #007bff;
    font-weight: 600;
  }

  .command-query {
    color: #495057;
    font-weight: 500;
  }

  .commands-container {
    max-height: calc(100% - 100px); /* Account for header and footer */
    overflow-y: auto;
  }

  .command-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1rem;
    border: none;
    background: none;
    cursor: pointer;
    transition: background-color 0.1s;
    text-align: left;
    gap: 0.75rem;
  }

  .command-item:hover,
  .command-item.selected {
    background-color: #f8f9fa;
  }

  .command-item.selected {
    background-color: #e3f2fd;
  }

  .command-icon {
    font-size: 1.2rem;
    flex-shrink: 0;
  }

  .command-content {
    flex: 1;
    min-width: 0;
  }

  .command-name {
    font-weight: 600;
    color: #212529;
    font-size: 0.9rem;
    display: flex;
    align-items: center;
    gap: 0.1rem;
  }

  .command-slash {
    color: #007bff;
    font-size: 0.8rem;
  }

  .command-description {
    color: #6c757d;
    font-size: 0.8rem;
    margin-top: 0.1rem;
  }

  .command-category {
    font-size: 0.7rem;
    color: #adb5bd;
    text-transform: uppercase;
    font-weight: 500;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .no-commands {
    padding: 2rem 1rem;
    text-align: center;
    color: #6c757d;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .no-commands-icon {
    font-size: 1.5rem;
    opacity: 0.5;
  }

  .no-commands-text {
    font-size: 0.9rem;
  }

  .command-footer {
    padding: 0.5rem 1rem;
    border-top: 1px solid #f1f3f4;
    background-color: #f8f9fa;
  }

  .command-hint {
    font-size: 0.75rem;
    color: #6c757d;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  kbd {
    display: inline-block;
    padding: 0.1rem 0.3rem;
    font-size: 0.7rem;
    background-color: #e9ecef;
    border: 1px solid #ced4da;
    border-radius: 0.2rem;
    color: #495057;
    font-family: monospace;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .command-palette {
      background-color: #2d3748;
      border-color: #4a5568;
    }

    .command-header {
      background-color: #1a202c;
      border-color: #4a5568;
    }

    .command-query {
      color: #e2e8f0;
    }

    .command-item:hover,
    .command-item.selected {
      background-color: #4a5568;
    }

    .command-item.selected {
      background-color: #2b6cb0;
    }

    .command-name {
      color: #f7fafc;
    }

    .command-description {
      color: #a0aec0;
    }

    .command-category {
      color: #718096;
    }

    .no-commands {
      color: #a0aec0;
    }

    .command-footer {
      background-color: #1a202c;
      border-color: #4a5568;
    }

    .command-hint {
      color: #a0aec0;
    }

    kbd {
      background-color: #4a5568;
      border-color: #2d3748;
      color: #e2e8f0;
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .command-palette {
      min-width: 300px;
      max-width: 350px;
      position: fixed;
      left: 50% !important;
      top: 20% !important;
      transform: translateX(-50%);
    }

    .command-item {
      padding: 1rem;
    }

    .command-name {
      font-size: 0.95rem;
    }

    .command-description {
      font-size: 0.85rem;
    }
  }
</style>
