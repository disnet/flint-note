import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  Menu,
  dialog,
  nativeTheme,
  contentTracing
} from 'electron';
import { setupDevUserDataPath, getAppUserModelId } from './build-type';

// Must be called before app.whenReady() and before any code uses app.getPath('userData')
// This isolates dev builds from production on case-insensitive filesystems (macOS)
setupDevUserDataPath();

// Force HiDPI/retina rendering for screenshot automation
// Must be called before app.whenReady()
if (process.env.FLINT_SCREENSHOT_MODE === '1') {
  app.commandLine.appendSwitch('force-device-scale-factor', '2');
}

// Check if startup tracing is enabled via env var
const enableStartupTracing = process.env.TRACE_STARTUP === '1';

import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { ChatServer } from './chat-server';
import { SecureStorageService } from './secure-storage-service';
import { SettingsStorageService, type WindowState } from './settings-storage-service';
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
  getMigrationDocumentData,
  readLegacyVaultPaths
} from './migration';
import { scanMarkdownDirectory, getMarkdownImportData } from './markdown-import';
import { detectAutomergeVault } from './automerge-import';
import fontList from 'font-list';

// Handle unhandled promise rejections from automerge-repo when documents are unavailable.
// This can happen during legacy vault migration when content URLs reference non-existent documents.
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);

  // Suppress expected automerge-repo "Document unavailable" errors during migration
  if (message.includes('is unavailable')) {
    logger.debug('[Main] Suppressed automerge-repo unavailable document error:', reason);
    return;
  }

  // Log other unhandled rejections
  logger.error('[Main] Unhandled promise rejection:', reason);
});

// Module-level service references
let chatServerInstance: ChatServer | null = null;

// --- CLI argument types and parsing ---
interface StartupCommand {
  type: 'open-vault' | 'import-directory';
  vaultName?: string;
  vaultId?: string;
  importPath?: string;
  customVaultName?: string;
}

function parseCliArgs(): StartupCommand | null {
  // In packaged app, process.argv[0] is the app, process.argv[1] may be the file
  // In dev, process.argv[0] is electron, process.argv[1] is the script
  // We need to skip electron-specific args
  const args = process.argv.slice(is.dev ? 2 : 1);

  let vaultName: string | undefined;
  let vaultId: string | undefined;
  let importPath: string | undefined;
  let customVaultName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if ((arg === '--vault' || arg === '-v') && nextArg && !nextArg.startsWith('-')) {
      vaultName = nextArg;
      i++;
    } else if (arg === '--vault-id' && nextArg && !nextArg.startsWith('-')) {
      vaultId = nextArg;
      i++;
    } else if (
      (arg === '--import' || arg === '-i') &&
      nextArg &&
      !nextArg.startsWith('-')
    ) {
      importPath = nextArg;
      i++;
    } else if (
      (arg === '--vault-name' || arg === '-n') &&
      nextArg &&
      !nextArg.startsWith('-')
    ) {
      customVaultName = nextArg;
      i++;
    }
  }

  // Validate and return command
  if (importPath) {
    return {
      type: 'import-directory',
      importPath,
      customVaultName
    };
  } else if (vaultName) {
    return { type: 'open-vault', vaultName };
  } else if (vaultId) {
    return { type: 'open-vault', vaultId };
  }

  return null;
}

