import type { Message, ChatService } from '../services/types';
import { getChatService } from '../services/chatService';

interface ExtendedChatService extends ChatService {
  setActiveConversation(
    conversationId: string,
    messages: Message[] | string
  ): Promise<{ success: boolean; error?: string }>;
}

export interface ModelUsageBreakdown {
  model: string; // e.g., "anthropic/claude-3-5-sonnet-20241022"
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number; // in micro-cents (millionths of a dollar) for precise arithmetic
}

export interface ThreadCostInfo {
  totalCost: number; // in micro-cents (millionths of a dollar) for precise arithmetic
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requestCount: number;
  modelUsage: ModelUsageBreakdown[];
  lastUpdated: Date;
}

export interface UnifiedThread {
  // Core thread identity
  id: string;
  title: string;

  // Vault integration
  vaultId: string;

  // Messages and conversation
  messages: Message[];

  // Threading features
  notesDiscussed: string[];
  tags?: string[];
  isArchived?: boolean;

  // Timestamps
  createdAt: Date;
  lastActivity: Date;

  // Cost tracking (enhanced from both)
  costInfo: ThreadCostInfo;
}

interface UnifiedChatState {
  // Vault-scoped threads
  threadsByVault: Map<string, UnifiedThread[]>;
  activeThreadId: string | null;
  currentVaultId: string | null;

  // Settings
  maxThreadsPerVault: number;
  isLoading: boolean;
}

const defaultState: UnifiedChatState = {
  threadsByVault: new Map(),
  activeThreadId: null,
  currentVaultId: null,
  maxThreadsPerVault: 50,
  isLoading: false
};

// Helper functions
function generateThreadTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((msg) => msg.sender === 'user');
  if (!firstUserMessage) return 'New Thread';

  // Take first 50 characters and clean up
  const title = firstUserMessage.text.slice(0, 50).trim();
  return title.length === 50 ? title + '...' : title;
}

function extractNotesDiscussed(messages: Message[]): string[] {
  const noteSet = new Set<string>();
  messages.forEach((message) => {
    const wikilinks = extractWikiLinks(message.text);
    wikilinks.forEach((note) => noteSet.add(note));
  });
  return Array.from(noteSet);
}

function extractWikiLinks(text: string): string[] {
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  const matches: string[] = [];
  let match;
  while ((match = wikiLinkRegex.exec(text)) !== null) {
    // Handle format "identifier|title" - extract just the identifier
    const noteRef = match[1];
    const pipeIndex = noteRef.indexOf('|');
    const identifier =
      pipeIndex !== -1 ? noteRef.substring(0, pipeIndex).trim() : noteRef.trim();
    matches.push(identifier);
  }
  return matches;
}

class UnifiedChatStore {
  private state = $state<UnifiedChatState>(defaultState);
  private isVaultSwitching = false;
  private effectsInitialized = false;
  private vaultInitialized = false;

  constructor() {
    // Don't initialize vault in constructor to avoid circular dependencies
    // Vault will be initialized lazily when needed
    this.loadFromStorage();
  }

  // Initialize reactive effects
  initializeEffects(): void {
    if (this.effectsInitialized) return;
    this.effectsInitialized = true;

    // Initialize vault when effects are set up
    this.ensureVaultInitialized();

    // Auto-save effect
    $effect(() => {
      this.saveToStorage();
    });

    // Cleanup effect - remove old threads when over limit
    $effect(() => {
      const currentThreads = this.getThreadsForCurrentVault();
      if (currentThreads.length > this.state.maxThreadsPerVault) {
        const sortedByActivity = [...currentThreads].sort(
          (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
        );
        const threadsToKeep = sortedByActivity.slice(0, this.state.maxThreadsPerVault);

        // Create a new Map to trigger Svelte reactivity
        const newMap = new Map(this.state.threadsByVault);
        newMap.set(this.currentVaultId || 'default', threadsToKeep);
        this.state.threadsByVault = newMap;
      }
    });
  }

  // Ensure vault is initialized - call this before operations that need vault info
  private async ensureVaultInitialized(): Promise<void> {
    if (this.vaultInitialized) return;

    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.state.currentVaultId = vault?.id || 'default';
      this.vaultInitialized = true;

      // Sync active thread with backend after initialization
      await this.syncActiveThreadWithBackend();
    } catch (error) {
      console.warn('Failed to initialize vault for threads:', error);
      this.state.currentVaultId = 'default';
      this.vaultInitialized = true; // Mark as initialized even on error to avoid repeated attempts
    }
  }

