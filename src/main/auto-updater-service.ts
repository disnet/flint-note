import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { BrowserWindow, ipcMain, app } from 'electron';
import { logger } from './logger';

export class AutoUpdaterService {
  private mainWindow: BrowserWindow | null = null;
  private updateCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    logger.info('AutoUpdaterService constructor called');
    this.setupAutoUpdater();
    this.setupIpcHandlers();
    logger.info('AutoUpdaterService initialization complete');
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private setupAutoUpdater(): void {
    // Configure auto-updater
    autoUpdater.autoDownload = false; // Don't auto-download, let user choose
    autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

    // Disable signature verification for local testing
    // In production, this should be enabled for security
    const isLocalTesting = process.env.FLINT_LOCAL_TESTING === 'true';
    if (isLocalTesting) {
      autoUpdater.disableWebInstaller = true;
      logger.info('Code signature verification disabled for local testing');
    }

    // Allow environment variable override for testing
    const updateServerUrl = process.env.FLINT_UPDATE_SERVER_URL;
    if (updateServerUrl) {
      logger.info('Using update server URL from environment', { url: updateServerUrl });
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: updateServerUrl
      });
    }
    // Development mode configuration
    else if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
      autoUpdater.updateConfigPath = 'dev-app-update.yml'; // Optional dev config
      autoUpdater.forceDevUpdateConfig = true;
      // Explicitly set the feed URL for development
      autoUpdater.setFeedURL({
        provider: 'generic',
        url: 'http://localhost:3000'
      });
      logger.info('Auto-updater configured for development mode', {
        updateConfigPath: autoUpdater.updateConfigPath,
        feedURL: autoUpdater.getFeedURL()
      });
    }

    logger.info('Auto-updater initialized', {
      autoDownload: autoUpdater.autoDownload,
      autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
      isPackaged: app.isPackaged,
      currentVersion: app.getVersion(),
      feedURL: autoUpdater.getFeedURL()
    });

    // Auto-updater events
    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for update...');
      this.sendToRenderer('update-checking');
    });

    autoUpdater.on('update-available', (info) => {
      logger.info('Update available:', info);
      this.sendToRenderer('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        files: info.files,
        releaseName: info.releaseName,
        releaseNotes: info.releaseNotes
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      logger.info('Update not available:', info);
      this.sendToRenderer('update-not-available', {
        version: info.version
      });
    });

    autoUpdater.on('error', (err) => {
      logger.error('Auto-updater error:', err);
      this.sendToRenderer('update-error', {
        message: err.message,
        stack: err.stack
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      logger.info('Download progress:', progress);
      this.sendToRenderer('update-download-progress', {
        bytesPerSecond: progress.bytesPerSecond,
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('Update downloaded:', info);
      this.sendToRenderer('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseName: info.releaseName,
        releaseNotes: info.releaseNotes
      });
    });
  }

  private setupIpcHandlers(): void {
    logger.info('Setting up auto-updater IPC handlers');

    // Check for updates manually
    ipcMain.handle('check-for-updates', async () => {
      logger.info('check-for-updates handler called');
      try {
        const result = await autoUpdater.checkForUpdates();
        return {
          success: true,
          updateInfo: result?.updateInfo || null
        };
      } catch (error) {
        logger.error('Failed to check for updates:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Download update
    ipcMain.handle('download-update', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        logger.error('Failed to download update:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Install update and restart
    ipcMain.handle('install-update', async () => {
      try {
        autoUpdater.quitAndInstall(true, true);
        return { success: true };
      } catch (error) {
        logger.error('Failed to install update:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    // Get current version
    ipcMain.handle('get-app-version', async () => {
      const version = autoUpdater.currentVersion?.version || app.getVersion() || '0.0.0';
      logger.info('get-app-version called', { version });
      return {
        version,
        channel: autoUpdater.channel || 'latest'
      };
    });

    // Get update configuration
    ipcMain.handle('get-update-config', async () => {
      return {
        autoDownload: autoUpdater.autoDownload,
        autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
        allowPrerelease: autoUpdater.allowPrerelease,
        allowDowngrade: autoUpdater.allowDowngrade,
        currentVersion: autoUpdater.currentVersion?.version
      };
    });

    // Update configuration
    ipcMain.handle(
      'set-update-config',
      async (
        _,
        config: {
          autoDownload?: boolean;
          autoInstallOnAppQuit?: boolean;
          allowPrerelease?: boolean;
          allowDowngrade?: boolean;
        }
      ) => {
        try {
          if (config.autoDownload !== undefined) {
            autoUpdater.autoDownload = config.autoDownload;
          }
          if (config.autoInstallOnAppQuit !== undefined) {
            autoUpdater.autoInstallOnAppQuit = config.autoInstallOnAppQuit;
          }
          if (config.allowPrerelease !== undefined) {
            autoUpdater.allowPrerelease = config.allowPrerelease;
          }
          if (config.allowDowngrade !== undefined) {
            autoUpdater.allowDowngrade = config.allowDowngrade;
          }
          return { success: true };
        } catch (error) {
          logger.error('Failed to update config:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }
    );

    logger.info('Auto-updater IPC handlers registered successfully');
  }

  private sendToRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // Start automatic update checking
  startPeriodicUpdateCheck(intervalMinutes: number = 60): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
    }

    this.updateCheckInterval = setInterval(
      () => {
        this.checkForUpdates();
      },
      intervalMinutes * 60 * 1000
    );

    logger.info(`Started periodic update check every ${intervalMinutes} minutes`);
  }

  // Stop automatic update checking
  stopPeriodicUpdateCheck(): void {
    if (this.updateCheckInterval) {
      clearInterval(this.updateCheckInterval);
      this.updateCheckInterval = null;
      logger.info('Stopped periodic update check');
    }
  }

  // Manual update check
  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.error('Manual update check failed:', error);
    }
  }

  // Check for updates on app startup
  checkForUpdatesOnStartup(): void {
    // Wait a bit after startup to avoid interfering with app initialization
    setTimeout(() => {
      this.checkForUpdates();
    }, 10000); // 10 seconds delay
  }
}
