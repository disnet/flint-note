<script lang="ts">
  import {
    fileMenuItems,
    editMenuItems,
    viewMenuItems,
    workspaceMenuItems,
    noteMenuItems,
    windowMenuItems,
    helpMenuItems,
    convertAccelerator,
    getLabel,
    type MenuItemDef
  } from '../../../shared/menu-definitions';

  // Local menu item type with resolved values
  type MenuItem =
    | {
        type?: undefined;
        label: string;
        accelerator?: string;
        action?: string;
        role?: string;
        enabled?: boolean;
      }
    | {
        type: 'separator';
      };

  interface MenuDefinition {
    label: string;
    items: MenuItem[];
  }

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  // Convert shared menu definitions to local format for Windows/Linux
  function convertMenuItems(items: MenuItemDef[]): MenuItem[] {
    return items.map((item) => {
      if (item.type === 'separator') {
        return { type: 'separator' as const };
      }
      return {
        label: getLabel(item, 'win'),
        accelerator: item.accelerator
          ? convertAccelerator(item.accelerator, 'win')
          : undefined,
        action: item.action,
        role: item.role
      };
    });
  }

  // Build menus from shared definitions, adding platform-specific items
  const menus: MenuDefinition[] = [
    {
      label: 'File',
      items: [
        ...convertMenuItems(fileMenuItems),
        { type: 'separator' },
        { label: 'Exit', role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      items: convertMenuItems(editMenuItems)
    },
    {
      label: 'View',
      items: convertMenuItems(viewMenuItems)
    },
    {
      label: 'Workspace',
      items: convertMenuItems(workspaceMenuItems)
    },
    {
      label: 'Note',
      items: convertMenuItems(noteMenuItems)
    },
    {
      label: 'Window',
      items: convertMenuItems(windowMenuItems)
    },
    {
      label: 'Help',
      items: convertMenuItems(helpMenuItems)
    }
  ];

  let expandedMenu = $state<string | null>(null);
  let menuRef: HTMLDivElement | null = $state(null);

  function handleItemClick(item: MenuItem): void {
    // Type guard: separators don't have role or action
    if (item.type === 'separator') return;

    onClose();

    if (item.role) {
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
          // These need to go through IPC
          window.api?.triggerMenuAction(item.role);
          break;
      }
    } else if (item.action) {
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

  function toggleSubmenu(label: string): void {
    expandedMenu = expandedMenu === label ? null : label;
  }

  function handleClickOutside(event: MouseEvent): void {
    if (menuRef && !menuRef.contains(event.target as Node)) {
      onClose();
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  $effect(() => {
    if (open) {
      // Small delay to avoid the click that opened the menu from immediately closing it
      const timeout = setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
      }, 10);
      return () => {
        clearTimeout(timeout);
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  });

  // Reset expanded menu when closed
  $effect(() => {
    if (!open) {
      expandedMenu = null;
    }
  });
</script>

{#if open}
  <div class="hamburger-menu" bind:this={menuRef}>
    {#each menus as menu (menu.label)}
      <div class="menu-section">
        <button class="menu-header" onclick={() => toggleSubmenu(menu.label)}>
          <span>{menu.label}</span>
          <svg
            class="chevron"
            class:expanded={expandedMenu === menu.label}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        {#if expandedMenu === menu.label}
          <div class="menu-items">
            {#each menu.items as item, itemIdx (item.type === 'separator' ? `sep-${itemIdx}` : item.label)}
              {#if item.type === 'separator'}
                <div class="menu-separator"></div>
              {:else}
                <button
                  class="menu-item"
                  class:disabled={item.enabled === false}
                  onclick={() => handleItemClick(item)}
                >
                  <span class="item-label">{item.label}</span>
                  {#if item.accelerator}
                    <span class="item-shortcut">{item.accelerator}</span>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .hamburger-menu {
    position: absolute;
    top: 100%;
    left: 0;
    min-width: 280px;
    max-height: calc(100vh - 50px);
    overflow-y: auto;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0 0 8px 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 1000;
  }

  .menu-section {
    border-bottom: 1px solid var(--border-light);
  }

  .menu-section:last-child {
    border-bottom: none;
  }

  .menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .menu-header:hover {
    background: var(--bg-tertiary);
  }

  .chevron {
    transition: transform 0.2s ease;
    color: var(--text-muted);
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .menu-items {
    padding: 4px 0;
    background: var(--bg-primary);
  }

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 14px 8px 24px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.1s ease;
  }

  .menu-item:hover:not(.disabled) {
    background: var(--accent-primary);
    color: white;
  }

  .menu-item:hover:not(.disabled) .item-shortcut {
    color: rgba(255, 255, 255, 0.7);
  }

  .menu-item.disabled {
    color: var(--text-muted);
    cursor: not-allowed;
  }

  .item-label {
    flex: 1;
  }

  .item-shortcut {
    margin-left: 16px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .menu-separator {
    height: 1px;
    margin: 4px 14px 4px 24px;
    background: var(--border-light);
  }
</style>
