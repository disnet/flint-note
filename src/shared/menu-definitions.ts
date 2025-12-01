/**
 * Shared menu definitions used by both:
 * - src/main/menu.ts (Electron native menu)
 * - src/renderer/src/components/HamburgerMenu.svelte (Windows/Linux custom menu)
 *
 * When updating menus, update this file and both consumers will stay in sync.
 */

export type MenuItemDef =
  | {
      type?: undefined;
      label: string;
      accelerator?: string;
      action?: string;
      role?: string;
      // Platform-specific label override
      labelMac?: string;
      labelWin?: string;
    }
  | {
      type: 'separator';
    };

export interface MenuDef {
  label: string;
  items: MenuItemDef[];
}

/**
 * File menu items
 */
export const fileMenuItems: MenuItemDef[] = [
  { label: 'New Note', accelerator: 'CmdOrCtrl+Shift+N', action: 'new-note' },
  { label: 'Import File...', action: 'import-file' },
  { label: 'Capture Webpage...', action: 'import-webpage' },
  { label: 'New Vault...', action: 'new-vault' },
  { type: 'separator' },
  { label: 'Switch Vault', accelerator: 'CmdOrCtrl+Shift+O', action: 'switch-vault' },
  { type: 'separator' },
  {
    label: 'Show in Finder',
    labelWin: 'Show in Explorer',
    accelerator: 'CmdOrCtrl+Shift+R',
    action: 'show-in-finder'
  }
];

/**
 * Edit menu items
 */
export const editMenuItems: MenuItemDef[] = [
  { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
  { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', action: 'redo' },
  { type: 'separator' },
  { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
  { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
  { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
  { label: 'Delete', role: 'delete' },
  { type: 'separator' },
  { label: 'Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
  { type: 'separator' },
  { label: 'Find', accelerator: 'CmdOrCtrl+K', action: 'find' }
];

/**
 * View menu items
 */
export const viewMenuItems: MenuItemDef[] = [
  { label: 'Inbox', accelerator: 'CmdOrCtrl+1', action: 'navigate:inbox' },
  { label: 'Daily', accelerator: 'CmdOrCtrl+2', action: 'navigate:daily' },
  { label: 'Review', accelerator: 'CmdOrCtrl+3', action: 'navigate:review' },
  { label: 'Routines', accelerator: 'CmdOrCtrl+4', action: 'navigate:routines' },
  { label: 'Note Types', accelerator: 'CmdOrCtrl+5', action: 'navigate:note-types' },
  { label: 'Settings', accelerator: 'CmdOrCtrl+6', action: 'navigate:settings' },
  { type: 'separator' },
  { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', action: 'toggle-sidebar' },
  { label: 'Focus Title', accelerator: 'CmdOrCtrl+E', action: 'focus-title' },
  {
    label: 'Toggle Preview/Edit',
    accelerator: 'CmdOrCtrl+Shift+E',
    action: 'toggle-preview'
  },
  { label: 'Toggle Metadata', accelerator: 'CmdOrCtrl+M', action: 'toggle-metadata' },
  { type: 'separator' },
  {
    label: 'Toggle Agent Panel',
    accelerator: 'CmdOrCtrl+Shift+A',
    action: 'toggle-agent'
  },
  {
    label: 'Toggle Notes Shelf',
    accelerator: 'CmdOrCtrl+Shift+L',
    action: 'toggle-shelf'
  },
  { type: 'separator' },
  { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
  { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
  { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
  { type: 'separator' },
  { label: 'Toggle Full Screen', accelerator: 'F11', role: 'togglefullscreen' }
];

/**
 * Workspace menu items
 */
export const workspaceMenuItems: MenuItemDef[] = [
  { label: 'New Workspace...', action: 'new-workspace' },
  { label: 'Edit Current Workspace...', action: 'edit-workspace' },
  { label: 'Delete Current Workspace', action: 'delete-workspace' }
];

/**
 * Note menu items
 */
export const noteMenuItems: MenuItemDef[] = [
  { label: 'Pin/Unpin Note', accelerator: 'CmdOrCtrl+Shift+P', action: 'toggle-pin' },
  { label: 'Add to Shelf', action: 'add-to-shelf' },
  { label: 'Change Type', accelerator: 'CmdOrCtrl+Shift+M', action: 'change-type' },
  { type: 'separator' },
  { label: 'Enable/Disable Review', action: 'toggle-review' },
  { label: 'Generate Suggestions', action: 'generate-suggestions' },
  { type: 'separator' },
  { label: 'Archive', action: 'archive-note' }
];

/**
 * Window menu items (platform-specific handling needed)
 */
export const windowMenuItems: MenuItemDef[] = [
  { label: 'Minimize', role: 'minimize' },
  { label: 'Zoom', role: 'zoom' },
  { type: 'separator' },
  { label: 'Close', role: 'close' }
];

/**
 * Help menu items
 */
export const helpMenuItems: MenuItemDef[] = [
  { label: 'Documentation', action: 'open-docs' },
  { label: "What's New", action: 'show-changelog' },
  { type: 'separator' },
  { label: 'Check for Updates...', action: 'check-updates' },
  { type: 'separator' },
  { label: 'About', action: 'show-about' }
];

/**
 * Convert CmdOrCtrl to platform-specific accelerator
 */
export function convertAccelerator(accelerator: string, platform: 'mac' | 'win'): string {
  if (platform === 'mac') {
    return accelerator
      .replace(/CmdOrCtrl/g, 'Cmd')
      .replace(/Ctrl\+/g, '⌘')
      .replace(/Shift\+/g, '⇧')
      .replace(/Alt\+/g, '⌥');
  } else {
    return accelerator.replace(/CmdOrCtrl/g, 'Ctrl');
  }
}

/**
 * Get platform-specific label
 */
export function getLabel(item: MenuItemDef, platform: 'mac' | 'win'): string {
  if (item.type === 'separator') return '';
  if (platform === 'mac' && item.labelMac) return item.labelMac;
  if (platform === 'win' && item.labelWin) return item.labelWin;
  return item.label;
}
