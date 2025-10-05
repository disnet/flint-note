import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { BrowserWindow, ipcMain, app } from 'electron';
import { logger } from './logger';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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
    autoUpdater.autoDownload = true; // Automatically download updates in background
    autoUpdater.autoInstallOnAppQuit = true; // Install when app quits

    logger.info('Auto-updater initialized', {
      autoDownload: autoUpdater.autoDownload,
      autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
      isPackaged: app.isPackaged,
      currentVersion: app.getVersion()
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
      // Determine channel from version string if not set by auto-updater
      const isCanary = version.includes('canary');
      const channel = autoUpdater.channel || (isCanary ? 'canary' : 'latest');
      logger.info('get-app-version called', { version, channel });
      return {
        version,
        channel
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

    // Get changelog for a specific version
    ipcMain.handle('get-changelog', async (_, version: string, isCanary: boolean) => {
      try {
        const changelog = this.getChangelog(version, isCanary);
        return { success: true, changelog };
      } catch (error) {
        logger.error('Failed to get changelog:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    logger.info('Auto-updater IPC handlers registered successfully');
  }

  private getChangelog(version: string, isCanary: boolean): string {
    const changelogFile = isCanary ? 'CHANGELOG-CANARY.md' : 'CHANGELOG.md';
    const changelogPath = app.isPackaged
      ? join(process.resourcesPath, changelogFile)
      : join(app.getAppPath(), changelogFile);

    // Check if changelog file exists before trying to read it
    if (!existsSync(changelogPath)) {
      logger.warn('Changelog file not found', {
        changelogFile,
        changelogPath,
        isPackaged: app.isPackaged
      });
      return `# What's New in ${version}\n\nChangelog not available.`;
    }

    try {
      const fullChangelog = readFileSync(changelogPath, 'utf-8');

      // Extract the section for the specific version
      const versionHeader = `## [${version}]`;
      const versionIndex = fullChangelog.indexOf(versionHeader);

      if (versionIndex === -1) {
        logger.warn(`Changelog section for version ${version} not found, returning full changelog`, {
          version,
          isCanary,
          changelogFile,
          changelogPath,
          versionHeader,
          changelogPreview: fullChangelog.slice(0, 200)
        });
        return `# What's New in ${version}\n\n${fullChangelog}`;
      }

      // Find the next version header or end of file
      const nextVersionIndex = fullChangelog.indexOf('\n## [', versionIndex + 1);
      const versionSection =
        nextVersionIndex === -1
          ? fullChangelog.slice(versionIndex)
          : fullChangelog.slice(versionIndex, nextVersionIndex);

      return `# What's New in ${version}\n\n${versionSection}`;
    } catch (error) {
      logger.error('Error reading changelog:', error);
      return `# What's New\n\nChangelog not available.`;
    }
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
