import { app, shell, BrowserWindow, ipcMain, Menu, dialog, nativeTheme } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { AIService } from './ai-service';
import { CustomFunctionsApi } from '../server/api/custom-functions-api.js';
import { ToolService } from './tool-service';

// Type for accessing private properties of AIService
type AIServiceWithPrivateProps = {
  customFunctionsApi: CustomFunctionsApi;
  toolService: ToolService;
};
import { NoteService } from './note-service';
import { SecureStorageService } from './secure-storage-service';
import { PinnedNotesStorageService } from './pinned-notes-storage-service';
import { SettingsStorageService } from './settings-storage-service';
import {
  VaultDataStorageService,
  type CursorPosition
} from './vault-data-storage-service';
import type {
  MetadataFieldDefinition,
  MetadataSchema
} from '../server/core/metadata-schema';
import type { NoteMetadata } from '../server/types';
import { logger } from './logger';

interface FrontendMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date | string;
  toolCalls?: unknown[];
}

function getThemeBackgroundColor(): string {
  // Return appropriate background color based on system theme
  return nativeTheme.shouldUseDarkColors ? '#1a1a1a' : '#ffffff';
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    backgroundColor: getThemeBackgroundColor(), // Dynamic theme background to prevent flash
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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

  // Handle context menu with spellcheck support
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const template: Electron.MenuItemConstructorOptions[] = [];

    // Add spellcheck suggestions if available
    if (params.misspelledWord) {
      params.dictionarySuggestions.forEach((suggestion) => {
        template.push({
          label: suggestion,
          click: () => {
            mainWindow.webContents.replaceMisspelling(suggestion);
          }
        });
      });

      // Add separator if we have suggestions
      if (params.dictionarySuggestions.length > 0) {
        template.push({ type: 'separator' });
      }

      // Add "Add to Dictionary" option
      template.push({
        label: 'Add to Dictionary',
        click: () => {
          mainWindow.webContents.session.addWordToSpellCheckerDictionary(
            params.misspelledWord
          );
        }
      });

      template.push({ type: 'separator' });
    }

    // Add standard editing options if text is selected or we're in an editable field
    if (params.isEditable) {
      if (params.editFlags.canUndo) {
        template.push({ role: 'undo' });
      }
      if (params.editFlags.canRedo) {
        template.push({ role: 'redo' });
      }
      if (template.length > 0) {
        template.push({ type: 'separator' });
      }

      if (params.editFlags.canCut) {
        template.push({ role: 'cut' });
      }
      if (params.editFlags.canCopy) {
        template.push({ role: 'copy' });
      }
      if (params.editFlags.canPaste) {
        template.push({ role: 'paste' });
      }
      if (params.editFlags.canSelectAll) {
        template.push({ type: 'separator' });
        template.push({ role: 'selectAll' });
      }
    } else if (params.selectionText) {
      // If text is selected but not in an editable field, just show copy
      template.push({ role: 'copy' });
    }

    // Only show menu if we have items
    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup({ window: mainWindow });
    }
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
  logger.info('Application ready, initializing main process');

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC test
  ipcMain.on('ping', () => logger.info('Received ping from renderer'));

  // Window control handlers
  ipcMain.on('window-minimize', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.minimize();
    }
  });

  ipcMain.on('window-maximize', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      if (focusedWindow.isMaximized()) {
        focusedWindow.unmaximize();
      } else {
        focusedWindow.maximize();
      }
    }
  });

  ipcMain.on('window-close', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.close();
    }
  });

  // Initialize Note service
  let noteService: NoteService | null = null;
  try {
    noteService = new NoteService();
    await noteService.initialize();
    logger.info('Note Service initialized successfully');

    // Ensure default 'note' type exists in current vault
    try {
      const currentVault = await noteService.getCurrentVault();
      if (currentVault) {
        await noteService.ensureDefaultNoteType(currentVault.id);
      } else {
        logger.warn('No current vault available - skipping default note type creation');
      }
    } catch (error) {
      logger.warn('Failed to ensure default note type in current vault:', { error });
    }
  } catch (error) {
    logger.error('Failed to initialize Note Service', { error });
    logger.warn('Note operations will not be available');
  }

  // Initialize Secure Storage service
  const secureStorageService = new SecureStorageService();

  // Initialize Pinned Notes Storage service
  const pinnedNotesStorageService = new PinnedNotesStorageService();

  // Initialize Settings Storage service
  const settingsStorageService = new SettingsStorageService();
  await settingsStorageService.initialize();

  // Initialize Vault Data Storage service
  const vaultDataStorageService = new VaultDataStorageService();
  await vaultDataStorageService.initialize();

  // Initialize AI service
  let aiService: AIService | null = null;
  try {
    // Get workspace root from current vault for custom functions support
    let workspaceRoot: string | undefined;
    if (noteService) {
      try {
        const currentVault = await noteService.getCurrentVault();
        if (currentVault) {
          workspaceRoot = currentVault.path;
          logger.info('Using workspace root for custom functions', { workspaceRoot });
        }
      } catch (error) {
        logger.warn('Could not get current vault for workspace root', { error });
      }
    }

    aiService = await AIService.of(secureStorageService, noteService, workspaceRoot);

    // Set up global usage tracking listener
    aiService.on('usage-recorded', (usageData) => {
      // Forward usage data to all renderer processes
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('ai-usage-recorded', usageData);
      });
    });

    // Wait for MCP servers to initialize
    // await aiService.waitForInitialization();
    logger.info('AI Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize AI Service', { error });
    logger.warn('Falling back to mock responses');
  }

  // Chat handlers - now with real AI integration
  ipcMain.handle(
    'send-message',
    async (
      _event,
      params: {
        message: string;
        conversationId?: string;
        model?: string;
        systemMessage?: string;
      }
    ) => {
      try {
        if (aiService) {
          // Check if API key is available before attempting to send
          const openrouterApiKey = (await secureStorageService.getApiKey('openrouter'))
            .key;
          if (!openrouterApiKey || openrouterApiKey.trim() === '') {
            return {
              text: "⚠️ **API Key Required**\n\nIt looks like you haven't set up your OpenRouter API key yet. To use the AI assistant:\n\n1. Click the **Settings** button (⚙️) in the sidebar\n2. Go to **🔑 API Keys** section\n3. Add your OpenRouter API key\n\nOnce configured, you'll be able to chat with the AI assistant!"
            };
          }

          // Use real AI service
          return await aiService.sendMessage(
            params.message,
            params.conversationId,
            params.model,
            params.systemMessage
          );
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
        logger.error('Error processing message', { error });
        return {
          text: "I'm sorry, I encountered an error while processing your message. Please try again."
        };
      }
    }
  );

  // Streaming chat handler
  ipcMain.on(
    'send-message-stream',
    async (
      event,
      params: {
        message: string;
        conversationId?: string;
        model?: string;
        requestId: string;
        systemMessage?: string;
      }
    ) => {
      try {
        if (aiService) {
          // Check if API key is available before attempting to stream
          const openrouterApiKey = (await secureStorageService.getApiKey('openrouter'))
            .key;
          if (!openrouterApiKey || openrouterApiKey.trim() === '') {
            const apiKeyErrorMessage =
              "⚠️ **API Key Required**\n\nIt looks like you haven't set up your OpenRouter API key yet. To use the AI assistant:\n\n1. Click the **Settings** button (⚙️) in the sidebar\n2. Go to **🔑 API Keys** section\n3. Add your OpenRouter API key\n\nOnce configured, you'll be able to chat with the AI assistant!";

            // Send as streaming response
            event.sender.send('ai-stream-start', { requestId: params.requestId });
            event.sender.send('ai-stream-chunk', {
              requestId: params.requestId,
              chunk: apiKeyErrorMessage
            });
            event.sender.send('ai-stream-end', {
              requestId: params.requestId,
              fullText: apiKeyErrorMessage
            });
            return;
          }

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
            params.conversationId,
            params.model,
            params.systemMessage
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
        logger.error('Error processing streaming message', { error });
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

  // Sync conversation from frontend
  ipcMain.handle(
    'sync-conversation',
    async (
      _event,
      params: {
        conversationId: string;
        messages: FrontendMessage[];
      }
    ) => {
      if (aiService) {
        aiService.syncConversationFromFrontend(params.conversationId, params.messages);
        return { success: true };
      }
      return { success: false, error: 'AI service not available' };
    }
  );

  // Set active conversation with sync
  ipcMain.handle(
    'set-active-conversation',
    async (
      _event,
      params: {
        conversationId: string;
        messages?: FrontendMessage[] | string;
      }
    ) => {
      if (aiService) {
        aiService.setActiveConversationWithSync(params.conversationId, params.messages);
        return { success: true };
      }
      return { success: false, error: 'AI service not available' };
    }
  );

  // Note operations handlers
  ipcMain.handle(
    'create-note',
    async (
      _event,
      params: {
        type: string;
        identifier: string;
        content: string;
        vaultId: string;
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

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.getNote(params.identifier, vaultId);
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

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.updateNote(
        params.identifier,
        params.content,
        vaultId,
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

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.deleteNote(params.identifier, vaultId);
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
      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.renameNote(
        params.identifier,
        params.newIdentifier,
        vaultId
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
      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.moveNote(params.identifier, params.newType, vaultId);
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
      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.searchNotes(params.query, vaultId, params.limit);
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
      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.searchNotesAdvanced({
        ...params,
        vaultId
      });
    }
  );

  // Note type operations
  ipcMain.handle('list-note-types', async (_event, params?: { vaultId: string }) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }

    let vaultId = params?.vaultId;
    if (!vaultId) {
      const currentVault = await noteService.getCurrentVault();
      if (!currentVault) {
        throw new Error('No vault available');
      }
      vaultId = currentVault.id;
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
        vaultId: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.createNoteType(params);
    }
  );

  ipcMain.handle(
    'get-note-type-info',
    async (_event, params: { typeName: string; vaultId?: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.getNoteTypeInfo({
        type_name: params.typeName,
        vault_id: vaultId
      });
    }
  );

  ipcMain.handle(
    'update-note-type',
    async (
      _event,
      params: {
        typeName: string;
        description?: string;
        instructions?: string[];
        metadataSchema?: MetadataFieldDefinition[];
        vaultId: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.updateNoteType(params);
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

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.listNotesByType(params.type, vaultId, params.limit);
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

  // Directory picker for vault creation
  ipcMain.handle('show-directory-picker', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Vault Directory'
    });

    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('remove-vault', async (_event, params: { vaultId: string }) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.removeVault(params.vaultId);
  });

  // Link operations
  ipcMain.handle(
    'get-note-links',
    async (_event, params: { identifier: string; vaultId?: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.getNoteLinks(params.identifier, vaultId);
    }
  );

  ipcMain.handle(
    'get-backlinks',
    async (_event, params: { identifier: string; vaultId?: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      return await noteService.getBacklinks(params.identifier, vaultId);
    }
  );

  ipcMain.handle('find-broken-links', async (_event, params: { vaultId?: string }) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }

    let vaultId = params.vaultId;
    if (!vaultId) {
      const currentVault = await noteService.getCurrentVault();
      if (!currentVault) {
        throw new Error('No vault available');
      }
      vaultId = currentVault.id;
    }
    return await noteService.findBrokenLinks(vaultId);
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
        provider: 'anthropic' | 'openai' | 'openrouter';
        key: string;
        orgId?: string;
      }
    ) => {
      if (!secureStorageService) {
        throw new Error('Secure storage service not available');
      }

      // Update the API key in secure storage
      await secureStorageService.updateApiKey(params.provider, params.key, params.orgId);

      // If this is an OpenRouter key update and AI service is available, refresh it
      if (params.provider === 'openrouter' && aiService) {
        try {
          await aiService.refreshApiKey(secureStorageService);
          logger.info('AI Service refreshed after OpenRouter API key update');
        } catch (error) {
          logger.error('Failed to refresh AI Service after API key update', { error });
          // Don't throw here - the key was still stored successfully
        }
      }

      return;
    }
  );

  ipcMain.handle(
    'get-api-key',
    async (_event, params: { provider: 'anthropic' | 'openai' | 'openrouter' }) => {
      if (!secureStorageService) {
        throw new Error('Secure storage service not available');
      }
      return await secureStorageService.getApiKey(params.provider);
    }
  );

  ipcMain.handle(
    'test-api-key',
    async (_event, params: { provider: 'anthropic' | 'openai' | 'openrouter' }) => {
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
      openrouter: secureData.openrouterApiKey || ''
    };
  });

  ipcMain.handle('clear-api-keys', async () => {
    if (!secureStorageService) {
      throw new Error('Secure storage service not available');
    }
    return await secureStorageService.clearAllKeys();
  });

  // Pinned notes storage handlers
  ipcMain.handle('load-pinned-notes', async (_event, params: { vaultId: string }) => {
    if (!pinnedNotesStorageService) {
      throw new Error('Pinned notes storage service not available');
    }
    return await pinnedNotesStorageService.loadPinnedNotes(params.vaultId);
  });

  ipcMain.handle(
    'save-pinned-notes',
    async (
      _event,
      params: {
        vaultId: string;
        notes: import('./pinned-notes-storage-service').PinnedNoteInfo[];
      }
    ) => {
      if (!pinnedNotesStorageService) {
        throw new Error('Pinned notes storage service not available');
      }
      return await pinnedNotesStorageService.savePinnedNotes(
        params.vaultId,
        params.notes
      );
    }
  );

  ipcMain.handle('clear-pinned-notes', async (_event, params: { vaultId: string }) => {
    if (!pinnedNotesStorageService) {
      throw new Error('Pinned notes storage service not available');
    }
    return await pinnedNotesStorageService.clearPinnedNotes(params.vaultId);
  });

  // Cache performance monitoring handlers
  ipcMain.handle('get-cache-metrics', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    return aiService.getCacheMetrics();
  });

  ipcMain.handle('get-cache-performance-snapshot', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    return aiService.getCachePerformanceSnapshot();
  });

  ipcMain.handle('get-cache-config', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    return aiService.getCacheConfig();
  });

  ipcMain.handle('set-cache-config', async (_event, config) => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    aiService.setCacheConfig(config);
    return aiService.getCacheConfig();
  });

  ipcMain.handle('get-cache-performance-report', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    return aiService.getCachePerformanceReport();
  });

  ipcMain.handle('get-cache-health-check', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    return aiService.getCacheHealthCheck();
  });

  ipcMain.handle('optimize-cache-config', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    return aiService.optimizeCacheConfig();
  });

  ipcMain.handle('reset-cache-metrics', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    aiService.resetCacheMetrics();
    return { success: true };
  });

  ipcMain.handle('start-performance-monitoring', async (_event, intervalMinutes = 30) => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    aiService.startPerformanceMonitoring(intervalMinutes);
    return { success: true };
  });

  ipcMain.handle('stop-performance-monitoring', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    aiService.stopPerformanceMonitoring();
    return { success: true };
  });

  ipcMain.handle('warmup-system-cache', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    await aiService.warmupSystemMessageCache();
    return { success: true };
  });

  // Global settings storage handlers
  ipcMain.handle('load-app-settings', async () => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.loadAppSettings({});
  });

  ipcMain.handle('save-app-settings', async (_event, settings: unknown) => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.saveAppSettings(settings);
  });

  ipcMain.handle('load-model-preference', async () => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.loadModelPreference();
  });

  ipcMain.handle('save-model-preference', async (_event, modelId: string) => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.saveModelPreference(modelId);
  });

  ipcMain.handle('load-sidebar-state', async () => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.loadSidebarState();
  });

  ipcMain.handle('save-sidebar-state', async (_event, collapsed: boolean) => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.saveSidebarState(collapsed);
  });

  ipcMain.handle('load-slash-commands', async () => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.loadSlashCommands([]);
  });

  ipcMain.handle('save-slash-commands', async (_event, commands: unknown) => {
    if (!settingsStorageService) {
      throw new Error('Settings storage service not available');
    }
    return await settingsStorageService.saveSlashCommands(commands);
  });

  // Vault-specific data storage handlers
  ipcMain.handle('load-conversations', async (_event, params: { vaultId: string }) => {
    if (!vaultDataStorageService) {
      throw new Error('Vault data storage service not available');
    }
    return await vaultDataStorageService.loadConversations(params.vaultId, {});
  });

  ipcMain.handle(
    'save-conversations',
    async (_event, params: { vaultId: string; conversations: unknown }) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.saveConversations(
        params.vaultId,
        params.conversations
      );
    }
  );

  ipcMain.handle('load-temporary-tabs', async (_event, params: { vaultId: string }) => {
    if (!vaultDataStorageService) {
      throw new Error('Vault data storage service not available');
    }
    return await vaultDataStorageService.loadTemporaryTabs(params.vaultId, []);
  });

  ipcMain.handle(
    'save-temporary-tabs',
    async (_event, params: { vaultId: string; tabs: unknown }) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.saveTemporaryTabs(params.vaultId, params.tabs);
    }
  );

  ipcMain.handle(
    'load-navigation-history',
    async (_event, params: { vaultId: string }) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.loadNavigationHistory(params.vaultId, []);
    }
  );

  ipcMain.handle(
    'save-navigation-history',
    async (_event, params: { vaultId: string; history: unknown }) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.saveNavigationHistory(
        params.vaultId,
        params.history
      );
    }
  );

  ipcMain.handle('load-active-note', async (_event, params: { vaultId: string }) => {
    if (!vaultDataStorageService) {
      throw new Error('Vault data storage service not available');
    }
    return await vaultDataStorageService.loadActiveNote(params.vaultId);
  });

  ipcMain.handle(
    'save-active-note',
    async (_event, params: { vaultId: string; noteId: string | null }) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.saveActiveNote(params.vaultId, params.noteId);
    }
  );

  ipcMain.handle('load-cursor-positions', async (_event, params: { vaultId: string }) => {
    if (!vaultDataStorageService) {
      throw new Error('Vault data storage service not available');
    }
    return await vaultDataStorageService.loadCursorPositions(params.vaultId);
  });

  ipcMain.handle(
    'save-cursor-positions',
    async (
      _event,
      params: { vaultId: string; positions: Record<string, CursorPosition> }
    ) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.saveCursorPositions(
        params.vaultId,
        params.positions
      );
    }
  );

  ipcMain.handle(
    'get-cursor-position',
    async (_event, params: { vaultId: string; noteId: string }) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.getCursorPosition(
        params.vaultId,
        params.noteId
      );
    }
  );

  ipcMain.handle(
    'set-cursor-position',
    async (
      _event,
      params: { vaultId: string; noteId: string; position: CursorPosition }
    ) => {
      if (!vaultDataStorageService) {
        throw new Error('Vault data storage service not available');
      }
      return await vaultDataStorageService.setCursorPosition(
        params.vaultId,
        params.noteId,
        params.position
      );
    }
  );

  // Custom functions handlers
  ipcMain.handle(
    'list-custom-functions',
    async (_event, params?: { tags?: string[]; searchQuery?: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      // Access the customFunctionsApi through reflection since it's private
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }
      return await customFunctionsApi.listFunctions(params || {});
    }
  );

  ipcMain.handle(
    'create-custom-function',
    async (
      _event,
      params: {
        name: string;
        description: string;
        parameters: Record<
          string,
          {
            type: string;
            description?: string;
            optional?: boolean;
            default?: unknown;
          }
        >;
        returnType: string;
        code: string;
        tags?: string[];
      }
    ) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }
      return await customFunctionsApi.registerFunction(params);
    }
  );

  ipcMain.handle(
    'get-custom-function',
    async (_event, params: { id?: string; name?: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }
      return await customFunctionsApi.getFunction(params);
    }
  );

  ipcMain.handle(
    'update-custom-function',
    async (
      _event,
      params: {
        id: string;
        name?: string;
        description?: string;
        parameters?: Record<
          string,
          {
            type: string;
            description?: string;
            optional?: boolean;
            default?: unknown;
          }
        >;
        returnType?: string;
        code?: string;
        tags?: string[];
      }
    ) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }
      return await customFunctionsApi.updateFunction(params);
    }
  );

  ipcMain.handle('delete-custom-function', async (_event, params: { id: string }) => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
      .customFunctionsApi;
    if (!customFunctionsApi) {
      throw new Error('Custom functions API not available');
    }
    return await customFunctionsApi.deleteFunction(params);
  });

  ipcMain.handle(
    'validate-custom-function',
    async (
      _event,
      params: {
        name: string;
        description: string;
        parameters: Record<
          string,
          {
            type: string;
            description?: string;
            optional?: boolean;
            default?: unknown;
          }
        >;
        returnType: string;
        code: string;
        tags?: string[];
      }
    ) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }
      return await customFunctionsApi.validateFunction(params);
    }
  );

  ipcMain.handle(
    'test-custom-function',
    async (
      _event,
      params: {
        functionId: string;
        parameters: Record<string, unknown>;
      }
    ) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }

      // For testing, we need to use the evaluate_note_code functionality
      // Get the function first to construct a test call
      const func = await customFunctionsApi.getFunction({ id: params.functionId });
      if (!func) {
        throw new Error(`Function with ID '${params.functionId}' not found`);
      }

      // Create test code that calls the custom function
      const paramValues = Object.entries(params.parameters)
        .map(([, value]) => JSON.stringify(value))
        .join(', ');

      const testCode = `
      async function main() {
        try {
          const result = await customFunctions.${func.name}(${paramValues});
          return {
            success: true,
            result: result,
            executionTime: Date.now() - startTime
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
            executionTime: Date.now() - startTime
          };
        }
      }
      const startTime = Date.now();
      return await main();
    `;

      // Use the toolService to execute the code with custom functions
      const toolService = (aiService as unknown as AIServiceWithPrivateProps).toolService;
      const tools = toolService.getTools();
      if (!tools?.evaluate_note_code) {
        throw new Error('Code evaluation tool not available');
      }

      const evaluateResult = await (
        tools.evaluate_note_code.execute as (args: {
          code: string;
          typesOnly: boolean;
        }) => Promise<{
          success: boolean;
          data?: { result: unknown; executionTime: number };
          error?: string;
        }>
      )({
        code: testCode,
        typesOnly: false
      });

      return {
        success: evaluateResult.success,
        result:
          evaluateResult.success && evaluateResult.data
            ? evaluateResult.data.result
            : undefined,
        error: evaluateResult.success ? undefined : evaluateResult.error,
        executionTime:
          evaluateResult.success && evaluateResult.data
            ? evaluateResult.data.executionTime || 0
            : 0
      };
    }
  );

  ipcMain.handle(
    'get-custom-function-stats',
    async (_event, params?: { functionId?: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }
      return await customFunctionsApi.getExecutionStats(params || {});
    }
  );

  ipcMain.handle('export-custom-functions', async () => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
      .customFunctionsApi;
    if (!customFunctionsApi) {
      throw new Error('Custom functions API not available');
    }
    return await customFunctionsApi.exportFunctions();
  });

  ipcMain.handle(
    'import-custom-functions',
    async (_event, params: { backupData: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const customFunctionsApi = (aiService as unknown as AIServiceWithPrivateProps)
        .customFunctionsApi;
      if (!customFunctionsApi) {
        throw new Error('Custom functions API not available');
      }
      return await customFunctionsApi.importFunctions(params.backupData);
    }
  );

  // Daily View IPC handlers
  ipcMain.handle(
    'get-or-create-daily-note',
    async (
      _event,
      params: { date: string; vaultId: string; createIfMissing?: boolean }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.getOrCreateDailyNote(
          params.date,
          params.vaultId,
          params.createIfMissing
        );
      } catch (error) {
        logger.error('Failed to get/create daily note', { error, params });
        throw error;
      }
    }
  );

  ipcMain.handle(
    'get-week-data',
    async (_event, params: { startDate: string; vaultId: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.getWeekData(params.startDate, params.vaultId);
      } catch (error) {
        logger.error('Failed to get week data', { error, params });
        throw error;
      }
    }
  );

  ipcMain.handle(
    'get-notes-by-date',
    async (_event, params: { date: string; vaultId: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.getNotesByDate(params.date, params.vaultId);
      } catch (error) {
        logger.error('Failed to get notes by date', { error, params });
        throw error;
      }
    }
  );

  ipcMain.handle(
    'update-daily-note',
    async (_event, params: { date: string; content: string; vaultId: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.updateDailyNote(
          params.date,
          params.content,
          params.vaultId
        );
      } catch (error) {
        logger.error('Failed to update daily note', { error, params });
        throw error;
      }
    }
  );

  createWindow();
  logger.info('Main window created and IPC handlers registered');

  // Listen for system theme changes and update window background
  nativeTheme.on('updated', () => {
    const newBackgroundColor = getThemeBackgroundColor();
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((window) => {
      window.setBackgroundColor(newBackgroundColor);
    });
    logger.info(`Theme changed, updated window background to: ${newBackgroundColor}`);
  });

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('Reactivating application, creating new window');
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  logger.info('All windows closed');
  if (process.platform !== 'darwin') {
    logger.info('Quitting application');
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
