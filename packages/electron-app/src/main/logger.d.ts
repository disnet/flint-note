declare class Logger {
    private static instance;
    private logger;
    private constructor();
    static getInstance(): Logger;
    info(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    debug(message: string, meta?: unknown): void;
    getLogsPath(): string;
}
export declare const logger: Logger;
export {};
