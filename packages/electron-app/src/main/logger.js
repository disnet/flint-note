import winston from 'winston';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, mkdirSync } from 'fs';
class Logger {
    static instance;
    logger;
    constructor() {
        // Create logs directory if it doesn't exist
        const logsDir = join(app.getPath('userData'), 'logs');
        if (!existsSync(logsDir)) {
            mkdirSync(logsDir, { recursive: true });
        }
        // Configure winston logger
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
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
                    format: winston.format.combine(winston.format.colorize(), winston.format.simple())
                })
            ]
        });
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    info(message, meta) {
        this.logger.info(message, meta);
    }
    error(message, meta) {
        this.logger.error(message, meta);
    }
    warn(message, meta) {
        this.logger.warn(message, meta);
    }
    debug(message, meta) {
        this.logger.debug(message, meta);
    }
    getLogsPath() {
        return join(app.getPath('userData'), 'logs');
    }
}
export const logger = Logger.getInstance();
