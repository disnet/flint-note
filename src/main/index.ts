import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { AIService } from './ai-service';
import { NoteService } from './note-service';
import { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on('ping', () => console.log('pong'));

  // Initialize AI service
  let aiService: AIService | null = null;
  try {
    aiService = new AIService();
    // Wait for MCP servers to initialize
    await aiService.waitForInitialization();
    console.log('AI Service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AI Service:', error);
    console.log('Falling back to mock responses');
  }

  // Initialize Note service
  let noteService: NoteService | null = null;
  try {
    noteService = new NoteService();
    await noteService.initialize();
    console.log('Note Service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Note Service:', error);
    console.log('Note operations will not be available');
  }

  // Chat handlers - now with real AI integration
  ipcMain.handle('send-message', async (_event, message: string) => {
    try {
      if (aiService) {
        // Use real AI service
        return await aiService.sendMessage(message);
      } else {
        // Fallback to mock responses if AI service failed to initialize
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const responses = [
          `Thanks for your message: "${message}"! (Note: AI service unavailable, using mock response)`,
          "I understand what you're saying. Let me help you with that. (Mock response)",
          "That's an interesting point. Here's what I think about it... (Mock response)",
          'I can help you with that. What would you like to know more about? (Mock response)',
          'Let me process that information for you. (Mock response)'
        ];

        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        return { text: randomResponse };
      }
    } catch (error) {
      console.error('Error processing message:', error);
      return {
        text: "I'm sorry, I encountered an error while processing your message. Please try again."
      };
    }
  });

  // Clear conversation history
  ipcMain.handle('clear-conversation', async () => {
    if (aiService) {
      aiService.clearConversation();
      return { success: true };
    }
    return { success: false, error: 'AI service not available' };
  });

  // Note operations handlers
  ipcMain.handle(
    'create-note',
    async (
      _event,
      type: string,
      identifier: string,
      content: string,
      vaultId?: string
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.createNote(type, identifier, content, vaultId);
    }
  );

  ipcMain.handle('get-note', async (_event, identifier: string, vaultId?: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.getNote(identifier, vaultId);
  });

  ipcMain.handle(
    'update-note',
    async (_event, identifier: string, content: string, vaultId?: string) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.updateNote(identifier, content, vaultId);
    }
  );

  ipcMain.handle('delete-note', async (_event, identifier: string, vaultId?: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.deleteNote(identifier, vaultId);
  });

  ipcMain.handle(
    'rename-note',
    async (_event, identifier: string, newIdentifier: string, vaultId?: string) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.renameNote(identifier, newIdentifier, vaultId);
    }
  );

  // Search operations
  ipcMain.handle(
    'search-notes',
    async (_event, query: string, vaultId?: string, limit?: number) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.searchNotes(query, vaultId, limit);
    }
  );

  ipcMain.handle(
    'search-notes-advanced',
    async (
      _event,
      params: {
        query: string;
        type?: string;
        tags?: string[];
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        vaultId?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.searchNotesAdvanced(params);
    }
  );

  // Note type operations
  ipcMain.handle('list-note-types', async (_event, vaultId?: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.listNoteTypes(vaultId);
  });

  ipcMain.handle(
    'create-note-type',
    async (
      _event,
      params: {
        typeName: string;
        description: string;
        agentInstructions?: string[];
        metadataSchema?: MetadataSchema;
        vaultId?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.createNoteType(params);
    }
  );

  ipcMain.handle(
    'list-notes-by-type',
    async (_event, type: string, vaultId?: string, limit?: number) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.listNotesByType(type, vaultId, limit);
    }
  );

  // Vault operations
  ipcMain.handle('list-vaults', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.listVaults();
  });

  ipcMain.handle('get-current-vault', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.getCurrentVault();
  });

  ipcMain.handle(
    'create-vault',
    async (_event, name: string, path: string, description?: string) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.createVault(name, path, description);
    }
  );

  ipcMain.handle('switch-vault', async (_event, vaultId: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.switchVault(vaultId);
  });

  // Link operations
  ipcMain.handle(
    'get-note-links',
    async (_event, identifier: string, vaultId?: string) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.getNoteLinks(identifier, vaultId);
    }
  );

  ipcMain.handle(
    'get-backlinks',
    async (_event, identifier: string, vaultId?: string) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.getBacklinks(identifier, vaultId);
    }
  );

  ipcMain.handle('find-broken-links', async (_event, vaultId?: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.findBrokenLinks(vaultId);
  });

  // Resource operations (MCP-style)
  ipcMain.handle('get-types-resource', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.getTypesResource();
  });

  ipcMain.handle('get-recent-resource', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.getRecentResource();
  });

  ipcMain.handle('get-stats-resource', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.getStatsResource();
  });

  // List MCP resources
  ipcMain.handle(
    'list-mcp-resources',
    async (_event, serverName: string = 'flint-note') => {
      if (!aiService) {
        console.error('AI service is not available');
        throw new Error('AI service not available - initialization may have failed');
      }

      if (!aiService.isInitialized()) {
        console.error('AI service is not initialized');
        throw new Error(
          'AI service not initialized - please wait for initialization to complete'
        );
      }

      try {
        const result = await aiService.listMcpResources(serverName);
        return result;
      } catch (error) {
        console.error('Error listing MCP resources:', error);
        console.error('Server was:', serverName);
        throw error;
      }
    }
  );

  // Generic MCP resource handler
  ipcMain.handle('fetch-mcp-resource', async (_event, uri: string) => {
    if (!aiService) {
      console.error('AI service is not available');
      throw new Error('AI service not available - initialization may have failed');
    }

    if (!aiService.isInitialized()) {
      console.error('AI service is not initialized');
      throw new Error(
        'AI service not initialized - please wait for initialization to complete'
      );
    }

    try {
      // Use the AI service to read the resource from the flint-note MCP server
      const result = await aiService.readMcpResource('flint-note', uri);
      return result;
    } catch (error) {
      console.error('Error fetching MCP resource:', error);
      console.error('URI was:', uri);
      throw error;
    }
  });

  // Service status
  ipcMain.handle('note-service-ready', async () => {
    return noteService?.isReady() || false;
  });

  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
