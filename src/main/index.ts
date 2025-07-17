import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { AIService } from './ai-service';

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
app.whenReady().then(() => {
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
    console.log('AI Service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AI Service:', error);
    console.log('Falling back to mock responses');
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
        return randomResponse;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      return "I'm sorry, I encountered an error while processing your message. Please try again.";
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
