<script lang="ts">
  /**
   * Hamburger menu component for Windows/Linux/Web
   * Shows the application menu in a dropdown format since these platforms
   * don't have a native menu bar like macOS.
   */
  import {
    fileMenuItems,
    editMenuItems,
    viewMenuItems,
    workspaceMenuItems,
    noteMenuItems,
    helpMenuItems,
    convertAccelerator,
    getLabel,
    type MenuItemDef
  } from '../../../shared/menu-definitions';
  import { isElectron, isWeb } from '../lib/platform.svelte';

  let isOpen = $state(false);
  let activeSubmenu = $state<string | null>(null);
  let buttonElement = $state<HTMLButtonElement | null>(null);
  let dropdownPosition = $state({ top: 0, left: 0 });

  // Actions that require Electron and should be hidden in web mode
  const electronOnlyActions = new Set([
    'show-in-finder',
    'show-debug-logs',
    'toggle-dev-tools',
    'check-updates'
  ]);

  // Filter menu items for web mode
  function filterMenuItems(items: MenuItemDef[]): MenuItemDef[] {
    if (!isWeb()) return items;

    return items.filter((item) => {
      if (item.type === 'separator') return true;
      if (item.action && electronOnlyActions.has(item.action)) return false;
      // Filter out role-based items that don't work in web (zoom, fullscreen handled by browser)
      if (item.role === 'togglefullscreen') return false;
      return true;
    });
  }

  // Remove consecutive separators and leading/trailing separators
  function cleanupSeparators(items: MenuItemDef[]): MenuItemDef[] {
    return items.filter((item, i, arr) => {
      if (item.type !== 'separator') return true;
      // Remove leading separator
      if (i === 0) return false;
      // Remove trailing separator
      if (i === arr.length - 1) return false;
      // Remove consecutive separators
      if (arr[i - 1]?.type === 'separator') return false;
      return true;
    });
  }

  const menus = $derived(
    [
      { id: 'file', label: 'File', items: fileMenuItems },
      { id: 'edit', label: 'Edit', items: editMenuItems },
      { id: 'view', label: 'View', items: viewMenuItems },
      { id: 'workspace', label: 'Workspace', items: workspaceMenuItems },
      { id: 'note', label: 'Note', items: noteMenuItems },
      { id: 'help', label: 'Help', items: helpMenuItems }
    ].map((menu) => ({
      ...menu,
      items: cleanupSeparators(filterMenuItems(menu.items))
    }))
  );

  function toggleMenu(): void {
    if (!isOpen && buttonElement) {
      const rect = buttonElement.getBoundingClientRect();
      dropdownPosition = {
        top: rect.bottom + 4,
        left: rect.left
      };
    }
    isOpen = !isOpen;
    if (!isOpen) {
      activeSubmenu = null;
    }
  }

  function closeMenu(): void {
    isOpen = false;
    activeSubmenu = null;
  }

  function handleMenuHover(menuId: string): void {
    activeSubmenu = menuId;
  }

  function handleItemClick(item: MenuItemDef): void {
    if (item.type === 'separator') return;

    if (item.action) {
      // Handle navigation actions
      if (item.action.startsWith('navigate:')) {
        const view = item.action.replace('navigate:', '');
        if (isElectron()) {
          window.api?.triggerMenuNavigate(view);
        } else {
          // In web mode, dispatch a custom event
          window.dispatchEvent(new CustomEvent('menu-navigate', { detail: { view } }));
        }
      } else {
        if (isElectron()) {
          window.api?.triggerMenuAction(item.action);
        } else {
          // In web mode, dispatch a custom event
          window.dispatchEvent(
            new CustomEvent('menu-action', { detail: { action: item.action } })
          );
        }
      }
    }

    // Handle role-based actions in web mode (edit operations)
    if (item.role && isWeb()) {
      switch (item.role) {
        case 'undo':
          document.execCommand('undo');
          break;
        case 'cut':
          document.execCommand('cut');
          break;
        case 'copy':
          document.execCommand('copy');
          break;
        case 'paste':
          navigator.clipboard.readText().then((text) => {
            document.execCommand('insertText', false, text);
          });
          break;
        case 'delete':
          document.execCommand('delete');
          break;
        case 'selectAll':
          document.execCommand('selectAll');
          break;
        case 'resetZoom':
        case 'zoomIn':
        case 'zoomOut':
          // Browser handles these natively, dispatch event for reader
          window.dispatchEvent(
            new CustomEvent('menu-action', {
              detail: {
                action:
                  item.role === 'resetZoom'
                    ? 'zoom-reset'
                    : item.role === 'zoomIn'
                      ? 'zoom-in'
                      : 'zoom-out'
              }
            })
          );
          break;
      }
    }

    closeMenu();
  }

  // Close menu when clicking outside
  $effect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent): void {
      const target = event.target as Element;
      if (!target.closest('.hamburger-menu')) {
        closeMenu();
      }
    }

    // Delay to prevent immediate close
    setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 10);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  });

  // Close on escape
  $effect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        closeMenu();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  });
</script>

<div class="hamburger-menu">
  <button
    class="hamburger-button"
    class:open={isOpen}
    onclick={toggleMenu}
    bind:this={buttonElement}
    aria-label="Menu"
    aria-expanded={isOpen}
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
      <line x1="4" y1="6" x2="20" y2="6"></line>
      <line x1="4" y1="12" x2="20" y2="12"></line>
      <line x1="4" y1="18" x2="20" y2="18"></line>
    </svg>
  </button>

  {#if isOpen}
    <div
      class="menu-dropdown"
      style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px;"
    >
      <div class="menu-bar">
        {#each menus as menu (menu.id)}
          <button
            class="menu-bar-item"
            class:active={activeSubmenu === menu.id}
            onmouseenter={() => handleMenuHover(menu.id)}
            onclick={() => handleMenuHover(menu.id)}
          >
            {menu.label}
          </button>
        {/each}
      </div>

      {#if activeSubmenu}
        {@const activeMenu = menus.find((m) => m.id === activeSubmenu)}
        {#if activeMenu}
          <div class="submenu">
            {#each activeMenu.items as item, i (i)}
              {#if item.type === 'separator'}
                <div class="menu-separator"></div>
              {:else}
                <button class="menu-item" onclick={() => handleItemClick(item)}>
                  <span class="menu-item-label">{getLabel(item, 'win')}</span>
                  {#if item.accelerator}
                    <span class="menu-item-shortcut">
                      {convertAccelerator(item.accelerator, 'win')}
                    </span>
                  {/if}
                </button>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .hamburger-menu {
    position: relative;
    -webkit-app-region: no-drag;
  }

  .hamburger-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.15s ease;
  }

  .hamburger-button:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .hamburger-button.open {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .menu-dropdown {
    position: fixed;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px var(--shadow-medium);
    min-width: 200px;
    z-index: 1000;
    overflow: hidden;
  }

  .menu-bar {
    display: flex;
    gap: 0;
    padding: 0.25rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .menu-bar-item {
    padding: 0.375rem 0.625rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .menu-bar-item:hover,
  .menu-bar-item.active {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .submenu {
    padding: 0.25rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .menu-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: background 0.15s ease;
    gap: 1.5rem;
  }

  .menu-item:hover {
    background: var(--bg-hover);
  }

  .menu-item-label {
    flex: 1;
    white-space: nowrap;
  }

  .menu-item-shortcut {
    color: var(--text-muted);
    font-size: 0.6875rem;
    font-family: ui-monospace, monospace;
    white-space: nowrap;
  }

  .menu-separator {
    height: 1px;
    background: var(--border-light);
    margin: 0.25rem 0;
  }
</style>
