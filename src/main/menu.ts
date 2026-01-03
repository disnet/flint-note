import { app, Menu, BrowserWindow, nativeImage, ipcMain } from 'electron';

/**
 * IMPORTANT: Menu definitions should stay in sync with:
 * - src/shared/menu-definitions.ts (shared source of truth for basic items)
 * - src/renderer/src/components/HamburgerMenu.svelte (Windows/Linux custom menu)
 *
 * When adding/removing/modifying menu items, update all three locations.
 * The shared definitions file contains the canonical list of menu items.
 * This file has additional Electron-specific features (icons, dynamic states, etc.).
 */

const isMac = process.platform === 'darwin';

// Track whether a note is currently active
let hasActiveNote = false;

// Track whether an epub is currently being viewed
let hasActiveEpub = false;

// Track whether a pdf is currently being viewed
let hasActivePdf = false;

// Track whether multiple workspaces exist (for delete menu item)
let hasMultipleWorkspaces = false;

// Track workspace list for dynamic menu items
interface WorkspaceMenuItem {
  id: string;
  name: string;
  icon: string;
}
let workspaceList: WorkspaceMenuItem[] = [];
let activeWorkspaceId: string = '';

// Check if we should show developer tools
function shouldShowDevTools(): boolean {
  const isDev = !app.isPackaged;
  const isCanary = app.getVersion().toLowerCase().includes('canary');
  return isDev || isCanary;
}

// Helper to create menu icons from SVG
function createMenuIcon(svgPath: string): Electron.NativeImage {
  const svg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 });
}

// Menu icons
const menuIcons = {
  pin: createMenuIcon(
    '<path d="M12 17v5"></path><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"></path>'
  ),
  shelf: createMenuIcon(
    '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>'
  ),
  changeType: createMenuIcon(
    '<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"></path><path d="M7 7h.01"></path>'
  ),
  review: createMenuIcon(
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
  ),
  archive: createMenuIcon(
    '<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>'
  ),
  workspace: createMenuIcon(
    '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>'
  ),
  workspaceNew: createMenuIcon(
    '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><line x1="17.5" y1="14" x2="17.5" y2="21"></line><line x1="14" y1="17.5" x2="21" y2="17.5"></line>'
  ),
  workspaceEdit: createMenuIcon(
    '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>'
  ),
  workspaceDelete: createMenuIcon(
    '<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>'
  ),
  readerPrev: createMenuIcon('<polyline points="15 18 9 12 15 6"></polyline>'),
  readerNext: createMenuIcon('<polyline points="9 18 15 12 9 6"></polyline>')
};

/**
 * Send a message to the focused renderer window
 */
function sendToRenderer(channel: string, ...args: unknown[]): void {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    focusedWindow.webContents.send(channel, ...args);
  }
}

/**
 * Create the application menu
 */