  // Core getters
  get activeThread(): UnifiedThread | null {
    if (!this.state.activeThreadId) return null;
    const currentThreads = this.getThreadsForCurrentVault();
    return currentThreads.find((t) => t.id === this.state.activeThreadId) || null;
  }

  get activeThreadId(): string | null {
    return this.state.activeThreadId;
  }

  get currentVaultId(): string | null {
    return this.state.currentVaultId;
  }

  get isLoading(): boolean {
    return this.state.isLoading;
  }

  get maxThreadsPerVault(): number {
    return this.state.maxThreadsPerVault;
  }

  // Get threads for current vault
  getThreadsForCurrentVault(): UnifiedThread[] {
    const vaultId = this.state.currentVaultId || 'default';
    return this.state.threadsByVault.get(vaultId) || [];
  }

  // Get threads for specific vault
  getThreadsForVault(vaultId: string): UnifiedThread[] {
    return this.state.threadsByVault.get(vaultId) || [];
  }

  // Get all threads (for migration purposes)
  get allThreads(): UnifiedThread[] {
    const threads: UnifiedThread[] = [];
    for (const vaultThreads of this.state.threadsByVault.values()) {
      threads.push(...vaultThreads);
    }
    return threads;
  }

  // Get sorted threads for current vault (non-archived, recent first)
  get sortedThreads(): UnifiedThread[] {
    return this.getThreadsForCurrentVault()
      .filter((thread) => !thread.isArchived)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  // Get archived threads for current vault
  get archivedThreads(): UnifiedThread[] {
    return this.getThreadsForCurrentVault()
      .filter((thread) => thread.isArchived)
      .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  }

  // Thread CRUD operations
  async createThread(initialMessage?: Message): Promise<string> {
    if (this.isVaultSwitching) return this.state.activeThreadId || '';

    // Ensure vault is initialized before creating threads
    await this.ensureVaultInitialized();

    const threadId = `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const vaultId = this.state.currentVaultId || 'default';

    const newThread: UnifiedThread = {
      id: threadId,
      title: initialMessage ? generateThreadTitle([initialMessage]) : 'New Thread',
      vaultId,
      messages: initialMessage ? [initialMessage] : [],
      notesDiscussed: initialMessage ? extractNotesDiscussed([initialMessage]) : [],
      isArchived: false,
      createdAt: now,
      lastActivity: now,
      costInfo: {
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        requestCount: 0,
        modelUsage: [],
        lastUpdated: now
      }
    };

    // Add to current vault's threads
    const currentThreads = this.getThreadsForCurrentVault();
    const updatedThreads = [newThread, ...currentThreads];

    // Create a new Map to trigger Svelte reactivity
    const newMap = new Map(this.state.threadsByVault);
    newMap.set(vaultId, updatedThreads);
    this.state.threadsByVault = newMap;
    this.state.activeThreadId = threadId;

    // Sync new thread with backend
    try {
      const chatService = getChatService();
      if ('setActiveConversation' in chatService) {
        await (chatService as ExtendedChatService).setActiveConversation(
          threadId,
          initialMessage ? [initialMessage] : []
        );
      }
    } catch (error) {
      console.warn('Failed to sync new thread with backend:', error);
    }

    // Enforce thread limit
    this.enforceThreadLimitForVault(vaultId);
    if (!this.effectsInitialized) this.saveToStorage();

    return threadId;
  }

  updateThread(
    threadId: string,
    updates: Partial<Omit<UnifiedThread, 'id' | 'createdAt' | 'vaultId'>>
  ): boolean {
    const vaultId = this.findVaultForThread(threadId);
    if (!vaultId) return false;

    const threads = this.getThreadsForVault(vaultId);
    const threadIndex = threads.findIndex((t) => t.id === threadId);
    if (threadIndex === -1) return false;

    const updatedThread = {
      ...threads[threadIndex],
      ...updates,
      lastActivity: new Date()
    };

    // Update notes discussed if messages changed
    if (updates.messages) {
      updatedThread.notesDiscussed = extractNotesDiscussed(updates.messages);
      // Auto-update title if it's still the default and we have user messages
      if (updatedThread.title === 'New Thread' && updates.messages.length > 0) {
        const hasUserMessage = updates.messages.some((msg) => msg.sender === 'user');
        if (hasUserMessage) {
          updatedThread.title = generateThreadTitle(updates.messages);
        }
      }
    }

    const updatedThreads = [
      ...threads.slice(0, threadIndex),
      updatedThread,
      ...threads.slice(threadIndex + 1)
    ];

    // Create a new Map to trigger Svelte reactivity
    const newMap = new Map(this.state.threadsByVault);
    newMap.set(vaultId, updatedThreads);
    this.state.threadsByVault = newMap;

    if (!this.effectsInitialized) this.saveToStorage();
    return true;
  }

  deleteThread(threadId: string): boolean {
    const vaultId = this.findVaultForThread(threadId);
    if (!vaultId) return false;

    const threads = this.getThreadsForVault(vaultId);
    const filteredThreads = threads.filter((t) => t.id !== threadId);

    // Create a new Map to trigger Svelte reactivity
    const newMap = new Map(this.state.threadsByVault);
    newMap.set(vaultId, filteredThreads);
    this.state.threadsByVault = newMap;

    // If we deleted the active thread, switch to the most recent one
    if (this.state.activeThreadId === threadId) {
      this.state.activeThreadId =
        filteredThreads.length > 0 ? filteredThreads[0].id : null;
    }

    if (!this.effectsInitialized) this.saveToStorage();
    return threads.length !== filteredThreads.length;
  }

  async switchToThread(threadId: string): Promise<boolean> {
    const vaultId = this.findVaultForThread(threadId);
    if (!vaultId) return false;

    const threads = this.getThreadsForVault(vaultId);
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return false;

    this.state.activeThreadId = threadId;

    // Update last activity
    this.updateThread(threadId, { lastActivity: new Date() });

    // Sync thread history with backend
    try {
      const chatService = getChatService();
      if ('setActiveConversation' in chatService) {
        // Serialize messages for IPC transfer
        const serializableMessages = thread.messages.map((msg) =>
          this.serializeMessage(msg)
        );

        // Send as JSON string to avoid IPC cloning issues
        const messagesAsString = JSON.stringify(serializableMessages);
        await (chatService as ExtendedChatService).setActiveConversation(
          threadId,
          messagesAsString
        );
      }
    } catch (error) {
      console.warn('Failed to sync thread with backend:', error);
    }

    if (!this.effectsInitialized) this.saveToStorage();
    return true;
  }

  // Archive/unarchive operations
  archiveThread(threadId: string): boolean {
    return this.updateThread(threadId, { isArchived: true });
  }

  unarchiveThread(threadId: string): boolean {
    return this.updateThread(threadId, { isArchived: false });
  }

  // Message operations
  async addMessage(message: Message): Promise<void> {
    if (this.isVaultSwitching) return;

    // Ensure vault is initialized
    await this.ensureVaultInitialized();

    let thread = this.activeThread;
    if (!thread) {
      // Create a new thread if none exists
      await this.createThread(message);
      thread = this.activeThread;
      if (!thread) return;
    }

    const updatedMessages = [...thread.messages, message];
    this.updateThread(thread.id, { messages: updatedMessages });
  }

  addMessageToThread(threadId: string, message: Message): boolean {
    const thread = this.findThread(threadId);
    if (!thread) return false;

    const updatedMessages = [...thread.messages, message];
    return this.updateThread(threadId, { messages: updatedMessages });
  }

  updateMessage(messageId: string, updates: Partial<Message>): void {
    if (this.isVaultSwitching) return;

    const thread = this.activeThread;
    if (!thread) return;

    const messageIndex = thread.messages.findIndex((m) => m.id === messageId);
    if (messageIndex !== -1) {
      const updatedMessages = [...thread.messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        ...updates
      };
      this.updateThread(thread.id, { messages: updatedMessages });
    }
  }

  // Vault operations
  async refreshForVault(vaultId?: string): Promise<void> {
    console.log('🔄 refreshForVault: switching threads to vault', vaultId);
    this.isVaultSwitching = true;

    // Save current state before switching
    if (!this.effectsInitialized) this.saveToStorage();

    if (vaultId) {
      this.state.currentVaultId = vaultId;
      this.vaultInitialized = true; // Mark as initialized since we have the vault ID
    } else {
      try {
        const service = getChatService();
        const vault = await service.getCurrentVault();
        this.state.currentVaultId = vault?.id || 'default';
        this.vaultInitialized = true;
      } catch (error) {
        console.warn('Failed to get current vault for threads:', error);
        this.state.currentVaultId = 'default';
        this.vaultInitialized = true;
      }
    }

    // Load threads for new vault (they're already in memory)
    const currentThreads = this.getThreadsForCurrentVault();
    this.state.activeThreadId = currentThreads.length > 0 ? currentThreads[0].id : null;

    console.log(
      '💾 refreshForVault: loaded',
      currentThreads.length,
      'threads for vault',
      this.state.currentVaultId
    );

    // Sync active thread with backend after switching
    await this.syncActiveThreadWithBackend();

    this.isVaultSwitching = false;
  }

  // Search and utility operations
  searchThreadsInVault(query: string, vaultId?: string): UnifiedThread[] {
    const targetVaultId = vaultId || this.state.currentVaultId || 'default';
    const threads = this.getThreadsForVault(targetVaultId);
    const lowerQuery = query.toLowerCase();

    return threads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(lowerQuery) ||
        thread.messages.some((msg) => msg.text.toLowerCase().includes(lowerQuery)) ||
        thread.notesDiscussed.some((note) => note.toLowerCase().includes(lowerQuery))
    );
  }

  getThreadsWithNote(noteId: string, vaultId?: string): UnifiedThread[] {
    const targetVaultId = vaultId || this.state.currentVaultId || 'default';
    const threads = this.getThreadsForVault(targetVaultId);
    return threads.filter((thread) => thread.notesDiscussed.includes(noteId));
  }

  clearAllThreads(): void {
    const vaultId = this.state.currentVaultId || 'default';

    // Create a new Map to trigger Svelte reactivity
    const newMap = new Map(this.state.threadsByVault);
    newMap.set(vaultId, []);
    this.state.threadsByVault = newMap;
    this.state.activeThreadId = null;
    if (!this.effectsInitialized) this.saveToStorage();
  }

  // Cost tracking
  recordThreadUsage(
    threadId: string,
    usageData: {
      modelName: string;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      cost: number;
      timestamp: Date;
    }
  ): boolean {
    const thread = this.findThread(threadId);
    if (!thread) return false;

    // Update cost info
    thread.costInfo.totalCost += usageData.cost;
    thread.costInfo.inputTokens += usageData.inputTokens;
    thread.costInfo.outputTokens += usageData.outputTokens;
    thread.costInfo.cachedTokens += usageData.cachedTokens;
    thread.costInfo.requestCount += 1;
    thread.costInfo.lastUpdated = usageData.timestamp;

    // Update or add model breakdown
    const existingModelIndex = thread.costInfo.modelUsage.findIndex(
      (m) => m.model === usageData.modelName
    );

    if (existingModelIndex !== -1) {
      const existingModel = thread.costInfo.modelUsage[existingModelIndex];
      existingModel.inputTokens += usageData.inputTokens;
      existingModel.outputTokens += usageData.outputTokens;
      existingModel.cachedTokens += usageData.cachedTokens;
      existingModel.cost += usageData.cost;
    } else {
      thread.costInfo.modelUsage.push({
        model: usageData.modelName,
        inputTokens: usageData.inputTokens,
        outputTokens: usageData.outputTokens,
        cachedTokens: usageData.cachedTokens,
        cost: usageData.cost
      });
    }

    // Trigger reactivity by updating the thread
    this.updateThread(threadId, {});
    return true;
  }

  getTotalCost(): number {
    return this.allThreads.reduce(
      (total, thread) => total + thread.costInfo.totalCost,
      0
    );
  }

  // Private helper methods
  private findThread(threadId: string): UnifiedThread | null {
    for (const threads of this.state.threadsByVault.values()) {
      const thread = threads.find((t) => t.id === threadId);
      if (thread) return thread;
    }
    return null;
  }

  private findVaultForThread(threadId: string): string | null {
    for (const [vaultId, threads] of this.state.threadsByVault.entries()) {
      if (threads.some((t) => t.id === threadId)) {
        return vaultId;
      }
    }
    return null;
  }

  private enforceThreadLimitForVault(vaultId: string): void {
    const threads = this.getThreadsForVault(vaultId);
    if (threads.length > this.state.maxThreadsPerVault) {
      const sortedThreads = threads.sort(
        (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
      );

      // Create a new Map to trigger Svelte reactivity
      const newMap = new Map(this.state.threadsByVault);
      newMap.set(vaultId, sortedThreads.slice(0, this.state.maxThreadsPerVault));
      this.state.threadsByVault = newMap;
    }
  }

  private getStorageKey(): string {
    return 'flint-unified-chat-store';
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);

        // Convert threadsByVault from object to Map and restore dates
        if (parsed.threadsByVault) {
          this.state.threadsByVault.clear();
          for (const [vaultId, threads] of Object.entries(parsed.threadsByVault)) {
            const restoredThreads = (threads as UnifiedThread[]).map((thread) => ({
              ...thread,
              createdAt: new Date(thread.createdAt),
              lastActivity: new Date(thread.lastActivity),
              costInfo: {
                ...thread.costInfo,
                lastUpdated: new Date(thread.costInfo.lastUpdated)
              },
              messages: thread.messages.map((msg: Message) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              }))
            }));
            this.state.threadsByVault.set(vaultId, restoredThreads);
          }
        }

        // Restore other state properties
        this.state.activeThreadId = parsed.activeThreadId || null;
        this.state.currentVaultId = parsed.currentVaultId || 'default';
        this.state.maxThreadsPerVault = parsed.maxThreadsPerVault || 50;
      }
    } catch (error) {
      console.warn('Failed to load unified chat store from storage:', error);
      this.state = { ...defaultState };
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      // Convert Map to object for JSON serialization
      const threadsByVaultObject: Record<string, UnifiedThread[]> = {};
      for (const [vaultId, threads] of this.state.threadsByVault.entries()) {
        threadsByVaultObject[vaultId] = threads;
      }

      const toSave = {
        threadsByVault: threadsByVaultObject,
        activeThreadId: this.state.activeThreadId,
        currentVaultId: this.state.currentVaultId,
        maxThreadsPerVault: this.state.maxThreadsPerVault
      };

      localStorage.setItem(this.getStorageKey(), JSON.stringify(toSave));
    } catch (error) {
      console.warn('Failed to save unified chat store to storage:', error);
    }
  }

  private async syncActiveThreadWithBackend(): Promise<void> {
    if (this.state.activeThreadId && !this.isVaultSwitching) {
      const activeThread = this.activeThread;
      if (activeThread) {
        try {
          const chatService = getChatService();
          if ('setActiveConversation' in chatService) {
            // Serialize messages for IPC transfer
            const serializableMessages = activeThread.messages.map((msg) =>
              this.serializeMessage(msg)
            );

            // Send as JSON string to avoid IPC cloning issues
            try {
              const messagesAsString = JSON.stringify(serializableMessages);
              await (chatService as ExtendedChatService).setActiveConversation(
                this.state.activeThreadId,
                messagesAsString
              );
            } catch {
              // Fallback to empty conversation if serialization fails
              await (chatService as ExtendedChatService).setActiveConversation(
                this.state.activeThreadId,
                []
              );
            }
          }
        } catch (error) {
          console.warn('Failed to sync active thread with backend:', error);
        }
      }
    }
  }

  private serializeMessage(message: Message): Record<string, unknown> {
    const serialized: Record<string, unknown> = {
      id: message.id,
      text: message.text,
      sender: message.sender,
      timestamp: message.timestamp.toISOString() // Convert Date to string
    };

    // Safely serialize toolCalls if they exist
    if (message.toolCalls && message.toolCalls.length > 0) {
      serialized.toolCalls = message.toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.name,
        arguments: this.safeStringify(toolCall.arguments), // Safely stringify arguments
        result: toolCall.result,
        error: toolCall.error
      }));
    }

    return serialized;
  }

  private safeStringify(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    try {
      // First, try the simple approach
      return JSON.parse(JSON.stringify(obj));
    } catch {
      try {
        // More aggressive cleaning for complex objects
        return this.deepCleanObject(obj);
      } catch {
        // If all else fails, convert to string representation
        return String(obj);
      }
    }
  }

  private deepCleanObject(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle primitive types
    if (typeof obj !== 'object') {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj
        .map((item) => this.deepCleanObject(item))
        .filter((item) => item !== undefined);
    }

    // Handle objects
    const cleaned: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        // Skip functions, symbols, and other non-serializable types
        if (
          typeof value === 'function' ||
          typeof value === 'symbol' ||
          typeof value === 'undefined'
        ) {
          continue;
        }

        // Handle Date objects
        if (value instanceof Date) {
          cleaned[key] = value.toISOString();
          continue;
        }

        try {
          // Test if this property can be serialized
          JSON.stringify(value);
          cleaned[key] = this.deepCleanObject(value);
        } catch {
          // If it can't be serialized, convert to string or skip
          cleaned[key] = String(value);
        }
      }
    }

    return cleaned;
  }
}

export const unifiedChatStore = new UnifiedChatStore();
