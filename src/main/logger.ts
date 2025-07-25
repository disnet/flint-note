import winston from 'winston';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';

class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    // Create logs directory if it doesn't exist
    const logsDir = join(app.getPath('userData'), 'logs');
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    // Configure winston logger
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
    this.logger.info(message, meta);
  }

  error(message: string, meta?: unknown): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: unknown): void {
    this.logger.debug(message, meta);
  }

  getLogsPath(): string {
    return join(app.getPath('userData'), 'logs');
  }
}

export const logger = Logger.getInstance();
