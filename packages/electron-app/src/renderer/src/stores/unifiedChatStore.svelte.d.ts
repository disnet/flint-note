import type { Message } from '../services/types';
export interface ModelUsageBreakdown {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    cost: number;
}
export interface ThreadCostInfo {
    totalCost: number;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    requestCount: number;
    modelUsage: ModelUsageBreakdown[];
    lastUpdated: Date;
}
export interface UnifiedThread {
    id: string;
    title: string;
    vaultId: string;
    messages: Message[];
    notesDiscussed: string[];
    tags?: string[];
    isArchived?: boolean;
    createdAt: Date;
    lastActivity: Date;
    costInfo: ThreadCostInfo;
}
declare class UnifiedChatStore {
    private state;
    private isVaultSwitching;
    private effectsInitialized;
    private vaultInitialized;
    constructor();
    initializeEffects(): void;
    private ensureVaultInitialized;
    get activeThread(): UnifiedThread | null;
    get activeThreadId(): string | null;
    get currentVaultId(): string | null;
    get isLoading(): boolean;
    get maxThreadsPerVault(): number;
    getThreadsForCurrentVault(): UnifiedThread[];
    getThreadsForVault(vaultId: string): UnifiedThread[];
    get allThreads(): UnifiedThread[];
    get sortedThreads(): UnifiedThread[];
    get archivedThreads(): UnifiedThread[];
    createThread(initialMessage?: Message): Promise<string>;
    updateThread(threadId: string, updates: Partial<Omit<UnifiedThread, 'id' | 'createdAt' | 'vaultId'>>): boolean;
    deleteThread(threadId: string): boolean;
    switchToThread(threadId: string): Promise<boolean>;
    archiveThread(threadId: string): boolean;
    unarchiveThread(threadId: string): boolean;
    addMessage(message: Message): Promise<void>;
    addMessageToThread(threadId: string, message: Message): boolean;
    updateMessage(messageId: string, updates: Partial<Message>): void;
    refreshForVault(vaultId?: string): Promise<void>;
    searchThreadsInVault(query: string, vaultId?: string): UnifiedThread[];
    getThreadsWithNote(noteId: string, vaultId?: string): UnifiedThread[];
    clearAllThreads(): void;
    recordThreadUsage(threadId: string, usageData: {
        modelName: string;
        inputTokens: number;
        outputTokens: number;
        cachedTokens: number;
        cost: number;
        timestamp: Date;
    }): boolean;
    getTotalCost(): number;
    private findThread;
    private findVaultForThread;
    private enforceThreadLimitForVault;
    private getStorageKey;
    private loadFromStorage;
    private saveToStorage;
    private syncActiveThreadWithBackend;
    private serializeMessage;
    private safeStringify;
    private deepCleanObject;
}
export declare const unifiedChatStore: UnifiedChatStore;
export {};
