import { app, Menu, BrowserWindow, shell, nativeImage, ipcMain } from 'electron';

const isMac = process.platform === 'darwin';

// Track whether a note is currently active
let hasActiveNote = false;

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
  suggestions: createMenuIcon(
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path>'
  ),
  archive: createMenuIcon(
    '<polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line>'
  )
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
          accelerator: 'CmdOrCtrl+N',
          click: (): void => {
            sendToRenderer('menu-action', 'new-note');
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
          accelerator: 'CmdOrCtrl+O',
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
        {
          label: 'Toggle Metadata',
          accelerator: 'CmdOrCtrl+M',
          click: (): void => {
            sendToRenderer('menu-action', 'toggle-metadata');
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
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
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
        {
          label: 'Generate Suggestions',
          icon: menuIcons.suggestions,
          enabled: hasActiveNote,
          click: (): void => {
            sendToRenderer('menu-action', 'generate-suggestions');
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
          label: 'Documentation',
          click: async (): Promise<void> => {
            await shell.openExternal('https://flintnote.com');
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
}
