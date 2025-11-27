<script lang="ts">
  import { onMount } from 'svelte';

  // Discriminated union for menu items
  type MenuItem =
    | {
        type?: undefined;
        label: string;
        accelerator?: string;
        action?: string;
        role?: string;
        enabled?: boolean;
        checked?: boolean;
        submenu?: MenuItem[];
      }
    | {
        type: 'separator';
      };

  interface MenuDefinition {
    label: string;
    items: MenuItem[];
  }

  // Menu definitions matching the Electron menu structure
  const menus: MenuDefinition[] = [
    {
      label: 'File',
      items: [
        { label: 'New Note', accelerator: 'Ctrl+Shift+N', action: 'new-note' },
        { label: 'New Vault...', action: 'new-vault' },
        { type: 'separator' },
        { label: 'Switch Vault', accelerator: 'Ctrl+Shift+O', action: 'switch-vault' },
        { type: 'separator' },
        {
          label: 'Show in Explorer',
          accelerator: 'Ctrl+Shift+R',
          action: 'show-in-finder'
        },
        { type: 'separator' },
        { label: 'Exit', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Ctrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Ctrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'Ctrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'Ctrl+V', role: 'paste' },
        { label: 'Delete', role: 'delete' },
        { type: 'separator' },
        { label: 'Select All', accelerator: 'Ctrl+A', role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'Ctrl+O', action: 'find' }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Inbox', accelerator: 'Ctrl+1', action: 'navigate:inbox' },
        { label: 'Daily', accelerator: 'Ctrl+2', action: 'navigate:daily' },
        { label: 'Review', accelerator: 'Ctrl+3', action: 'navigate:review' },
        { label: 'Routines', accelerator: 'Ctrl+4', action: 'navigate:routines' },
        { label: 'Note Types', accelerator: 'Ctrl+5', action: 'navigate:note-types' },
        { label: 'Settings', accelerator: 'Ctrl+6', action: 'navigate:settings' },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'Ctrl+B', action: 'toggle-sidebar' },
        { label: 'Focus Title', accelerator: 'Ctrl+E', action: 'focus-title' },
        {
          label: 'Toggle Preview/Edit',
          accelerator: 'Ctrl+Shift+E',
          action: 'toggle-preview'
        },
        { label: 'Toggle Metadata', accelerator: 'Ctrl+M', action: 'toggle-metadata' },
        { type: 'separator' },
        {
          label: 'Toggle Agent Panel',
          accelerator: 'Ctrl+Shift+A',
          action: 'toggle-agent'
        },
        {
          label: 'Toggle Notes Shelf',
          accelerator: 'Ctrl+Shift+L',
          action: 'toggle-shelf'
        },
        { type: 'separator' },
        { label: 'Actual Size', accelerator: 'Ctrl+0', role: 'resetZoom' },
        { label: 'Zoom In', accelerator: 'Ctrl++', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'Ctrl+-', role: 'zoomOut' },
        { type: 'separator' },
        { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Workspace',
      items: [
        { label: 'New Workspace...', action: 'new-workspace' },
        { label: 'Edit Current Workspace...', action: 'edit-workspace' },
        { label: 'Delete Current Workspace', action: 'delete-workspace' }
      ]
    },
    {
      label: 'Note',
      items: [
        { label: 'Pin/Unpin Note', accelerator: 'Ctrl+Shift+P', action: 'toggle-pin' },
        { label: 'Add to Shelf', action: 'add-to-shelf' },
        { label: 'Change Type', accelerator: 'Ctrl+Shift+M', action: 'change-type' },
        { type: 'separator' },
        { label: 'Enable/Disable Review', action: 'toggle-review' },
        { label: 'Generate Suggestions', action: 'generate-suggestions' },
        { type: 'separator' },
        { label: 'Archive', action: 'archive-note' }
      ]
    },
    {
      label: 'Window',
      items: [
        { label: 'Minimize', role: 'minimize' },
        { label: 'Zoom', role: 'zoom' },
        { type: 'separator' },
        { label: 'Close', role: 'close' }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Documentation', action: 'open-docs' },
        { label: "What's New", action: 'show-changelog' },
        { type: 'separator' },
        { label: 'Check for Updates...', action: 'check-updates' },
        { type: 'separator' },
        { label: 'About', action: 'show-about' }
      ]
    }
  ];

  let containerRef: HTMLDivElement | null = $state(null);
  let openMenuIndex = $state<number | null>(null);
  let visibleMenuCount = $state(menus.length);
  let menuWidths: number[] = $state([]);

  // Measure menu widths on mount
  onMount(() => {
    measureMenuWidths();
    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleMenus();
    });
    if (containerRef) {
      resizeObserver.observe(containerRef);
    }
    return () => resizeObserver.disconnect();
  });

  function measureMenuWidths(): void {
    // Estimate width based on label length (approximately 8px per character + padding)
    menuWidths = menus.map((menu) => menu.label.length * 8 + 24);
    calculateVisibleMenus();
  }

  function calculateVisibleMenus(): void {
    if (!containerRef) return;

    const availableWidth = containerRef.clientWidth;
    const overflowButtonWidth = 40; // Width of "..." button
    let totalWidth = 0;
    let count = 0;

    for (let i = 0; i < menus.length; i++) {
      const menuWidth = menuWidths[i] || 60;
      if (totalWidth + menuWidth <= availableWidth - overflowButtonWidth) {
        totalWidth += menuWidth;
        count++;
      } else {
        break;
      }
    }

    // If all menus fit, show them all
    if (totalWidth + (menuWidths[count] || 0) <= availableWidth) {
      count = menus.length;
    }

    visibleMenuCount = Math.max(0, count);
  }

  function handleMenuClick(index: number): void {
    if (openMenuIndex === index) {
      openMenuIndex = null;
    } else {
      openMenuIndex = index;
    }
  }

  function handleMenuHover(index: number): void {
    if (openMenuIndex !== null) {
      openMenuIndex = index;
    }
  }

  function handleItemClick(item: MenuItem): void {
    openMenuIndex = null;

    // Type guard: separators don't have role or action
    if (item.type === 'separator') return;

    if (item.role) {
      // Handle native roles
      switch (item.role) {
        case 'quit':
          window.electron?.ipcRenderer.send('window-close');
          break;
        case 'minimize':
          window.electron?.ipcRenderer.send('window-minimize');
          break;
        case 'close':
          window.electron?.ipcRenderer.send('window-close');
          break;
        case 'undo':
        case 'redo':
        case 'cut':
        case 'copy':
        case 'paste':
        case 'delete':
        case 'selectAll':
          document.execCommand(item.role);
          break;
        case 'resetZoom':
        case 'zoomIn':
        case 'zoomOut':
        case 'togglefullscreen':
        case 'zoom':
          // These are handled by Electron's native menu
          break;
      }
    } else if (item.action) {
      // Handle custom actions
      if (item.action.startsWith('navigate:')) {
        const view = item.action.replace('navigate:', '');
        window.api?.triggerMenuNavigate(view);
      } else if (item.action === 'open-docs') {
        window.open('https://www.flintnote.com/docs', '_blank');
      } else {
        window.api?.triggerMenuAction(item.action);
      }
    }
  }

  function handleClickOutside(event: MouseEvent): void {
    if (containerRef && !containerRef.contains(event.target as Node)) {
      openMenuIndex = null;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      openMenuIndex = null;
    }
  }

  // Global click listener to close menu
  $effect(() => {
    if (openMenuIndex !== null) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  });

  const visibleMenus = $derived(menus.slice(0, visibleMenuCount));
  const overflowMenus = $derived(menus.slice(visibleMenuCount));
