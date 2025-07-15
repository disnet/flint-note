import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { readFile, writeFile, watch, FSWatcher } from 'fs';
import { promisify } from 'util';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { LLMService, FLINT_SYSTEM_PROMPT, LLMMessage } from './services/llmService';
import { settingsService } from './services/settingsService';
import { flintApiService } from './services/flintApiService';
// MCP service is initialized within LLMService
// import { mcpService } from './services/mcpService';

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

// File watchers management
const fileWatchers: Map<string, FSWatcher> = new Map();

// Initialize LLM service (will be properly initialized after settings load)
const llmService = new LLMService();

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1500,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.webContents.openDevTools();

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

  // Initialize settings service and LLM service with persisted settings
  try {
    await settingsService.loadSettings();
    await llmService.initialize();
    console.log('✅ Settings and LLM service initialized');
    console.log('📁 Settings file location:', settingsService.getSettingsPath());
  } catch (error) {
    console.error('❌ Error initializing settings:', error);
  }

  // Initialize FlintNote API service
  try {
    await flintApiService.initialize();
    console.log('✅ FlintNote API service initialized');
  } catch (error) {
    console.error('❌ Error initializing FlintNote API service:', error);
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // IPC handlers
  ipcMain.on('ping', () => console.log('pong'));

  // LLM IPC handlers
  ipcMain.handle('llm:generate-response', async (_, messages: LLMMessage[]) => {
    try {
      // Add system prompt if not present
      const messagesWithSystem = messages.some((msg) => msg.role === 'system')
        ? messages
        : [{ role: 'system' as const, content: FLINT_SYSTEM_PROMPT }, ...messages];

      const response = await llmService.generateResponse(messagesWithSystem);
      return { success: true, data: response };
    } catch (error) {
      console.error('Error generating response:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('llm:stream-response', async (event, messages: LLMMessage[]) => {
    try {
      // Add system prompt if not present
      const messagesWithSystem = messages.some((msg) => msg.role === 'system')
        ? messages
        : [{ role: 'system' as const, content: FLINT_SYSTEM_PROMPT }, ...messages];

      let fullResponse = '';

      await llmService.streamResponse(messagesWithSystem, (chunk) => {
        fullResponse += chunk;
        event.sender.send('llm:stream-chunk', chunk);
      });

      event.sender.send('llm:stream-end', fullResponse);
      return { success: true };
    } catch (error) {
      console.error('Error streaming response:', error);
      event.sender.send(
        'llm:stream-error',
        error instanceof Error ? error.message : 'Unknown error'
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'llm:stream-response-with-tools',
    async (event, messages: LLMMessage[]) => {
      try {
        // Add system prompt if not present
        const messagesWithSystem = messages.some((msg) => msg.role === 'system')
          ? messages
          : [{ role: 'system' as const, content: FLINT_SYSTEM_PROMPT }, ...messages];

        const result = await llmService.streamResponseWithToolCalls(
          messagesWithSystem,
          (chunk) => {
            event.sender.send('llm:stream-chunk', chunk);
          }
        );

        event.sender.send('llm:stream-end-with-tools', result);
        return { success: true, result };
      } catch (error) {
        console.error('Error streaming response with tools:', error);
        event.sender.send(
          'llm:stream-error',
          error instanceof Error ? error.message : 'Unknown error'
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    'llm:get-final-response-after-tools',
    async (_, originalMessages: LLMMessage[], toolCallInfos: any[]) => {
      try {
        const finalResponse = await llmService.getFinalResponseAfterToolExecution(
          originalMessages,
          toolCallInfos
        );
        return { success: true, response: finalResponse };
      } catch (error) {
        console.error('Error getting final response after tools:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('llm:test-connection', async () => {
    try {
      const isConnected = await llmService.testConnection();
      return { success: true, connected: isConnected };
    } catch (error) {
      console.error('Error testing LLM connection:', error);
      return {
        success: false,
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('llm:update-config', async (_, config) => {
    try {
      await llmService.updateConfig(config);
      return { success: true };
    } catch (error) {
      console.error('Error updating LLM config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('llm:get-config', async () => {
    try {
      const config = llmService.getConfig();
      return { success: true, config };
    } catch (error) {
      console.error('Error getting LLM config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // MCP IPC handlers
  ipcMain.handle('mcp:get-tools', async () => {
    try {
      const tools = await llmService.getAvailableTools();
      return { success: true, tools };
    } catch (error) {
      console.error('Error getting MCP tools:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('mcp:is-enabled', async () => {
    try {
      const enabled = llmService.isMCPEnabled();
      return { success: true, enabled };
    } catch (error) {
      console.error('Error checking MCP status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('mcp:set-enabled', async (_, enabled: boolean) => {
    try {
      await llmService.setMCPToolsEnabled(enabled);
      return { success: true };
    } catch (error) {
      console.error('Error setting MCP enabled:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // MCP Connection management handlers
  ipcMain.handle('mcp:get-status', async () => {
    try {
      const status = await llmService.getMCPConnectionStatus();
      return { success: true, status };
    } catch (error) {
      console.error('Error getting MCP connection status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('mcp:reconnect', async () => {
    try {
      await llmService.reconnectMCP();
      return { success: true };
    } catch (error) {
      console.error('Error reconnecting MCP:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('mcp:test-connection', async () => {
    try {
      const result = await llmService.testMCPConnection();
      return { success: true, result };
    } catch (error) {
      console.error('Error testing MCP connection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Direct MCP tool call handler
  ipcMain.handle(
    'mcp:call-tool',
    async (_, toolCall: { name: string; arguments: Record<string, unknown> }) => {
      try {
        const result = await llmService.callMCPTool(toolCall);
        return result;
      } catch (error) {
        console.error('Error calling MCP tool:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // MCP Resource handlers
  ipcMain.handle('mcp:list-resources', async () => {
    try {
      const resources = await llmService.getMCPResources();
      return { success: true, resources };
    } catch (error) {
      console.error('Error getting MCP resources:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('mcp:read-resource', async (_, uri: string) => {
    try {
      const content = await llmService.readMCPResource(uri);
      return { success: true, content };
    } catch (error) {
      console.error('Error reading MCP resource:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Tool limit configuration handlers
  ipcMain.handle('llm:set-max-tools', async (_, limit: number) => {
    try {
      await llmService.setMaxToolsLimit(limit);
      return { success: true };
    } catch (error) {
      console.error('Error setting max tools limit:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('llm:get-max-tools', async () => {
    try {
      const limit = llmService.getMaxToolsLimit();
      return { success: true, limit };
    } catch (error) {
      console.error('Error getting max tools limit:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // Settings debugging handler
  ipcMain.handle('settings:get-path', async () => {
    try {
      const path = settingsService.getSettingsPath();
      return { success: true, path };
    } catch (error) {
      console.error('Error getting settings path:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  // FlintNote API handlers
  ipcMain.handle(
    'flint-api:get-note',
    async (_, identifier: string, vaultId?: string) => {
      try {
        const note = await flintApiService.getNote(identifier, vaultId);
        return { success: true, note };
      } catch (error) {
        console.error('Error getting note via FlintNote API:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    'flint-api:update-note-content',
    async (_, identifier: string, content: string, vaultId?: string) => {
      try {
        const result = await flintApiService.updateNoteContent(
          identifier,
          content,
          vaultId
        );
        return { success: true, result };
      } catch (error) {
        console.error('Error updating note content via FlintNote API:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    'flint-api:create-simple-note',
    async (_, type: string, identifier: string, content: string, vaultId?: string) => {
      try {
        const result = await flintApiService.createSimpleNote(
          type,
          identifier,
          content,
          vaultId
        );
        return { success: true, result };
      } catch (error) {
        console.error('Error creating simple note via FlintNote API:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle(
    'flint-api:search-notes',
    async (
      _,
      query: string,
      options: {
        type_filter?: string;
        limit?: number;
        use_regex?: boolean;
        vaultId?: string;
        fields?: string[];
      } = {}
    ) => {
      try {
        const result = await flintApiService.searchNotes(query, options);
        return { success: true, result };
      } catch (error) {
        console.error('Error searching notes via FlintNote API:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  ipcMain.handle('flint-api:get-status', async () => {
    try {
      const isReady = flintApiService.isReady();
      const config = flintApiService.getConfig();
      return { success: true, isReady, config };
    } catch (error) {
      console.error('Error getting FlintNote API status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('flint-api:test-connection', async () => {
    try {
      const result = await flintApiService.testConnection();
      return { success: true, result };
    } catch (error) {
      console.error('Error testing FlintNote API connection:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle(
    'flint-api:search-notes-advanced',
    async (
      _,
      options: {
        query?: string;
        type?: string;
        metadata_filters?: Array<{
          key: string;
          value: string;
          operator?: string;
        }>;
        updated_within?: string;
        updated_before?: string;
        created_within?: string;
        created_before?: string;
        content_contains?: string;
        sort?: Array<{
          field: string;
          order: string;
        }>;
        limit?: number;
        offset?: number;
        vaultId?: string;
        fields?: string[];
      } = {}
    ) => {
      try {
        const result = await flintApiService.searchNotesAdvanced(options);
        return { success: true, result };
      } catch (error) {
        console.error('Error in advanced search via FlintNote API:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  );

  // File system handlers
  ipcMain.handle('fs:read-file', async (_, filePath: string) => {
    try {
      const content = await readFileAsync(filePath, 'utf-8');
      return { success: true, content };
    } catch (error) {
      console.error('Error reading file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('fs:write-file', async (_, filePath: string, content: string) => {
    try {
      await writeFileAsync(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      console.error('Error writing file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('fs:watch-file', async (event, filePath: string) => {
    try {
      // Remove existing watcher if present
      if (fileWatchers.has(filePath)) {
        fileWatchers.get(filePath)?.close();
        fileWatchers.delete(filePath);
      }

      // Create new watcher
      const watcher = watch(filePath, { persistent: false }, async (eventType) => {
        if (eventType === 'change') {
          try {
            const content = await readFileAsync(filePath, 'utf-8');
            event.sender.send('fs:file-changed', filePath, content);
          } catch (error) {
            console.error('Error reading changed file:', error);
          }
        }
      });

      fileWatchers.set(filePath, watcher);
      return { success: true };
    } catch (error) {
      console.error('Error watching file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  });

  ipcMain.handle('fs:unwatch-file', async (_, filePath: string) => {
    try {
      if (fileWatchers.has(filePath)) {
        fileWatchers.get(filePath)?.close();
        fileWatchers.delete(filePath);
      }
      return { success: true };
    } catch (error) {
      console.error('Error unwatching file:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
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
  // Clean up file watchers
  fileWatchers.forEach((watcher) => watcher.close());
  fileWatchers.clear();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
