<script lang="ts">
  /**
   * Unified dropdown menu for inserting blocks.
   * Used by both slash commands and gutter plus button.
   */
  import { EditorView } from 'codemirror';
  import { startCompletion } from '@codemirror/autocomplete';
  import {
    defaultSlashCommands,
    applySlashCommand,
    getBlockPrefixLength,
    type SlashCommand
  } from '../lib/automerge/slash-commands.svelte';
  import { useTouchInteractions } from '../stores/deviceState.svelte';

  type InsertMode =
    | { type: 'gutter'; linePos: number }
    | { type: 'slash'; slashFrom: number; slashTo: number };

  interface Props {
    visible: boolean;
    x: number;
    y: number;
    editorView: EditorView | null;
    mode: InsertMode;
    commands?: SlashCommand[];
    onClose: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    y,
    editorView,
    mode,
    commands = defaultSlashCommands,
    onClose
  }: Props = $props();

  let menuElement: HTMLDivElement | undefined = $state();
  let searchQuery = $state('');
  let selectedIndex = $state(0);

  // Filter commands by search query
  const filteredCommands = $derived.by(() => {
    if (!searchQuery) return commands;
    const query = searchQuery.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) ||
        cmd.section.toLowerCase().includes(query) ||
        cmd.description?.toLowerCase().includes(query)
    );
  });

  // Group commands by section
  const groupedCommands = $derived.by(() => {
    const groups: Record<string, SlashCommand[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.section]) {
        groups[cmd.section] = [];
      }
      groups[cmd.section].push(cmd);
    }
    return groups;
  });

  // Flat list for keyboard navigation
  const flatCommands = $derived(filteredCommands);

  // Reset selection and search when menu opens/closes
  $effect(() => {
    if (visible) {
      searchQuery = '';
      selectedIndex = 0;
    }
  });

  // Reset selection when filtered commands change
  $effect(() => {
    void filteredCommands;
    selectedIndex = 0;
  });

  function handleCommandClick(command: SlashCommand): void {
    if (!editorView) return;

    if (mode.type === 'slash') {
      // Replace the "/" with the command insert
      applySlashCommand(editorView, command, mode.slashFrom, mode.slashTo);
    } else {
      // Insert at line start (gutter mode)
      const line = editorView.state.doc.lineAt(mode.linePos);
      const insertPos = line.from;

      // If this is a block prefix command, check for and replace existing block prefix
      let replaceEnd = insertPos;
      if (command.isBlockPrefix) {
        const existingPrefixLength = getBlockPrefixLength(line.text);
        if (existingPrefixLength > 0) {
          replaceEnd = insertPos + existingPrefixLength;
        }
      }

      editorView.dispatch({
        changes: { from: insertPos, to: replaceEnd, insert: command.insert }
      });

      // Position cursor if specified
      if (command.cursorOffset !== undefined) {
        const newPos = insertPos + command.insert.length + command.cursorOffset;
        editorView.dispatch({
          selection: { anchor: newPos }
        });
      }

      editorView.focus();
    }

    onClose();

    // Trigger autocomplete if requested
    if (command.triggerAutocomplete && editorView) {
      // Use setTimeout to ensure the menu is closed and editor is focused first
      setTimeout(() => {
        if (editorView) {
          startCompletion(editorView);
        }
      }, 0);
    }
  }

  function handleMouseDown(e: MouseEvent): void {
    // Prevent blurring the editor
    e.preventDefault();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    // Handle Cmd/Ctrl+N and Cmd/Ctrl+P for navigation
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'n') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, flatCommands.length - 1);
        return;
      }
      if (e.key === 'p') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        return;
      }
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, flatCommands.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[selectedIndex]) {
          handleCommandClick(flatCommands[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        editorView?.focus();
        break;
      case 'Backspace':
        // When search is empty, dismiss the menu and delete the "/" in slash mode
        if (searchQuery === '') {
          e.preventDefault();
          if (mode.type === 'slash' && editorView) {
            // Delete the "/" that triggered the menu
            editorView.dispatch({
              changes: { from: mode.slashFrom, to: mode.slashTo, insert: '' }
            });
          }
          onClose();
          editorView?.focus();
        }
        break;
    }
  }

  // Calculate position avoiding viewport edges
  const menuWidth = 250;
  const menuMaxHeight = 300;
  const padding = 8;

  const position = $derived.by(() => {
    if (!visible) return { x: 0, y: 0 };

    let finalX = x;
    let finalY = y;

    // Keep within horizontal bounds
    if (finalX + menuWidth > window.innerWidth - padding) {
      finalX = window.innerWidth - menuWidth - padding;
    }
    if (finalX < padding) finalX = padding;

    // Keep within vertical bounds
    if (finalY + menuMaxHeight > window.innerHeight - padding) {
      finalY = window.innerHeight - menuMaxHeight - padding;
    }
    if (finalY < padding) finalY = padding;

    return { x: finalX, y: finalY };
  });

  // Focus search input when menu opens
  $effect(() => {
    if (visible && menuElement) {
      const input = menuElement.querySelector('input');
      if (input) {
        setTimeout(() => input.focus(), 0);
      }
    }
  });
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={menuElement}
    class="insert-menu"
    class:touch={useTouchInteractions()}
    style="left: {position.x}px; top: {position.y}px;"
    role="menu"
    tabindex="-1"
    onkeydown={handleKeyDown}
    onmousedown={handleMouseDown}
  >
    <div class="menu-search">
      <input
        type="text"
        placeholder="Search..."
        bind:value={searchQuery}
        class="search-input"
      />
    </div>

    <div class="menu-items">
      {#each Object.entries(groupedCommands) as [section, sectionCommands] (section)}
        <div class="menu-section">
          <div class="section-header">{section}</div>
          {#each sectionCommands as command (command.label)}
            {@const globalIndex = flatCommands.indexOf(command)}
            <button
              type="button"
              class="menu-item"
              class:selected={globalIndex === selectedIndex}
              role="menuitem"
              onclick={() => handleCommandClick(command)}
              onmousedown={handleMouseDown}
              onmouseenter={() => (selectedIndex = globalIndex)}
            >
              <span class="item-icon">{command.icon || ''}</span>
              <span class="item-label">{command.label}</span>
              {#if command.description}
                <span class="item-description">{command.description}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/each}

      {#if flatCommands.length === 0}
        <div class="no-results">No commands found</div>
      {/if}
    </div>
  </div>

  <!-- Backdrop to close menu when clicking outside -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="menu-backdrop" onclick={onClose}></div>
{/if}

<style>
  .menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
  }

  .insert-menu {
    position: fixed;
    z-index: 1001;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
    width: 250px;
    max-height: 300px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .insert-menu.touch {
    width: 280px;
    max-height: 350px;
  }

  .menu-search {
    padding: 8px;
    border-bottom: 1px solid var(--border-light);
  }

  .search-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border-light);
    border-radius: 6px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
  }

  .search-input:focus {
    border-color: var(--border-focus, var(--accent-primary));
  }

  .menu-items {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .menu-section {
    margin-bottom: 4px;
  }

  .section-header {
    padding: 6px 12px 4px;
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
  }

  .menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    border-radius: 4px;
    text-align: left;
    transition: background-color 0.1s ease;
  }

  .insert-menu.touch .menu-item {
    padding: 12px;
    font-size: 1rem;
  }

  .menu-item:hover,
  .menu-item.selected {
    background: var(--bg-secondary);
  }

  .item-icon {
    width: 20px;
    text-align: center;
    flex-shrink: 0;
    font-size: 0.875rem;
  }

  .item-label {
    flex: 1;
    font-weight: 500;
  }

  .item-description {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .no-results {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
  }
</style>