</script>

<div class="title-bar-menu" bind:this={containerRef}>
  {#each visibleMenus as menu, index (menu.label)}
    <div class="menu-item-wrapper">
      <button
        class="menu-button"
        class:active={openMenuIndex === index}
        onclick={(e) => {
          e.stopPropagation();
          handleMenuClick(index);
        }}
        onmouseenter={() => handleMenuHover(index)}
      >
        {menu.label}
      </button>
      {#if openMenuIndex === index}
        <div class="menu-dropdown">
          {#each menu.items as item, itemIdx (item.type === 'separator' ? `sep-${itemIdx}` : item.label)}
            {#if item.type === 'separator'}
              <div class="menu-separator"></div>
            {:else}
              <button
                class="menu-dropdown-item"
                class:disabled={item.enabled === false}
                onclick={(e) => {
                  e.stopPropagation();
                  handleItemClick(item);
                }}
              >
                <span class="menu-item-label">{item.label}</span>
                {#if item.accelerator}
                  <span class="menu-item-shortcut">{item.accelerator}</span>
                {/if}
              </button>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/each}

  {#if overflowMenus.length > 0}
    <div class="menu-item-wrapper">
      <button
        class="menu-button overflow-button"
        class:active={openMenuIndex === visibleMenuCount}
        onclick={(e) => {
          e.stopPropagation();
          handleMenuClick(visibleMenuCount);
        }}
        onmouseenter={() => handleMenuHover(visibleMenuCount)}
      >
        ...
      </button>
      {#if openMenuIndex === visibleMenuCount}
        <div class="menu-dropdown overflow-dropdown">
          {#each overflowMenus as menu, menuIdx (menu.label)}
            <div class="overflow-menu-group">
              <div class="overflow-menu-header">{menu.label}</div>
              {#each menu.items as item, itemIdx (item.type === 'separator' ? `sep-${itemIdx}` : item.label)}
                {#if item.type === 'separator'}
                  <div class="menu-separator"></div>
                {:else}
                  <button
                    class="menu-dropdown-item"
                    class:disabled={item.enabled === false}
                    onclick={(e) => {
                      e.stopPropagation();
                      handleItemClick(item);
                    }}
                  >
                    <span class="menu-item-label">{item.label}</span>
                    {#if item.accelerator}
                      <span class="menu-item-shortcut">{item.accelerator}</span>
                    {/if}
                  </button>
                {/if}
              {/each}
            </div>
            {#if menuIdx < overflowMenus.length - 1}
              <div class="menu-separator thick"></div>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .title-bar-menu {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 0;
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
  }

  .menu-item-wrapper {
    position: relative;
    height: 100%;
    display: flex;
    align-items: center;
  }

  .menu-button {
    height: 100%;
    padding: 0 12px;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color 0.15s ease;
  }

  .menu-button:hover,
  .menu-button.active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .overflow-button {
    font-weight: bold;
    letter-spacing: 1px;
  }

  .menu-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 220px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0 0 6px 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    padding: 4px 0;
  }

  .overflow-dropdown {
    min-width: 260px;
    max-height: 400px;
    overflow-y: auto;
  }

  .overflow-menu-group {
    padding: 4px 0;
  }

  .overflow-menu-header {
    padding: 6px 12px 4px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .menu-dropdown-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 6px 12px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.1s ease;
  }

  .menu-dropdown-item:hover:not(.disabled) {
    background: var(--accent-primary);
    color: white;
  }

  .menu-dropdown-item.disabled {
    color: var(--text-tertiary);
    cursor: not-allowed;
  }

  .menu-item-label {
    flex: 1;
  }

  .menu-item-shortcut {
    margin-left: 24px;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .menu-dropdown-item:hover:not(.disabled) .menu-item-shortcut {
    color: rgba(255, 255, 255, 0.7);
  }

  .menu-separator {
    height: 1px;
    margin: 4px 8px;
    background: var(--border-light);
  }

  .menu-separator.thick {
    height: 1px;
    margin: 8px 0;
    background: var(--border-medium);
  }

  /* Hide on macOS */
  :global(html[data-platform='macos']) .title-bar-menu {
    display: none;
  }
</style>
