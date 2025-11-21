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
import { WorkflowService } from './workflow-service';
import { SecureStorageService } from './secure-storage-service';
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
import { AutoUpdaterService } from './auto-updater-service';
import { publishNoteEvent } from './note-events';
import { publishReviewEvent } from './review-events';
import { setupApplicationMenu } from './menu';

// Module-level service references
let noteService: NoteService | null = null;

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
  electronApp.setAppUserModelId('com.flintnote.flint');

  // Set up About panel
  app.setAboutPanelOptions({
    applicationName: 'Flint',
    applicationVersion: app.getVersion(),
    version: ''
  });

  // Set up the application menu
  setupApplicationMenu();

  // Initialize auto-updater service
  const autoUpdaterService = new AutoUpdaterService();

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
  try {
    noteService = new NoteService();
    await noteService.initialize();

    const status = noteService.getStatus();
    if (status.canPerformNoteOperations) {
      logger.info('Note Service initialized successfully with vault support');

      // Ensure default 'note' type exists in current vault
      try {
        const currentVault = await noteService.getCurrentVault();
        if (currentVault) {
          await noteService.ensureDefaultNoteType(currentVault.id);
        }
      } catch (error) {
        logger.warn('Failed to ensure default note type in current vault:', { error });
      }
    } else if (status.hasVaults) {
      logger.info('Note Service initialized but vault operations limited');
    } else {
      logger.info(
        'Note Service initialized in vault-management mode (no vaults available)'
      );
      logger.info('First-time user experience will be shown');
    }
  } catch (error) {
    logger.error('Failed to initialize Note Service', { error });
    logger.warn('Note operations will not be available');
    // Still create a basic noteService for vault management even if initialization fails
    if (!noteService) {
      noteService = new NoteService();
    }
  }

  // Initialize Secure Storage service
  const secureStorageService = new SecureStorageService();

  // Initialize Settings Storage service
  const settingsStorageService = new SettingsStorageService();
  await settingsStorageService.initialize();

  // Initialize Vault Data Storage service
  const vaultDataStorageService = new VaultDataStorageService();
  await vaultDataStorageService.initialize();

  // Initialize Workflow service
  let workflowService: WorkflowService | null = null;
  try {
    const db = noteService ? await noteService.getDatabaseConnection() : null;
    workflowService = new WorkflowService(noteService, db);
    logger.info('Workflow Service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Workflow Service', { error });
    logger.warn('Workflow operations will not be available');
  }

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

    aiService = await AIService.of(
      secureStorageService,
      noteService,
      workspaceRoot,
      workflowService
    );

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
      params: { message: string; conversationId?: string; model?: string }
    ) => {
      try {
        if (aiService) {
          // Ensure API key is loaded before attempting to send
          const apiKeyLoaded = await aiService.ensureApiKeyLoaded(secureStorageService);
          if (!apiKeyLoaded) {
            return {
              text: "⚠️ **API Key Required**\n\nIt looks like you haven't set up your OpenRouter API key yet. To use the AI assistant:\n\n1. Click the **Settings** button (⚙️) in the sidebar\n2. Go to **🔑 API Keys** section\n3. Add your OpenRouter API key\n\nOnce configured, you'll be able to chat with the AI assistant!"
            };
          }

          // Use real AI service
          return await aiService.sendMessage(
            params.message,
            params.conversationId,
            params.model
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
      }
    ) => {
      try {
        if (aiService) {
          // Ensure API key is loaded before attempting to stream
          const apiKeyLoaded = await aiService.ensureApiKeyLoaded(secureStorageService);
          if (!apiKeyLoaded) {
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
          aiService.on(
            'stream-tool-result',
            forwardEvent.bind(null, 'stream-tool-result')
          );
          aiService.once('stream-end', (data) => {
            forwardEvent('stream-end', data);
            // Clean up listeners after stream ends
            aiService.removeAllListeners('stream-chunk');
            aiService.removeAllListeners('stream-tool-call');
            aiService.removeAllListeners('stream-tool-result');
          });
          aiService.once('stream-error', (data) => {
            forwardEvent('stream-error', data);
            // Clean up listeners on error
            aiService.removeAllListeners('stream-chunk');
            aiService.removeAllListeners('stream-tool-call');
            aiService.removeAllListeners('stream-tool-result');
          });

          // Start the streaming
          await aiService.sendMessageStream(
            params.message,
            params.requestId,
            params.conversationId,
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

  // Cancel streaming message
  ipcMain.handle(
    'cancel-message-stream',
    async (_event, params: { requestId: string }) => {
      if (aiService) {
        const cancelled = aiService.cancelStream(params.requestId);
        return { success: cancelled };
      }
      return { success: false, error: 'AI service not available' };
    }
  );

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
      const result = await noteService.createNote(
        params.type,
        params.identifier,
        params.content,
        params.vaultId
      );

      // Publish event to renderer
      publishNoteEvent({
        type: 'note.created',
        note: {
          id: result.id,
          type: result.type,
          filename: result.filename,
          title: result.title,
          created: result.created,
          modified: result.created, // Use created timestamp for modified on new notes
          size: 0, // Will be calculated from content
          tags: [],
          path: result.path
        }
      });

      // If review was auto-enabled, publish review.enabled event
      if ('reviewAutoEnabled' in result && result.reviewAutoEnabled) {
        console.log(`[IPC] Publishing review.enabled event for ${result.id}`);
        publishReviewEvent({
          type: 'review.enabled',
          noteId: result.id
        });
      }

      return result;
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
        silent?: boolean; // Don't publish events for auto-save
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }

      console.log(
        `[IPC] update-note called for ${params.identifier}, silent: ${params.silent}`
      );

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      const result = await noteService.updateNote(
        params.identifier,
        params.content,
        vaultId,
        params.metadata
      );

      // Only publish event if not a silent update (auto-save)
      if (!params.silent) {
        console.log(`[IPC] Publishing note.updated event for ${params.identifier}`);
        publishNoteEvent({
          type: 'note.updated',
          noteId: params.identifier,
          updates: {
            modified: result.timestamp
          },
          source: 'user' // This comes from the UI, not the agent
        });
      } else {
        console.log(`[IPC] Suppressing note.updated event (silent mode)`);
      }

      return result;
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

      const result = await noteService.deleteNote(params.identifier, vaultId);

      // Publish event to renderer
      publishNoteEvent({
        type: 'note.deleted',
        noteId: params.identifier
      });

      return result;
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

      const result = await noteService.renameNote(
        params.identifier,
        params.newIdentifier,
        vaultId
      );

      // Publish event to renderer
      if (result.success && result.new_id) {
        // Fetch the renamed note to get updated metadata
        try {
          const renamedNote = await noteService.getNote(result.new_id, vaultId);
          if (renamedNote) {
            // Publish note.renamed event with full metadata
            publishNoteEvent({
              type: 'note.renamed',
              oldId: params.identifier,
              newId: result.new_id,
              title: renamedNote.title,
              filename: renamedNote.filename
            });

            // Also publish note.updated event with the new metadata
            publishNoteEvent({
              type: 'note.updated',
              noteId: result.new_id,
              updates: {
                title: renamedNote.title,
                filename: renamedNote.filename,
                modified: renamedNote.updated
              },
              source: 'user' // This comes from the UI, not the agent
            });
          }
        } catch (error) {
          logger.warn('Failed to fetch renamed note metadata:', { error });
        }

        // If wikilinks were updated in other notes, publish events to trigger UI refresh
        if (result.linksUpdated && result.linksUpdated > 0) {
          // Publish a general note.linksChanged event to refresh all open editors
          // This ensures wikilinks in all open notes are re-rendered with updated titles
          publishNoteEvent({
            type: 'note.linksChanged',
            noteId: result.new_id
          });
        }
      }

      return result;
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

      const result = await noteService.moveNote(
        params.identifier,
        params.newType,
        vaultId
      );

      // Publish event to renderer
      if (result.success) {
        publishNoteEvent({
          type: 'note.moved',
          noteId: result.new_id,
          oldType: result.old_type,
          newType: result.new_type
        });
      }

      return result;
    }
  );

  // Phase 3: Removed note:opened, note:closed, and note:expect-write IPC handlers
  // FileWriteQueue now handles all internal write tracking

  ipcMain.handle(
    'archive-note',
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

      const result = await noteService.archiveNote(params.identifier, vaultId);

      // Publish event to renderer
      publishNoteEvent({
        type: 'note.archived',
        noteId: result.id
      });

      return result;
    }
  );

  ipcMain.handle(
    'unarchive-note',
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

      const result = await noteService.unarchiveNote(params.identifier, vaultId);

      // Publish event to renderer
      publishNoteEvent({
        type: 'note.unarchived',
        noteId: result.id
      });

      return result;
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

  // Note suggestions operations
  ipcMain.handle(
    'note:getSuggestions',
    async (_event, params: { noteId: string; vaultId?: string }) => {
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

      const api = noteService.getFlintNoteApi();
      return await api.getNoteSuggestions(params.noteId);
    }
  );

  ipcMain.handle(
    'note:generateSuggestions',
    async (_event, params: { noteId: string; vaultId?: string }) => {
      if (!noteService || !aiService) {
        throw new Error('Note service or AI service not available');
      }

      // Ensure API key is loaded before attempting to generate
      const apiKeyLoaded = await aiService.ensureApiKeyLoaded(secureStorageService);
      if (!apiKeyLoaded) {
        throw new Error(
          'OpenRouter API key not configured. Please add your API key in Settings.'
        );
      }

      let vaultId = params.vaultId;
      if (!vaultId) {
        const currentVault = await noteService.getCurrentVault();
        if (!currentVault) {
          throw new Error('No vault available');
        }
        vaultId = currentVault.id;
      }

      const api = noteService.getFlintNoteApi();

      // Get note data for suggestions
      const noteData = await api.getNoteForSuggestions(params.noteId);
      if (!noteData) {
        throw new Error('Note not found');
      }

      // Get note type description
      const noteTypeInfo = await api.getNoteTypeInfo({
        type_name: noteData.type,
        vault_id: vaultId
      });

      // Generate suggestions using AI
      const suggestions = await aiService.generateNoteSuggestions(
        noteData.content,
        noteData.type,
        {
          purpose: noteTypeInfo?.purpose,
          agentInstructions: noteTypeInfo?.instructions?.join('\n')
        },
        noteTypeInfo?.suggestions_config?.prompt_guidance ||
          'Provide helpful suggestions to improve this note.',
        noteData.metadata
      );

      // Save suggestions
      return await api.saveNoteSuggestions(
        params.noteId,
        suggestions,
        'current' // TODO: Get actual model version
      );
    }
  );

  ipcMain.handle(
    'note:dismissSuggestion',
    async (
      _event,
      params: { noteId: string; suggestionId: string; vaultId?: string }
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

      const api = noteService.getFlintNoteApi();
      return await api.dismissNoteSuggestion(params.noteId, params.suggestionId);
    }
  );

  ipcMain.handle(
    'note:clearSuggestions',
    async (_event, params: { noteId: string; vaultId?: string }) => {
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

      const api = noteService.getFlintNoteApi();
      return await api.clearNoteSuggestions(params.noteId);
    }
  );

  ipcMain.handle(
    'note:updateSuggestionConfig',
    async (
      _event,
      params: {
        noteType: string;
        config: {
          enabled: boolean;
          prompt_guidance: string;
          suggestion_types?: string[];
        };
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

      const api = noteService.getFlintNoteApi();
      return await api.updateNoteTypeSuggestionConfig(params.noteType, params.config);
    }
  );

  ipcMain.handle(
    'note:updateDefaultReviewMode',
    async (
      _event,
      params: {
        noteType: string;
        defaultReviewMode: boolean;
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

      const api = noteService.getFlintNoteApi();
      return await api.updateNoteTypeDefaultReviewMode(
        vaultId,
        params.noteType,
        params.defaultReviewMode
      );
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
    'delete-note-type',
    async (
      _event,
      params: {
        typeName: string;
        action: 'error' | 'migrate' | 'delete';
        targetType?: string;
        vaultId: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.deleteNoteType(params);
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
        includeArchived?: boolean;
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

      return await noteService.listNotesByType(
        params.type,
        vaultId,
        params.limit,
        params.includeArchived
      );
    }
  );

  // Review operations (spaced repetition)
  ipcMain.handle('enable-review', async (_event, noteId: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    const result = await flintApi.enableReview({ noteId, vaultId: vault.id });

    // Publish event to renderer
    publishReviewEvent({
      type: 'review.enabled',
      noteId
    });

    return result;
  });

  ipcMain.handle('disable-review', async (_event, noteId: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    const result = await flintApi.disableReview({ noteId, vaultId: vault.id });

    // Publish event to renderer
    publishReviewEvent({
      type: 'review.disabled',
      noteId
    });

    return result;
  });

  ipcMain.handle('is-review-enabled', async (_event, noteId: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    const result = await flintApi.isReviewEnabled({ noteId, vaultId: vault.id });
    return { enabled: result };
  });

  ipcMain.handle('get-review-stats', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getReviewStats({ vaultId: vault.id });
  });

  ipcMain.handle('get-notes-for-review', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getNotesForReview({ vaultId: vault.id });
  });

  ipcMain.handle('generate-review-prompt', async (_event, noteId: string) => {
    if (!aiService) {
      throw new Error('AI service not available');
    }
    try {
      // Ensure API key is loaded before attempting to generate
      const apiKeyLoaded = await aiService.ensureApiKeyLoaded(secureStorageService);
      if (!apiKeyLoaded) {
        return {
          success: false,
          error: 'API key not configured',
          prompt: 'Explain the main concepts in this note in your own words.'
        };
      }

      const result = await aiService.generateReviewPrompt(noteId);
      return { success: true, ...result };
    } catch (error) {
      logger.error('Failed to generate review prompt', { error, noteId });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        prompt: 'Explain the main concepts in this note in your own words.'
      };
    }
  });

  ipcMain.handle(
    'analyze-review-response',
    async (_event, params: { noteId: string; prompt: string; userResponse: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      try {
        // Ensure API key is loaded before attempting to analyze
        const apiKeyLoaded = await aiService.ensureApiKeyLoaded(secureStorageService);
        if (!apiKeyLoaded) {
          return {
            success: false,
            error: 'API key not configured',
            feedback: {
              feedback: 'Thank you for your response.',
              error: 'Analysis failed - API key not configured'
            }
          };
        }

        const result = await aiService.analyzeReviewResponse(
          params.noteId,
          params.prompt,
          params.userResponse
        );
        return { success: true, feedback: result };
      } catch (error) {
        logger.error('Failed to analyze review response', {
          error,
          noteId: params.noteId
        });
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          feedback: {
            feedback: 'Thank you for your response.',
            error: 'Analysis failed'
          }
        };
      }
    }
  );

  ipcMain.handle(
    'complete-review',
    async (
      _event,
      params: {
        noteId: string;
        rating: 1 | 2 | 3 | 4;
        userResponse?: string;
        prompt?: string;
        feedback?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      const flintApi = noteService.getFlintNoteApi();
      const vault = await noteService.getCurrentVault();
      if (!vault) {
        throw new Error('No active vault');
      }
      return await flintApi.completeReview({
        noteId: params.noteId,
        vaultId: vault.id,
        rating: params.rating,
        userResponse: params.userResponse,
        prompt: params.prompt,
        feedback: params.feedback
      });
    }
  );

  ipcMain.handle('get-current-session', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getCurrentSession({ vaultId: vault.id });
  });

  ipcMain.handle('increment-session', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.incrementSession({ vaultId: vault.id });
  });

  ipcMain.handle('is-new-session-available', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.isNewSessionAvailable({ vaultId: vault.id });
  });

  ipcMain.handle('get-next-session-available-at', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getNextSessionAvailableAt({ vaultId: vault.id });
  });

  ipcMain.handle('get-review-config', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getReviewConfig({ vaultId: vault.id });
  });

  ipcMain.handle(
    'update-review-config',
    async (
      _event,
      config: {
        sessionSize?: number;
        sessionsPerWeek?: number;
        maxIntervalSessions?: number;
        minIntervalDays?: number;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      const flintApi = noteService.getFlintNoteApi();
      const vault = await noteService.getCurrentVault();
      if (!vault) {
        throw new Error('No active vault');
      }
      return await flintApi.updateReviewConfig({ vaultId: vault.id, config });
    }
  );

  ipcMain.handle('reactivate-note', async (_event, noteId: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.reactivateNote({ noteId, vaultId: vault.id });
  });

  ipcMain.handle('get-retired-items', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getRetiredItems({ vaultId: vault.id });
  });

  ipcMain.handle('get-review-item', async (_event, noteId: string) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getReviewItem({ noteId, vaultId: vault.id });
  });

  ipcMain.handle('get-all-review-history', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    const flintApi = noteService.getFlintNoteApi();
    const vault = await noteService.getCurrentVault();
    if (!vault) {
      throw new Error('No active vault');
    }
    return await flintApi.getAllReviewHistory({ vaultId: vault.id });
  });

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
        templateId?: string;
      }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.createVault(
        params.name,
        params.path,
        params.description,
        params.templateId
      );
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

  ipcMain.handle('list-templates', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.listTemplates();
  });

  // Reinitialize note service after vault creation/switching
  ipcMain.handle('reinitialize-note-service', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }

    try {
      const success = await noteService.retryInitialization();
      if (success) {
        logger.info('Note service successfully reinitialized after vault operation');

        // Ensure default note type exists in the new vault
        try {
          const currentVault = await noteService.getCurrentVault();
          if (currentVault) {
            await noteService.ensureDefaultNoteType(currentVault.id);
          }
        } catch (error) {
          logger.warn('Failed to ensure default note type after reinitialization:', {
            error
          });
        }
      }
      return { success, status: noteService.getStatus() };
    } catch (error) {
      logger.error('Failed to reinitialize note service:', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
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

  ipcMain.handle('get-openrouter-credits', async () => {
    if (!secureStorageService) {
      throw new Error('Secure storage service not available');
    }
    return await secureStorageService.getOpenRouterCredits();
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

  // Context usage monitoring handlers
  ipcMain.handle(
    'get-context-usage',
    async (_event, params?: { conversationId?: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      return await aiService.getContextUsage(params?.conversationId);
    }
  );

  ipcMain.handle(
    'can-accept-message',
    async (_event, params: { estimatedTokens: number; conversationId?: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      return await aiService.canAcceptMessage(
        params.estimatedTokens,
        params.conversationId
      );
    }
  );

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

  // UI State handlers
  ipcMain.handle(
    'load-ui-state',
    async (_event, params: { vaultId: string; stateKey: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.loadUIState(params.vaultId, params.stateKey);
    }
  );

  ipcMain.handle(
    'save-ui-state',
    async (
      _event,
      params: { vaultId: string; stateKey: string; stateValue: unknown }
    ) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      return await noteService.saveUIState(
        params.vaultId,
        params.stateKey,
        params.stateValue
      );
    }
  );

  ipcMain.handle('clear-ui-state', async (_event, params: { vaultId: string }) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    return await noteService.clearUIState(params.vaultId);
  });

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

  // Todo Plan IPC handlers
  ipcMain.handle(
    'todo-plan:get-active',
    async (_event, params: { conversationId: string }) => {
      if (!aiService) {
        throw new Error('AI service not available');
      }
      const todoPlanService = aiService.getTodoPlanService();
      return todoPlanService.getActivePlan(params.conversationId);
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

        // Check if the note exists before calling getOrCreateDailyNote
        const existingNote = await noteService.getOrCreateDailyNote(
          params.date,
          params.vaultId,
          false // Don't create, just check if it exists
        );
        const wasCreated = !existingNote && params.createIfMissing !== false;

        const result = await noteService.getOrCreateDailyNote(
          params.date,
          params.vaultId,
          params.createIfMissing
        );

        // If the note was just created, publish a note.created event
        if (wasCreated && result) {
          publishNoteEvent({
            type: 'note.created',
            note: {
              id: result.id,
              type: result.type,
              filename: result.filename,
              title: result.title,
              created: result.created,
              modified: result.updated,
              size: result.size || 0,
              tags: [],
              path: result.path
            }
          });
        }

        return result;
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

  // Inbox operations
  ipcMain.handle(
    'get-recent-unprocessed-notes',
    async (_event, params: { vaultId: string; daysBack?: number }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.getRecentUnprocessedNotes(
          params.vaultId,
          params.daysBack
        );
      } catch (error) {
        logger.error('Failed to get recent unprocessed notes', { error, params });
        throw error;
      }
    }
  );

  ipcMain.handle(
    'get-recent-processed-notes',
    async (_event, params: { vaultId: string; daysBack?: number }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.getRecentProcessedNotes(params.vaultId, params.daysBack);
      } catch (error) {
        logger.error('Failed to get recent processed notes', { error, params });
        throw error;
      }
    }
  );

  ipcMain.handle(
    'mark-note-as-processed',
    async (_event, params: { noteId: string; vaultId: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.markNoteAsProcessed(params.noteId, params.vaultId);
      } catch (error) {
        logger.error('Failed to mark note as processed', { error, params });
        throw error;
      }
    }
  );

  ipcMain.handle(
    'unmark-note-as-processed',
    async (_event, params: { noteId: string; vaultId: string }) => {
      if (!noteService) {
        throw new Error('Note service not available');
      }
      try {
        await noteService.initialize();
        return await noteService.unmarkNoteAsProcessed(params.noteId, params.vaultId);
      } catch (error) {
        logger.error('Failed to unmark note as processed', { error, params });
        throw error;
      }
    }
  );

  // Workflow operations
  ipcMain.handle('workflow:create', async (_event, input) => {
    if (!workflowService) {
      throw new Error('Workflow service not available');
    }
    try {
      return await workflowService.createWorkflow(input);
    } catch (error) {
      logger.error('Failed to create workflow', { error, input });
      throw error;
    }
  });

  ipcMain.handle('workflow:update', async (_event, input) => {
    if (!workflowService) {
      throw new Error('Workflow service not available');
    }
    try {
      return await workflowService.updateWorkflow(input);
    } catch (error) {
      logger.error('Failed to update workflow', { error, input });
      throw error;
    }
  });

  ipcMain.handle('workflow:delete', async (_event, workflowId: string) => {
    if (!workflowService) {
      throw new Error('Workflow service not available');
    }
    try {
      return await workflowService.deleteWorkflow(workflowId);
    } catch (error) {
      logger.error('Failed to delete workflow', { error, workflowId });
      throw error;
    }
  });

  ipcMain.handle('workflow:list', async (_event, input?) => {
    if (!workflowService) {
      throw new Error('Workflow service not available');
    }
    try {
      return await workflowService.listWorkflows(input);
    } catch (error) {
      logger.error('Failed to list workflows', { error, input });
      throw error;
    }
  });

  ipcMain.handle('workflow:get', async (_event, input) => {
    if (!workflowService) {
      throw new Error('Workflow service not available');
    }
    try {
      return await workflowService.getWorkflow(input);
    } catch (error) {
      logger.error('Failed to get workflow', { error, input });
      throw error;
    }
  });

  ipcMain.handle('workflow:complete', async (_event, input) => {
    if (!workflowService) {
      throw new Error('Workflow service not available');
    }
    try {
      return await workflowService.completeWorkflow(input);
    } catch (error) {
      logger.error('Failed to complete workflow', { error, input });
      throw error;
    }
  });

  ipcMain.handle(
    'workflow:add-material',
    async (_event, workflowId: string, material) => {
      if (!workflowService) {
        throw new Error('Workflow service not available');
      }
      try {
        return await workflowService.addSupplementaryMaterial(workflowId, material);
      } catch (error) {
        logger.error('Failed to add workflow material', { error, workflowId, material });
        throw error;
      }
    }
  );

  ipcMain.handle('workflow:remove-material', async (_event, materialId: string) => {
    if (!workflowService) {
      throw new Error('Workflow service not available');
    }
    try {
      return await workflowService.removeSupplementaryMaterial(materialId);
    } catch (error) {
      logger.error('Failed to remove workflow material', { error, materialId });
      throw error;
    }
  });

  // Database operations
  ipcMain.handle('rebuild-database', async (_event, params: { vaultId?: string }) => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    try {
      await noteService.initialize();
      return await noteService.rebuildDatabase(params.vaultId);
    } catch (error) {
      logger.error('Failed to rebuild database', { error, params });
      throw error;
    }
  });

  ipcMain.handle('get-migration-mapping', async () => {
    if (!noteService) {
      throw new Error('Note service not available');
    }
    try {
      await noteService.initialize();
      return await noteService.getMigrationMapping();
    } catch (error) {
      logger.error('Failed to get migration mapping', { error });
      throw error;
    }
  });

  // Clear vault-specific UI state (for migration purposes)
  ipcMain.handle('clear-vault-ui-state', async (_event, params: { vaultId: string }) => {
    try {
      logger.info('Clearing vault UI state for migration', { vaultId: params.vaultId });
      await vaultDataStorageService.clearVaultData(params.vaultId);
      logger.info('Vault UI state cleared successfully');
    } catch (error) {
      logger.error('Failed to clear vault UI state', { error, vaultId: params.vaultId });
      throw error;
    }
  });

  // Shell operations
  ipcMain.handle('show-item-in-folder', async (_event, params: { path: string }) => {
    try {
      shell.showItemInFolder(params.path);
      return { success: true };
    } catch (error) {
      logger.error('Failed to show item in folder', { error, path: params.path });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  createWindow();
  logger.info('Main window created and IPC handlers registered');

  // Set main window for auto-updater
  const mainWindow = BrowserWindow.getAllWindows()[0];
  if (mainWindow) {
    autoUpdaterService.setMainWindow(mainWindow);

    // Start periodic update checks (every 4 hours)
    autoUpdaterService.startPeriodicUpdateCheck(240);

    // Check for updates on startup (in production only)
    if (!is.dev) {
      autoUpdaterService.checkForUpdatesOnStartup();
    }
  }

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

// Flush pending file writes before quitting
// Part of Phase 1: Database-first architecture
let hasCompletedCleanup = false; // Phase 6 fix: Track cleanup completion
app.on('before-quit', async (event) => {
  // Phase 6 fix: If cleanup is done, allow immediate quit
  if (hasCompletedCleanup) {
    logger.info('Cleanup already completed, allowing quit');
    return; // Don't prevent default, let it quit
  }

  // First time through - do cleanup
  logger.info('App quitting, flushing pending file writes');
  event.preventDefault(); // Prevent quit until cleanup is done

  try {
    const api = noteService?.getFlintNoteApi();
    if (api) {
      // Phase 6 fix: Stop file watcher FIRST to prevent infinite loop
      // This prevents the watcher from reacting to flush writes during shutdown
      const fileWatcher = api.getFileWatcher();
      if (fileWatcher) {
        logger.info('Stopping file watcher before flush');
        await fileWatcher.stop();
      }

      // Now flush all pending writes from the file write queue
      await api.flushPendingWrites();
      logger.info('All pending file writes flushed successfully');
    }

    // Mark cleanup as complete
    hasCompletedCleanup = true;

    // Close all windows explicitly before quitting
    logger.info('Closing all browser windows');
    BrowserWindow.getAllWindows().forEach((window) => {
      window.destroy(); // Force close without waiting for renderer
    });

    logger.info('Triggering final quit');
    // Now quit - this will trigger before-quit again, but we'll allow it through
    app.quit();
  } catch (error) {
    logger.error('Error flushing pending writes on quit', { error });
    hasCompletedCleanup = true;
    // Force quit anyway to avoid hanging
    BrowserWindow.getAllWindows().forEach((window) => window.destroy());
    app.exit(0); // Force exit immediately
  }
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
