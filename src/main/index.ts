import { app, shell, BrowserWindow, ipcMain, Menu, dialog, nativeTheme } from 'electron';
import { setupDevUserDataPath, getAppUserModelId } from './build-type';

// Must be called before app.whenReady() and before any code uses app.getPath('userData')
// This isolates dev builds from production on case-insensitive filesystems (macOS)
setupDevUserDataPath();

import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { AIService } from './ai-service';
import { ChatServer } from './chat-server';
import { SecureStorageService } from './secure-storage-service';
import { SettingsStorageService, type WindowState } from './settings-storage-service';
import {
  VaultDataStorageService,
  type CursorPosition
} from './vault-data-storage-service';
import { logger } from './logger';
import { AutoUpdaterService } from './auto-updater-service';
import { setupApplicationMenu } from './menu';
import {
  initializeVaultRepo,
  disposeVaultRepo,
  getNetworkAdapterForWebContents,
  getActiveVaultId,
  getActiveVaultBaseDirectory,
  disposeAllVaultRepos
} from './automerge-sync';
import {
  writeFile as writeFileToFilesystem,
  readFile as readFileFromFilesystem,
  fileExists as fileExistsOnFilesystem,
  listFiles as listFilesInFilesystem,
  type FileType
} from './automerge-sync/file-sync';
import {
  detectLegacyVaults,
  detectLegacyVaultAtPath,
  getMigrationDocumentData
} from './migration';

// Module-level service references
let chatServerInstance: ChatServer | null = null;

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

// Maximum image size to convert to data URI (2MB)
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

// Supported image MIME types
const SUPPORTED_IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp'
};

/**
 * Fetches an image and converts it to a base64 data URI
 * Returns null if the image cannot be fetched or is too large
 */
