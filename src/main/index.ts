import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { AIService } from './ai-service';
import { NoteService } from './note-service';
import { SecureStorageService } from './secure-storage-service';
import type { MetadataSchema } from '@flint-note/server/dist/core/metadata-schema';
import { NoteMetadata } from '@flint-note/server';

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1800,
    height: 900,
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
  // mainWindow.webContents.openDevTools();
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

  // Initialize Secure Storage service
  const secureStorageService = new SecureStorageService();

  // Initialize AI service
  let aiService: AIService | null = null;
  try {
    aiService = await AIService.of(secureStorageService);
    // Wait for MCP servers to initialize
    // await aiService.waitForInitialization();
    console.log('AI Service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AI Service:', error);
    console.log('Falling back to mock responses');
  }

  // Chat handlers - now with real AI integration
  ipcMain.handle(
    'send-message',
    async (_event, params: { message: string; model?: string }) => {
      try {
        if (aiService) {
          // Use real AI service
          return await aiService.sendMessage(params.message, params.model);
        } else {
          // Fallback to mock responses if AI service failed to initialize
          await new Promise((resolve) => setTimeout(resolve, 1000));

          const responses = [
            `Thanks for your message: "${params.message}"! (Note: AI service unavailable, using mock response)`,
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
    }
  );

  // Streaming chat handler
  ipcMain.on(
    'send-message-stream',
    async (event, params: { message: string; model?: string; requestId: string }) => {
      try {
        if (aiService) {
          // Set up event forwarding from AI service to renderer
          const forwardEvent = (eventName: string, data: unknown): void => {
            event.sender.send(`ai-${eventName}`, data);
          };

          // Add temporary listeners for this stream
          aiService.once('stream-start', forwardEvent.bind(null, 'stream-start'));
          aiService.on('stream-chunk', forwardEvent.bind(null, 'stream-chunk'));
          aiService.on('stream-tool-call', forwardEvent.bind(null, 'stream-tool-call'));
          aiService.once('stream-end', (data) => {
            forwardEvent('stream-end', data);
            // Clean up listeners after stream ends
            aiService.removeAllListeners('stream-chunk');
            aiService.removeAllListeners('stream-tool-call');
          });
          aiService.once('stream-error', (data) => {
            forwardEvent('stream-error', data);
            // Clean up listeners on error
            aiService.removeAllListeners('stream-chunk');
            aiService.removeAllListeners('stream-tool-call');
          });

          // Start the streaming
          await aiService.sendMessageStream(
            params.message,
            params.requestId,
            params.model
          );
        } else {
          // Fallback mock streaming
          event.sender.send('ai-stream-start', { requestId: params.requestId });
          const mockResponse = `Mock streaming response for: "${params.message}"`;

          // Simulate streaming by sending chunks
          for (let i = 0; i < mockResponse.length; i += 5) {
            const chunk = mockResponse.slice(i, i + 5);
            event.sender.send('ai-stream-chunk', { requestId: params.requestId, chunk });
            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          event.sender.send('ai-stream-end', {
            requestId: params.requestId,
            fullText: mockResponse
          });
        }
      } catch (error) {
        console.error('Error processing streaming message:', error);
        event.sender.send('ai-stream-error', {
          requestId: params.requestId,
          error: 'Failed to process streaming message'
        });
      }
    }
  );

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
      params: {
        type: string;
        identifier: string;
        content: string;
        vaultId?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.createNote(
        params.type,
        params.identifier,
        params.content,
        params.vaultId
      );
    }
  );

  ipcMain.handle(
    'get-note',
    async (_event, params: { identifier: string; vaultId?: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.getNote(params.identifier, params.vaultId);
    }
  );

  ipcMain.handle(
    'update-note',
    async (
      _event,
      params: {
        identifier: string;
        content: string;
        vaultId?: string;
        metadata?: NoteMetadata;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.updateNote(
        params.identifier,
        params.content,
        params.vaultId,
        params.metadata
      );
    }
  );

  ipcMain.handle(
    'delete-note',
    async (_event, params: { identifier: string; vaultId?: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.deleteNote(params.identifier, params.vaultId);
    }
  );

  ipcMain.handle(
    'rename-note',
    async (
      _event,
      params: {
        identifier: string;
        newIdentifier: string;
        vaultId?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.renameNote(
        params.identifier,
        params.newIdentifier,
        params.vaultId
      );
    }
  );

  ipcMain.handle(
    'move-note',
    async (
      _event,
      params: {
        identifier: string;
        newType: string;
        vaultId?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.moveNote(
        params.identifier,
        params.newType,
        params.vaultId
      );
    }
  );

  // Search operations
  ipcMain.handle(
    'search-notes',
    async (
      _event,
      params: {
        query: string;
        vaultId?: string;
        limit?: number;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.searchNotes(params.query, params.vaultId, params.limit);
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
  ipcMain.handle('list-note-types', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.listNoteTypes();
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
    async (
      _event,
      params: {
        type: string;
        vaultId?: string;
        limit?: number;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.listNotesByType(params.type, params.vaultId, params.limit);
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
    async (
      _event,
      params: {
        name: string;
        path: string;
        description?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.createVault(params.name, params.path, params.description);
    }
  );

  ipcMain.handle('switch-vault', async (_event, params: { vaultId: string }) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.switchVault(params.vaultId);
  });

  // Link operations
  ipcMain.handle(
    'get-note-links',
    async (_event, params: { identifier: string; vaultId?: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.getNoteLinks(params.identifier, params.vaultId);
    }
  );

  ipcMain.handle(
    'get-backlinks',
    async (_event, params: { identifier: string; vaultId?: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.getBacklinks(params.identifier, params.vaultId);
    }
  );

  ipcMain.handle('find-broken-links', async (_event, params: { vaultId?: string }) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.findBrokenLinks(params.vaultId);
  });

  // Service status
  ipcMain.handle('note-service-ready', async () => {
    return noteService?.isReady() || false;
  });

  // Secure storage handlers
  ipcMain.handle('secure-storage-available', async () => {
    return secureStorageService?.isAvailable() || false;
  });

  ipcMain.handle(
    'store-api-key',
    async (
      _event,
      params: {
        provider: 'anthropic' | 'openai' | 'gateway';
        key: string;
        orgId?: string;
      }
    ) => {
      if (!secureStorageService) {
        throw new Error('Secure storage service not available');
      }
      return await secureStorageService.updateApiKey(
        params.provider,
        params.key,
        params.orgId
      );
    }
  );

  ipcMain.handle(
    'get-api-key',
    async (_event, params: { provider: 'anthropic' | 'openai' | 'gateway' }) => {
      if (!secureStorageService) {
        throw new Error('Secure storage service not available');
      }
      return await secureStorageService.getApiKey(params.provider);
    }
  );

  ipcMain.handle(
    'test-api-key',
    async (_event, params: { provider: 'anthropic' | 'openai' | 'gateway' }) => {
      if (!secureStorageService) {
        throw new Error('Secure storage service not available');
      }
      return await secureStorageService.testApiKey(params.provider);
    }
  );

  ipcMain.handle('get-all-api-keys', async () => {
    if (!secureStorageService) {
      throw new Error('Secure storage service not available');
    }
    const secureData = await secureStorageService.retrieveSecureData();
    return {
      anthropic: secureData.anthropicApiKey || '',
      openai: secureData.openaiApiKey || '',
      openaiOrgId: secureData.openaiOrgId || '',
      gateway: secureData.gatewayApiKey || ''
    };
  });

  ipcMain.handle('clear-api-keys', async () => {
    if (!secureStorageService) {
      throw new Error('Secure storage service not available');
    }
    return await secureStorageService.clearAllKeys();
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