// Parse CLI args early (before app.whenReady)
const startupCommand = parseCliArgs();
if (startupCommand) {
  logger.info('Parsed startup command from CLI', { startupCommand });
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
  settingsStorageService: SettingsStorageService,
  startupCmd: StartupCommand | null = null
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
    // macOS vibrancy - native frosted glass effect for sidebar
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'under-window',
          visualEffectState: 'active',
          transparent: true,
          backgroundColor: '#00000000' // Transparent to allow vibrancy to show
        }
      : {
          backgroundColor: getThemeBackgroundColor() // Solid background for Windows/Linux
        }),
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

  mainWindow.on('ready-to-show', async () => {
    mainWindow.show();

    // Send startup command to renderer after window is ready
    if (startupCmd) {
      // Small delay to ensure renderer is fully initialized
      setTimeout(() => {
        mainWindow.webContents.send('startup-command', startupCmd);
        logger.info('Sent startup command to renderer', { startupCmd });
      }, 500);
    }

    // Stop startup tracing if it was enabled
    if (enableStartupTracing) {
      // Wait a bit for initial render to complete
      setTimeout(async () => {
        const path = await contentTracing.stopRecording();
        console.log('Startup trace saved to:', path);
      }, 9000);
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Intercept zoom shortcuts before Chromium handles them
  // This prevents built-in page zoom and lets our menu accelerators work
  // The renderer routes these to font size or reader zoom based on context
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? input.meta : input.control;

    if (modifierKey && !input.shift && input.type === 'keyDown') {
      if (input.key === '-') {
        event.preventDefault();
        mainWindow.webContents.send('menu-action', 'font-size-decrease');
      } else if (input.key === '=') {
        event.preventDefault();
        mainWindow.webContents.send('menu-action', 'font-size-increase');
      } else if (input.key === '0') {
        event.preventDefault();
        mainWindow.webContents.send('menu-action', 'font-size-reset');
      }
    }
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
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Start tracing as early as possible after app is ready
  if (enableStartupTracing) {
    await contentTracing.startRecording({
      included_categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'blink',
        'blink.user_timing',
        'v8.execute',
        'cc',
        'gpu'
      ]
    });
    console.log('Startup tracing started...');
  }

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

  // Font enumeration
  ipcMain.handle('get-system-fonts', async () => {
    try {
      const fonts = await fontList.getFonts();
      // font-list returns quoted font names like '"Arial"', clean them up
      return fonts.map((f) => f.replace(/^"|"$/g, '')).sort();
    } catch (error) {
      logger.error('Failed to get system fonts', { error });
      return [];
    }
  });

  // Vibrancy control (macOS only)
  ipcMain.handle('refresh-vibrancy', async () => {
    if (process.platform !== 'darwin') return;

    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((window) => {
      // Toggle vibrancy off and on to force refresh
      window.setVibrancy(null);
      window.setVibrancy('under-window');
    });
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

  ipcMain.handle('show-logs-in-folder', async () => {
    try {
      const logsPath = logger.getLogsPath();
      shell.showItemInFolder(logsPath);
      return { success: true };
    } catch (error) {
      logger.error('Failed to show logs in folder', { error });
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
    async (
      event,
      params: {
        vaultId: string;
        baseDirectory: string;
        docUrl: string;
        vaultName: string;
      }
    ) => {
      try {
        return initializeVaultRepo(
          params.vaultId,
          params.baseDirectory,
          params.docUrl,
          params.vaultName,
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

  ipcMain.on('automerge-repo-message', (event, message) => {
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

  // Read legacy vault paths from old app's config.yml
  ipcMain.handle('read-legacy-vault-paths', async () => {
    try {
      return await readLegacyVaultPaths();
    } catch (error) {
      logger.error('Failed to read legacy vault paths', { error });
      return [];
    }
  });

  // Detect if a directory contains markdown files (for plain directory import)
  ipcMain.handle(
    'detect-markdown-directory',
    async (_event, params: { dirPath: string }) => {
      try {
        return scanMarkdownDirectory(params.dirPath);
      } catch (error) {
        logger.error('Failed to detect markdown directory', {
          error,
          dirPath: params.dirPath
        });
        return null;
      }
    }
  );

  // Detect if a directory contains an automerge vault (.automerge/manifest.json)
  ipcMain.handle(
    'detect-automerge-vault',
    async (_event, params: { dirPath: string }) => {
      try {
        return await detectAutomergeVault(params.dirPath);
      } catch (error) {
        logger.error('Failed to detect automerge vault', {
          error,
          dirPath: params.dirPath
        });
        return null;
      }
    }
  );

  // Get full import data for a markdown directory
  ipcMain.handle(
    'get-markdown-import-data',
    async (_event, params: { dirPath: string }) => {
      try {
        return await getMarkdownImportData(params.dirPath);
      } catch (error) {
        logger.error('Failed to get markdown import data', {
          error,
          dirPath: params.dirPath
        });
        return null;
      }
    }
  );

  await createWindow(settingsStorageService, startupCommand);
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
    // On macOS with vibrancy, don't set background color - vibrancy handles appearance
    if (process.platform === 'darwin') {
      logger.info('Theme changed on macOS, vibrancy handles appearance automatically');
      return;
    }

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
      // Don't pass startupCommand on reactivation - it was already processed
      await createWindow(settingsStorageService, null);
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