async function fetchImageAsDataUri(
  imageUrl: string,
  baseUrl: string
): Promise<string | null> {
  try {
    // Resolve relative URLs
    const absoluteUrl = new URL(imageUrl, baseUrl).href;

    // Skip data URIs - already in correct format
    if (absoluteUrl.startsWith('data:')) {
      return absoluteUrl;
    }

    // Only fetch http/https URLs
    if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
      return null;
    }

    const response = await fetch(absoluteUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout per image
    });

    if (!response.ok) {
      logger.debug(`Failed to fetch image: ${response.status} ${absoluteUrl}`);
      return null;
    }

    // Check content length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_BYTES) {
      logger.debug(`Image too large, skipping: ${absoluteUrl}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();

    // Check actual size
    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
      logger.debug(`Image too large after download, skipping: ${absoluteUrl}`);
      return null;
    }

    // Determine MIME type from content-type header or URL extension
    let mimeType = response.headers.get('content-type')?.split(';')[0].trim();

    if (!mimeType || mimeType === 'application/octet-stream') {
      // Try to determine from URL extension
      const extension = absoluteUrl.split('.').pop()?.toLowerCase().split('?')[0];
      if (extension && SUPPORTED_IMAGE_TYPES[extension]) {
        mimeType = SUPPORTED_IMAGE_TYPES[extension];
      } else {
        mimeType = 'image/jpeg'; // Default fallback
      }
    }

    // Convert to base64
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    logger.debug(`Error fetching image ${imageUrl}:`, { error });
    return null;
  }
}

/**
 * Processes HTML content and converts all image src attributes to data URIs
 * Uses jsdom for parsing since it's already available
 */
async function convertImagesToDataUris(
  htmlContent: string,
  baseUrl: string
): Promise<string> {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  const images = document.querySelectorAll('img');
  const imagePromises: Promise<void>[] = [];

  for (const img of images) {
    const src = img.getAttribute('src');
    if (!src) continue;

    // Skip if already a data URI
    if (src.startsWith('data:')) continue;

    const promise = (async () => {
      const dataUri = await fetchImageAsDataUri(src, baseUrl);
      if (dataUri) {
        img.setAttribute('src', dataUri);
        // Also update srcset if present
        img.removeAttribute('srcset');
      } else {
        // Keep original src but add a data attribute to indicate it wasn't converted
        img.setAttribute('data-original-src', src);
        // Set a placeholder or remove src to avoid CSP errors
        img.setAttribute(
          'src',
          'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f0f0f0"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%23999" font-size="12"%3EImage%3C/text%3E%3C/svg%3E'
        );
        img.setAttribute('alt', img.getAttribute('alt') || 'Image could not be loaded');
      }
    })();

    imagePromises.push(promise);
  }

  // Process all images in parallel
  await Promise.all(imagePromises);

  return dom.serialize();
}

async function createWindow(
  settingsStorageService: SettingsStorageService
): Promise<void> {
  // Load saved window state
  const savedState = await settingsStorageService.loadWindowState();
  const defaultWidth = 1600;
  const defaultHeight = 900;

  logger.info('Creating window with state', {
    savedState,
    usingDefaults: !savedState
  });

  // Create the browser window.
  // Frameless window on all platforms - custom title bar handles menu and window controls
  // On macOS: hiddenInset shows traffic lights
  // On Windows/Linux: custom window controls and menu bar rendered in title bar
  const mainWindow = new BrowserWindow({
    width: savedState?.width ?? defaultWidth,
    height: savedState?.height ?? defaultHeight,
    x: savedState?.x,
    y: savedState?.y,
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

  // Restore maximized state if it was saved
  if (savedState?.isMaximized) {
    mainWindow.maximize();
  }

  // Track window state for persistence
  let windowState: WindowState = {
    width: savedState?.width ?? defaultWidth,
    height: savedState?.height ?? defaultHeight,
    x: savedState?.x,
    y: savedState?.y,
    isMaximized: savedState?.isMaximized ?? false
  };

  // Debounce timer for saving window state
  let saveTimeout: NodeJS.Timeout | null = null;

  // Save state with debouncing to avoid excessive writes
  const saveWindowStateDebounced = (): void => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
      settingsStorageService.saveWindowStateSync(windowState);
    }, 500); // Save 500ms after last change
  };

  // Update state when window is resized or moved (but not when maximized)
  const updateWindowState = (): void => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds();
      windowState = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false
      };
      saveWindowStateDebounced();
    }
  };

  mainWindow.on('resize', updateWindowState);
  mainWindow.on('move', updateWindowState);
  mainWindow.on('maximize', () => {
    windowState.isMaximized = true;
    saveWindowStateDebounced();
  });
  mainWindow.on('unmaximize', () => {
    windowState.isMaximized = false;
    updateWindowState();
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

  // Set app user model id for windows (varies by build type: dev, canary, production)
  electronApp.setAppUserModelId(getAppUserModelId());

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

  // Initialize Secure Storage service
  const secureStorageService = new SecureStorageService();

  // Initialize Chat Server for AI SDK useChat integration
  chatServerInstance = new ChatServer(secureStorageService);
  let chatServerPort = 0;
  try {
    chatServerPort = await chatServerInstance.start();
    logger.info('Chat Server initialized', { port: chatServerPort });
  } catch (error) {
    logger.error('Failed to initialize Chat Server', { error });
    logger.warn('AI chat via useChat will not be available');
  }

  // Initialize Settings Storage service
  const settingsStorageService = new SettingsStorageService();
  await settingsStorageService.initialize();

  // Initialize Vault Data Storage service
  const vaultDataStorageService = new VaultDataStorageService();
  await vaultDataStorageService.initialize();

  // Initialize AI service
  let aiService: AIService | null = null;
  try {
    // Load provider from settings (default to openrouter for backward compatibility)
    let provider: 'openrouter' | 'anthropic' = 'openrouter';
    try {
      const settings = await settingsStorageService?.loadAppSettings({});
      if (settings && typeof settings === 'object' && 'aiProvider' in settings) {
        const aiProvider = (settings as { aiProvider?: { selected?: string } })
          .aiProvider;
        if (aiProvider?.selected) {
          provider = aiProvider.selected as 'openrouter' | 'anthropic';
          logger.info('Loaded AI provider from settings', { provider });
        }
      }
    } catch (error) {
      logger.warn('Failed to load provider from settings, using default', { error });
    }

    aiService = await AIService.of(secureStorageService, provider);

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

  // Switch AI provider
  ipcMain.handle(
    'switch-ai-provider',
    async (
      _event,
      params: { provider: 'openrouter' | 'anthropic'; modelName: string }
    ) => {
      if (aiService) {
        try {
          await aiService.switchProvider(
            params.provider,
            params.modelName,
            secureStorageService
          );
          return { success: true };
        } catch (error) {
          logger.error('Failed to switch AI provider', { error });
          return { success: false, error: 'Failed to switch provider' };
        }
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

  // Secure storage handlers
  ipcMain.handle('secure-storage-available', async () => {
    return secureStorageService?.isAvailable() || false;
  });

  ipcMain.handle(
    'store-api-key',
    async (
      _event,
      params: {
        provider: 'anthropic' | 'openrouter';
        key: string;
        orgId?: string;
      }
    ) => {
      if (!secureStorageService) {
        throw new Error('Secure storage service not available');
      }

      // Update the API key in secure storage
      await secureStorageService.updateApiKey(params.provider, params.key);

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
    async (_event, params: { provider: 'anthropic' | 'openrouter' }) => {
      if (!secureStorageService) {
        throw new Error('Secure storage service not available');
      }
      return await secureStorageService.getApiKey(params.provider);
    }
  );

  ipcMain.handle(
    'test-api-key',
    async (_event, params: { provider: 'anthropic' | 'openrouter' }) => {
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

  // Chat server port handler (for useChat integration)
  ipcMain.handle('get-chat-server-port', async () => {
    return chatServerPort;
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

  // Archive webpage for Automerge (returns HTML content instead of saving to filesystem)
  ipcMain.handle('archive-webpage', async (_event, params: { url: string }) => {
    try {
      const { url } = params;

      // Validate URL
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }

      // Fetch the webpage
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
      }

      const originalHtml = await response.text();

      // Parse with Defuddle for article extraction
      const { JSDOM } = await import('jsdom');
      const { Defuddle } = await import('defuddle/node');

      const dom = new JSDOM(originalHtml, { url });
      const article = await Defuddle(dom, url);

      if (!article || !article.content) {
        throw new Error('Could not extract article content from page');
      }

      // Convert images in article content to data URIs for offline access
      logger.info('Converting images to data URIs for archive...', { url });
      const contentWithImages = await convertImagesToDataUris(article.content, url);

      // Helper to escape HTML
      const escapeHtml = (str: string): string =>
        str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');

      // Create a full HTML document for the reader version
      const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(article.title || 'Untitled')}</title>
</head>
<body>
  <article>
    <h1>${escapeHtml(article.title || 'Untitled')}</h1>
    ${article.author ? `<p class="byline">${escapeHtml(article.author)}</p>` : ''}
    ${contentWithImages}
  </article>
</body>
</html>`;

      const metadata = {
        url,
        title: article.title || 'Untitled',
        siteName: article.site,
        author: article.author,
        excerpt: article.description,
        fetchedAt: new Date().toISOString(),
        lang: 'en',
        dir: 'ltr'
      };

      logger.info('Webpage archived successfully', {
        url,
        title: article.title
      });

      return { html, metadata };
    } catch (error) {
      logger.error('Failed to archive webpage', { error });
      throw error;
    }
  });

  // Open URL in external browser
  ipcMain.handle('open-external', async (_event, params: { url: string }) => {
    try {
      const { url } = params;
      // Validate URL - only allow http and https
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }
      await shell.openExternal(url);
    } catch (error) {
      logger.error('Failed to open external URL', { error, url: params.url });
      throw error;
    }
  });

  // Automerge sync IPC handlers
  ipcMain.handle(
    'init-vault-sync',
    async (event, params: { vaultId: string; baseDirectory: string; docUrl: string }) => {
      try {
        return initializeVaultRepo(
          params.vaultId,
          params.baseDirectory,
          params.docUrl,
          event.sender
        );
      } catch (error) {
        logger.error('Failed to initialize vault sync', { error, params });
        throw error;
      }
    }
  );

  ipcMain.handle('dispose-vault-sync', async (_event, params: { vaultId: string }) => {
    try {
      disposeVaultRepo(params.vaultId);
    } catch (error) {
      logger.error('Failed to dispose vault sync', { error, params });
      throw error;
    }
  });

  ipcMain.handle('automerge-repo-message', async (event, message) => {
    const adapter = getNetworkAdapterForWebContents(event.sender.id);
    if (adapter) {
      adapter.handleMessage(message);
    }
  });

  ipcMain.handle('select-sync-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Sync Directory',
      buttonLabel: 'Select Folder'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // Binary file sync IPC handlers (PDFs, EPUBs, web archives, images)
  ipcMain.handle(
    'write-file-to-filesystem',
    async (
      event,
      params: {
        fileType: FileType;
        hash: string;
        data: Uint8Array;
        extension?: string;
        metadata?: Record<string, unknown>;
        baseDirectory?: string; // Optional: for use during migration when vault doesn't exist yet
      }
    ) => {
      // Use provided baseDirectory (migration) or look up from active vault
      const baseDirectory =
        params.baseDirectory || getActiveVaultBaseDirectory(event.sender.id);
      if (!baseDirectory) {
        throw new Error('No vault with file sync enabled for this window');
      }
      // Use provided baseDirectory as vaultId during migration, otherwise look up
      const vaultId = params.baseDirectory || getActiveVaultId(event.sender.id);
      if (!vaultId) {
        throw new Error('No active vault for this window');
      }

      await writeFileToFilesystem(
        baseDirectory,
        params.fileType,
        params.hash,
        Buffer.from(params.data),
        vaultId,
        { extension: params.extension, metadata: params.metadata }
      );
    }
  );

  ipcMain.handle(
    'file-exists-on-filesystem',
    async (
      event,
      params: {
        fileType: FileType;
        hash: string;
        extension?: string;
      }
    ) => {
      const baseDirectory = getActiveVaultBaseDirectory(event.sender.id);
      if (!baseDirectory) {
        return false;
      }

      return fileExistsOnFilesystem(
        baseDirectory,
        params.fileType,
        params.hash,
        params.extension
      );
    }
  );

  ipcMain.handle(
    'list-files-in-filesystem',
    async (
      event,
      params: {
        fileType: FileType;
      }
    ) => {
      const baseDirectory = getActiveVaultBaseDirectory(event.sender.id);
      if (!baseDirectory) {
        return [];
      }

      return listFilesInFilesystem(baseDirectory, params.fileType);
    }
  );

  ipcMain.handle(
    'read-file-from-filesystem',
    async (
      event,
      params: {
        fileType: FileType;
        hash: string;
        extension?: string;
      }
    ) => {
      const baseDirectory = getActiveVaultBaseDirectory(event.sender.id);
      if (!baseDirectory) {
        return null;
      }

      const result = await readFileFromFilesystem(
        baseDirectory,
        params.fileType,
        params.hash,
        params.extension
      );

      if (!result) {
        return null;
      }

      // Convert Buffer to Uint8Array for IPC
      return {
        data: new Uint8Array(result.data),
        metadata: result.metadata
      };
    }
  );

  // Legacy vault migration IPC handlers
  ipcMain.handle(
    'detect-legacy-vaults',
    async (_event, params: { existingVaults: Array<{ baseDirectory?: string }> }) => {
      try {
        return await detectLegacyVaults(params.existingVaults);
      } catch (error) {
        logger.error('Failed to detect legacy vaults', { error });
        return [];
      }
    }
  );

  ipcMain.handle(
    'detect-legacy-vault-at-path',
    async (
      _event,
      params: { vaultPath: string; existingVaults: Array<{ baseDirectory?: string }> }
    ) => {
      try {
        return await detectLegacyVaultAtPath(params.vaultPath, params.existingVaults);
      } catch (error) {
        logger.error('Failed to detect legacy vault at path', {
          error,
          path: params.vaultPath
        });
        return null;
      }
    }
  );

  ipcMain.handle(
    'get-migration-document-data',
    async (_event, params: { vaultPath: string }) => {
      try {
        return await getMigrationDocumentData(params.vaultPath);
      } catch (error) {
        logger.error('Failed to get migration document data', {
          error,
          path: params.vaultPath
        });
        return null;
      }
    }
  );

  ipcMain.handle('browse-for-vault', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Legacy Vault Directory',
      buttonLabel: 'Select Vault'
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  await createWindow(settingsStorageService);
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

  app.on('activate', async function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      logger.info('Reactivating application, creating new window');
      await createWindow(settingsStorageService);
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
    // Dispose all Automerge vault repos
    logger.info('Disposing Automerge vault repos');
    disposeAllVaultRepos();
    logger.info('Automerge vault repos disposed');

    // Stop chat server
    if (chatServerInstance) {
      logger.info('Stopping chat server');
      await chatServerInstance.stop();
      logger.info('Chat server stopped');
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