export function createApplicationMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    // App Menu (macOS only)
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              {
                label: 'Check for Updates...',
                click: (): void => {
                  sendToRenderer('menu-action', 'check-updates');
                }
              },
              { type: 'separator' as const },
              {
                label: 'Settings...',
                accelerator: 'CmdOrCtrl+,',
                click: (): void => {
                  sendToRenderer('menu-navigate', 'settings');
                }
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: (): void => {
            sendToRenderer('menu-action', 'new-note');
          }
        },
        {
          label: 'New Deck',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: (): void => {
            sendToRenderer('menu-action', 'new-deck');
          }
        },
        {
          label: 'Import File... (PDF/EPUB)',
          click: (): void => {
            sendToRenderer('menu-action', 'import-file');
          }
        },
        {
          label: 'Capture Webpage...',
          click: (): void => {
            sendToRenderer('menu-action', 'import-webpage');
          }
        },
        {
          label: 'New Vault...',
          click: (): void => {
            sendToRenderer('menu-action', 'new-vault');
          }
        },
        { type: 'separator' },
        {
          label: 'Switch Vault',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: (): void => {
            sendToRenderer('menu-action', 'switch-vault');
          }
        },
        { type: 'separator' },
        {
          label: 'Show in Finder',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (): void => {
            sendToRenderer('menu-action', 'show-in-finder');
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const }
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const }
            ]),
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+K',
          click: (): void => {
            sendToRenderer('menu-action', 'find');
          }
        }
      ]
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Inbox',
          accelerator: 'CmdOrCtrl+1',
          click: (): void => {
            sendToRenderer('menu-navigate', 'inbox');
          }
        },
        {
          label: 'Daily',
          accelerator: 'CmdOrCtrl+2',
          click: (): void => {
            sendToRenderer('menu-navigate', 'daily');
          }
        },
        {
          label: 'Review',
          accelerator: 'CmdOrCtrl+3',
          click: (): void => {
            sendToRenderer('menu-navigate', 'review');
          }
        },
        {
          label: 'Routines',
          accelerator: 'CmdOrCtrl+4',
          click: (): void => {
            sendToRenderer('menu-navigate', 'routines');
          }
        },
        {
          label: 'Note Types',
          accelerator: 'CmdOrCtrl+5',
          click: (): void => {
            sendToRenderer('menu-navigate', 'note-types');
          }
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+6',
          click: (): void => {
            sendToRenderer('menu-navigate', 'settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: (): void => {
            sendToRenderer('menu-action', 'toggle-sidebar');
          }
        },
        {
          label: 'Focus Title',
          accelerator: 'CmdOrCtrl+E',
          click: (): void => {
            sendToRenderer('menu-action', 'focus-title');
          }
        },
        {
          label: 'Toggle Preview/Edit',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: (): void => {
            sendToRenderer('menu-action', 'toggle-preview');
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Agent Panel',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: (): void => {
            sendToRenderer('menu-action', 'toggle-agent');
          }
        },
        {
          label: 'Toggle Notes Shelf',
          accelerator: 'CmdOrCtrl+Shift+L',
          click: (): void => {
            sendToRenderer('menu-action', 'toggle-shelf');
          }
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: (): void => {
            sendToRenderer('menu-action', 'font-size-increase');
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: (): void => {
            sendToRenderer('menu-action', 'font-size-decrease');
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: (): void => {
            sendToRenderer('menu-action', 'font-size-reset');
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(shouldShowDevTools()
          ? [
              { type: 'separator' as const },
              {
                label: 'Toggle Developer Tools',
                accelerator: isMac ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
                click: (): void => {
                  const focusedWindow = BrowserWindow.getFocusedWindow();
                  if (focusedWindow) {
                    focusedWindow.webContents.toggleDevTools();
                  }
                }
              }
            ]
          : [])
      ]
    },

    // Workspace Menu
    {
      label: 'Workspace',
      submenu: [
        {
          label: 'New Workspace...',
          icon: menuIcons.workspaceNew,
          click: (): void => {
            sendToRenderer('menu-action', 'new-workspace');
          }
        },
        {
          label: 'Edit Current Workspace...',
          icon: menuIcons.workspaceEdit,
          click: (): void => {
            sendToRenderer('menu-action', 'edit-workspace');
          }
        },
        {
          label: 'Delete Current Workspace',
          icon: menuIcons.workspaceDelete,
          enabled: hasMultipleWorkspaces,
          click: (): void => {
            sendToRenderer('menu-action', 'delete-workspace');
          }
        },
        ...(workspaceList.length > 0
          ? [
              { type: 'separator' as const },
              ...workspaceList.map((workspace, index) => ({
                label: `${workspace.icon} ${workspace.name}`,
                type: 'checkbox' as const,
                checked: workspace.id === activeWorkspaceId,
                accelerator:
                  index < 9
                    ? isMac
                      ? `Ctrl+${index + 1}`
                      : `Alt+${index + 1}`
                    : undefined,
                click: (): void => {
                  sendToRenderer('menu-action', 'switch-workspace', workspace.id);
                }
              }))
            ]
          : [])
      ]
    },

    // Note Menu
    {
      label: 'Note',
      submenu: [
        {
          label: 'Pin/Unpin Note',
          accelerator: 'CmdOrCtrl+Shift+P',
          icon: menuIcons.pin,
          enabled: hasActiveNote,
          click: (): void => {
            sendToRenderer('menu-action', 'toggle-pin');
          }
        },
        {
          label: 'Add to Shelf',
          icon: menuIcons.shelf,
          enabled: hasActiveNote,
          click: (): void => {
            sendToRenderer('menu-action', 'add-to-shelf');
          }
        },
        {
          label: 'Change Type',
          accelerator: 'CmdOrCtrl+Shift+M',
          icon: menuIcons.changeType,
          enabled: hasActiveNote,
          click: (): void => {
            sendToRenderer('menu-action', 'change-type');
          }
        },
        { type: 'separator' },
        {
          label: 'Enable/Disable Review',
          icon: menuIcons.review,
          enabled: hasActiveNote,
          click: (): void => {
            sendToRenderer('menu-action', 'toggle-review');
          }
        },
        { type: 'separator' },
        {
          label: 'Archive',
          icon: menuIcons.archive,
          enabled: hasActiveNote,
          click: (): void => {
            sendToRenderer('menu-action', 'archive-note');
          }
        },
        { type: 'separator' },
        {
          label: 'Previous Page',
          accelerator: 'Left',
          icon: menuIcons.readerPrev,
          enabled: hasActiveEpub || hasActivePdf,
          click: (): void => {
            sendToRenderer('menu-action', 'reader-prev');
          }
        },
        {
          label: 'Next Page',
          accelerator: 'Right',
          icon: menuIcons.readerNext,
          enabled: hasActiveEpub || hasActivePdf,
          click: (): void => {
            sendToRenderer('menu-action', 'reader-next');
          }
        }
      ]
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [
              { type: 'separator' as const },
              { role: 'front' as const },
              { type: 'separator' as const },
              { role: 'window' as const }
            ]
          : [{ role: 'close' as const }])
      ]
    },

    // Help Menu
    {
      label: 'Help',
      submenu: [
        {
          label: "What's New",
          click: (): void => {
            sendToRenderer('menu-action', 'show-changelog');
          }
        },
        {
          label: 'Show Debug Logs in Finder',
          click: (): void => {
            sendToRenderer('menu-action', 'show-debug-logs');
          }
        },
        ...(!isMac
          ? [
              { type: 'separator' as const },
              {
                label: 'Check for Updates...',
                click: (): void => {
                  sendToRenderer('menu-action', 'check-updates');
                }
              },
              { type: 'separator' as const },
              {
                label: 'About',
                click: (): void => {
                  sendToRenderer('menu-action', 'show-about');
                }
              }
            ]
          : [])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  return menu;
}

/**
 * Set up the application menu
 */
export function setupApplicationMenu(): void {
  const menu = createApplicationMenu();
  Menu.setApplicationMenu(menu);

  // Listen for active note state changes from renderer
  ipcMain.on('menu-set-active-note', (_event, isActive: boolean) => {
    if (hasActiveNote !== isActive) {
      hasActiveNote = isActive;
      // Rebuild menu with updated state
      const updatedMenu = createApplicationMenu();
      Menu.setApplicationMenu(updatedMenu);
    }
  });

  // Listen for active epub state changes from renderer
  ipcMain.on('menu-set-active-epub', (_event, isActive: boolean) => {
    if (hasActiveEpub !== isActive) {
      hasActiveEpub = isActive;
      // Rebuild menu with updated state
      const updatedMenu = createApplicationMenu();
      Menu.setApplicationMenu(updatedMenu);
    }
  });

  // Listen for active pdf state changes from renderer
  ipcMain.on('menu-set-active-pdf', (_event, isActive: boolean) => {
    if (hasActivePdf !== isActive) {
      hasActivePdf = isActive;
      // Rebuild menu with updated state
      const updatedMenu = createApplicationMenu();
      Menu.setApplicationMenu(updatedMenu);
    }
  });

  // Listen for workspace list changes from renderer
  ipcMain.on(
    'menu-set-workspaces',
    (
      _event,
      data: {
        workspaces: WorkspaceMenuItem[];
        activeWorkspaceId: string;
      }
    ) => {
      const newHasMultiple = data.workspaces.length > 1;
      const listChanged =
        JSON.stringify(workspaceList) !== JSON.stringify(data.workspaces) ||
        activeWorkspaceId !== data.activeWorkspaceId;

      if (hasMultipleWorkspaces !== newHasMultiple || listChanged) {
        hasMultipleWorkspaces = newHasMultiple;
        workspaceList = data.workspaces;
        activeWorkspaceId = data.activeWorkspaceId;
        // Rebuild menu with updated state
        const updatedMenu = createApplicationMenu();
        Menu.setApplicationMenu(updatedMenu);
      }
    }
  );

  // Listen for menu trigger events from custom title bar menu (Windows/Linux)
  // These forward the action to the renderer, same as native menu clicks
  ipcMain.on('menu-trigger-navigate', (_event, view: string) => {
    sendToRenderer('menu-navigate', view);
  });

  ipcMain.on('menu-trigger-action', (_event, action: string, ...args: unknown[]) => {
    sendToRenderer('menu-action', action, ...args);
  });
}
