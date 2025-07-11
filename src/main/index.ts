import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { LLMService, FLINT_SYSTEM_PROMPT, LLMMessage } from './services/llmService';
// MCP service is initialized within LLMService
// import { mcpService } from './services/mcpService';

// Initialize LLM service
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
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

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
      llmService.updateConfig(config);
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
      llmService.setMCPToolsEnabled(enabled);
      return { success: true };
    } catch (error) {
      console.error('Error setting MCP enabled state:', error);
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
  ipcMain.handle('mcp:call-tool', async (_, toolCall: any) => {
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
  });

  // Tool limit configuration handlers
  ipcMain.handle('llm:set-max-tools', async (_, limit: number) => {
    try {
      llmService.setMaxToolsLimit(limit);
      return { success: true };
    } catch (error) {
      console.error('Error setting tool limit:', error);
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
      console.error('Error getting tool limit:', error);
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
