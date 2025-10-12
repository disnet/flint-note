import winston from 'winston';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';

class Logger {
  private static instance: Logger;
  private logger: winston.Logger | null = null;

  private constructor() {
    // Defer logger initialization until first use
  }

  private initializeLogger(): void {
    if (this.logger) {
      return;
    }

    // Check if we're in a test environment or if app is available
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

    if (isTestEnv || !app || !app.getPath) {
      // In test environment, use console-only logger
      this.logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        defaultMeta: { service: 'flint-main' },
        transports: [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          })
        ]
      });
      return;
    }

    // Production logger with file transports
    const logsDir = join(app.getPath('userData'), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'flint-main' },
      transports: [
        // Write errors to error.log
        new winston.transports.File({
          filename: join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        }),
        // Write all logs to combined.log
        new winston.transports.File({
          filename: join(logsDir, 'combined.log'),
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5
        }),
        // Also log to console in development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(message: string, meta?: unknown): void {
    this.initializeLogger();
    this.logger?.info(message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.initializeLogger();
    // Properly serialize Error objects
    const serializedMeta = this.serializeErrorMeta(meta);
    this.logger?.error(message, serializedMeta);
  }

  private serializeErrorMeta(meta?: unknown): unknown {
    if (!meta || typeof meta !== 'object') {
      return meta;
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (value instanceof Error) {
        // Serialize Error objects with all their properties
        result[key] = {
          message: value.message,
          name: value.name,
          stack: value.stack,
          // Include any additional enumerable properties
          ...Object.getOwnPropertyNames(value).reduce(
            (acc, prop) => {
              if (!['message', 'name', 'stack'].includes(prop)) {
                acc[prop] = (value as unknown as Record<string, unknown>)[prop];
              }
              return acc;
            },
            {} as Record<string, unknown>
          )
        };
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  warn(message: string, meta?: unknown): void {
    this.initializeLogger();
    this.logger?.warn(message, meta);
  }

  debug(message: string, meta?: unknown): void {
    this.initializeLogger();
    this.logger?.debug(message, meta);
  }

  getLogsPath(): string {
    if (!app || !app.getPath) {
      return '/tmp/logs'; // Fallback for test environment
    }
    return join(app.getPath('userData'), 'logs');
  }
}

export const logger = Logger.getInstance();
