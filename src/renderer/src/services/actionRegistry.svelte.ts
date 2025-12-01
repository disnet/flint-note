/**
 * Action Registry Service
 *
 * Provides an extensible registry of actions that can be triggered from the Action Bar.
 * Actions can be menu commands, note operations, navigation, or custom actions.
 */

import {
  fileMenuItems,
  editMenuItems,
  viewMenuItems,
  noteMenuItems,
  helpMenuItems,
  getLabel,
  type MenuItemDef
} from '../../../shared/menu-definitions';

export interface Action {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  category:
    | 'file'
    | 'edit'
    | 'view'
    | 'note'
    | 'workspace'
    | 'help'
    | 'navigation'
    | 'custom';
  execute: () => void | Promise<void>;
  isEnabled?: () => boolean;
  isVisible?: () => boolean;
}

// Platform detection
const isMacOS = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const platform = isMacOS ? 'mac' : 'win';

// Convert accelerator to display format
function formatShortcut(accelerator: string | undefined): string | undefined {
  if (!accelerator) return undefined;

  if (isMacOS) {
    return accelerator
      .replace(/CmdOrCtrl/g, '⌘')
      .replace(/Cmd/g, '⌘')
      .replace(/Ctrl/g, '⌃')
      .replace(/Shift/g, '⇧')
      .replace(/Alt/g, '⌥')
      .replace(/\+/g, '');
  } else {
    return accelerator.replace(/CmdOrCtrl/g, 'Ctrl');
  }
}

// Registry state
let actions: Action[] = $state([]);

/**
 * Register a new action
 */
export function registerAction(action: Action): void {
  // Check for duplicate
  const existingIndex = actions.findIndex((a) => a.id === action.id);
  if (existingIndex >= 0) {
    // Replace existing action
    actions[existingIndex] = action;
  } else {
    actions.push(action);
  }
}

/**
 * Unregister an action by ID
 */
export function unregisterAction(id: string): void {
  actions = actions.filter((a) => a.id !== id);
}

/**
 * Get all visible actions
 */
export function getActions(): Action[] {
  return actions.filter((a) => !a.isVisible || a.isVisible());
}

/**
 * Search actions by query (fuzzy matching on label and description)
 */
export function searchActions(query: string): Action[] {
  const q = query.toLowerCase().trim();
  if (!q) return getActions();

  return getActions()
    .filter((action) => {
      const label = action.label.toLowerCase();
      const desc = (action.description || '').toLowerCase();
      const category = action.category.toLowerCase();

      // Check if query matches label, description, or category
      return label.includes(q) || desc.includes(q) || category.includes(q);
    })
    .sort((a, b) => {
      // Prioritize actions where label starts with query
      const aStarts = a.label.toLowerCase().startsWith(q);
      const bStarts = b.label.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      // Then prioritize label matches over description matches
      const aLabelMatch = a.label.toLowerCase().includes(q);
      const bLabelMatch = b.label.toLowerCase().includes(q);
      if (aLabelMatch && !bLabelMatch) return -1;
      if (bLabelMatch && !aLabelMatch) return 1;

      return a.label.localeCompare(b.label);
    });
}

/**
 * Convert menu items to actions and register them
 */
function registerMenuActions(
  items: MenuItemDef[],
  category: Action['category'],
  executeAction: (action: string) => void
): void {
  for (const item of items) {
    if (item.type === 'separator') continue;
    if (!item.action) continue; // Skip role-only items (handled by Electron)

    const label = getLabel(item, platform as 'mac' | 'win');
    const action: Action = {
      id: `menu:${item.action}`,
      label,
      shortcut: formatShortcut(item.accelerator),
      category,
      execute: () => executeAction(item.action!)
    };

    registerAction(action);
  }
}

/**
 * Initialize the registry with default actions
 * Call this once when the app starts, passing the menu action handler
 */
export function initializeRegistry(executeMenuAction: (action: string) => void): void {
  // Clear existing actions
  actions = [];

  // Register menu actions
  registerMenuActions(fileMenuItems, 'file', executeMenuAction);
  registerMenuActions(editMenuItems, 'edit', executeMenuAction);
  registerMenuActions(viewMenuItems, 'view', executeMenuAction);
  registerMenuActions(noteMenuItems, 'note', executeMenuAction);
  registerMenuActions(helpMenuItems, 'help', executeMenuAction);

  // Add some additional navigation actions with descriptions
  registerAction({
    id: 'nav:inbox',
    label: 'Go to Inbox',
    description: 'View your inbox notes',
    shortcut: formatShortcut('CmdOrCtrl+1'),
    category: 'navigation',
    execute: () => executeMenuAction('navigate:inbox')
  });

  registerAction({
    id: 'nav:daily',
    label: 'Go to Daily Notes',
    description: 'View daily notes',
    shortcut: formatShortcut('CmdOrCtrl+2'),
    category: 'navigation',
    execute: () => executeMenuAction('navigate:daily')
  });

  registerAction({
    id: 'nav:review',
    label: 'Go to Review',
    description: 'Review your notes',
    shortcut: formatShortcut('CmdOrCtrl+3'),
    category: 'navigation',
    execute: () => executeMenuAction('navigate:review')
  });

  registerAction({
    id: 'nav:settings',
    label: 'Open Settings',
    description: 'Configure application settings',
    shortcut: formatShortcut('CmdOrCtrl+6'),
    category: 'navigation',
    execute: () => executeMenuAction('navigate:settings')
  });
}

// Export reactive state for components
export const actionRegistry = {
  get actions() {
    return actions;
  },
  searchActions,
  registerAction,
  unregisterAction,
  initializeRegistry
};
