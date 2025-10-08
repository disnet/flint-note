import type { Message, ChatService, ToolCall } from '../services/types';
import { getChatService } from '../services/chatService';

interface ExtendedChatService extends ChatService {
  setActiveConversation(
    conversationId: string,
    messages: Message[] | string
  ): Promise<{ success: boolean; error?: string }>;
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
  isArchived?: boolean;

  // Timestamps
  createdAt: Date;
  lastActivity: Date;
}

// Serialized data types for deserialization

interface SerializedMessage {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: string | Date;
  toolCalls?: ToolCall[];
}

interface SerializedThread {
  id: string;
  title: string;
  vaultId: string;
  messages: SerializedMessage[];
  notesDiscussed: string[];
  isArchived?: boolean;
  createdAt: string | Date;
  lastActivity: string | Date;
}

interface UnifiedChatState {
  // Vault-scoped threads
  threadsByVault: Map<string, UnifiedThread[]>;
  activeThreadId: string | null;
  currentVaultId: string | null;

  // Settings
  maxThreadsPerVault: number;
  isLoading: boolean;
  isInitialized: boolean;
}

const defaultState: UnifiedChatState = {
  threadsByVault: new Map(),
  activeThreadId: null,
  currentVaultId: null,
  maxThreadsPerVault: 50,
  isLoading: false,
  isInitialized: false
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
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize vault in constructor to avoid circular dependencies
    // Vault will be initialized lazily when needed
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    this.state.isLoading = true;
    try {
      // First, try to migrate any old localStorage data to the new format
      await this.migrateOldStorage();

      // Initialize vault
      await this.ensureVaultInitialized();

      // Load data for current vault
      await this.loadFromStorage();

      // Sync active thread with backend after loading threads
      await this.syncActiveThreadWithBackend();
    } catch (error) {
      console.warn('Failed to initialize unified chat store:', error);
    } finally {
      this.state.isLoading = false;
      this.state.isInitialized = true;
      this.initializationPromise = null;
    }
  }

  // Initialize reactive effects
  initializeEffects(): void {
    if (this.effectsInitialized) return;
    this.effectsInitialized = true;

    // Initialize vault when effects are set up
    this.ensureVaultInitialized();

    // Auto-save effect
    $effect(() => {
      if (this.state.isInitialized && this.state.currentVaultId) {
        this.saveToStorage().catch((error) => {
          console.warn('Auto-save failed:', error);
        });
      }
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

  get initialized(): boolean {
    return this.state.isInitialized;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
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
      lastActivity: now
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
    if (!this.effectsInitialized) await this.saveToStorage();

    return threadId;
  }

  async updateThread(
    threadId: string,
    updates: Partial<Omit<UnifiedThread, 'id' | 'createdAt' | 'vaultId'>>
  ): Promise<boolean> {
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

    if (!this.effectsInitialized) await this.saveToStorage();
    return true;
  }

  async deleteThread(threadId: string): Promise<boolean> {
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

    if (!this.effectsInitialized) await this.saveToStorage();
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
    await this.updateThread(threadId, { lastActivity: new Date() });

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

    if (!this.effectsInitialized) await this.saveToStorage();
    return true;
  }

  // Archive/unarchive operations
  async archiveThread(threadId: string): Promise<boolean> {
    return await this.updateThread(threadId, { isArchived: true });
  }

  async unarchiveThread(threadId: string): Promise<boolean> {
    return await this.updateThread(threadId, { isArchived: false });
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

    // Check for duplicate message ID and skip if it already exists
    if (thread.messages.some((m) => m.id === message.id)) {
      console.warn(`Message with ID ${message.id} already exists, skipping duplicate`);
      return;
    }

    const updatedMessages = [...thread.messages, message];
    await this.updateThread(thread.id, { messages: updatedMessages });
  }

  async addMessageToThread(threadId: string, message: Message): Promise<boolean> {
    const thread = this.findThread(threadId);
    if (!thread) return false;

    // Check for duplicate message ID and skip if it already exists
    if (thread.messages.some((m) => m.id === message.id)) {
      console.warn(
        `Message with ID ${message.id} already exists in thread ${threadId}, skipping duplicate`
      );
      return false;
    }

    const updatedMessages = [...thread.messages, message];
    return await this.updateThread(threadId, { messages: updatedMessages });
  }

  async updateMessage(messageId: string, updates: Partial<Message>): Promise<void> {
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
      await this.updateThread(thread.id, { messages: updatedMessages });
    }
  }

  // Vault operations
  async refreshForVault(vaultId?: string): Promise<void> {
    console.log('🔄 refreshForVault: switching threads to vault', vaultId);
    this.isVaultSwitching = true;

    // Save current state before switching
    if (!this.effectsInitialized) await this.saveToStorage();

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

  async clearAllThreads(): Promise<void> {
    const vaultId = this.state.currentVaultId || 'default';

    // Create a new Map to trigger Svelte reactivity
    const newMap = new Map(this.state.threadsByVault);
    newMap.set(vaultId, []);
    this.state.threadsByVault = newMap;
    this.state.activeThreadId = null;
    if (!this.effectsInitialized) await this.saveToStorage();
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

  private async migrateOldStorage(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Check for old localStorage data
      const oldData = localStorage.getItem('flint-unified-chat-store');
      if (oldData) {
        const parsed = JSON.parse(oldData);

        // Convert threadsByVault from object to Map and restore dates
        if (parsed.threadsByVault) {
          for (const [vaultId, threads] of Object.entries(parsed.threadsByVault)) {
            const threadArray = threads as SerializedThread[];
            const processedThreads = threadArray.map((thread: SerializedThread) => ({
              ...thread,
              createdAt: new Date(thread.createdAt),
              lastActivity: new Date(thread.lastActivity)
            }));

            // Save each vault's threads to database
            try {
              await window.api?.saveUIState({
                vaultId,
                stateKey: 'conversations',
                stateValue: {
                  threads: processedThreads,
                  activeThreadId: parsed.activeThreadId,
                  maxThreadsPerVault: parsed.maxThreadsPerVault || 50
                }
              });
            } catch (error) {
              console.warn(
                `Failed to migrate conversations for vault ${vaultId}:`,
                error
              );
            }
          }
        }

        // Remove old localStorage data after successful migration
        localStorage.removeItem('flint-unified-chat-store');
        console.log(
          'Successfully migrated unified chat store from localStorage to file system'
        );
      }
    } catch (error) {
      console.warn('Failed to migrate old chat storage:', error);
    }
  }

  private deduplicateMessages(messages: Message[]): Message[] {
    const seen = new Set<string>();
    const deduplicated: Message[] = [];

    for (const message of messages) {
      if (!seen.has(message.id)) {
        seen.add(message.id);
        deduplicated.push(message);
      } else {
        console.warn(`Removing duplicate message with ID: ${message.id}`);
      }
    }

    return deduplicated;
  }

  private async loadFromStorage(): Promise<void> {
    if (!this.state.currentVaultId) return;

    try {
      const stored = await window.api?.loadUIState({
        vaultId: this.state.currentVaultId,
        stateKey: 'conversations'
      });
      if (
        stored &&
        typeof stored === 'object' &&
        'threads' in stored &&
        Array.isArray(stored.threads)
      ) {
        // Process threads with proper date conversion
        const processedThreads = stored.threads.map((thread: SerializedThread) => ({
          ...thread,
          createdAt: new Date(thread.createdAt),
          lastActivity: new Date(thread.lastActivity),
          messages: this.deduplicateMessages(
            thread.messages.map((msg: SerializedMessage) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          )
        }));

        // Update state for current vault
        const newMap = new Map(this.state.threadsByVault);
        newMap.set(this.state.currentVaultId, processedThreads);
        this.state.threadsByVault = newMap;

        // Only set activeThreadId if it exists in the loaded threads
        if (
          'activeThreadId' in stored &&
          typeof stored.activeThreadId === 'string' &&
          processedThreads.some((t: UnifiedThread) => t.id === stored.activeThreadId)
        ) {
          this.state.activeThreadId = stored.activeThreadId;
        }

        this.state.maxThreadsPerVault =
          'maxThreadsPerVault' in stored && typeof stored.maxThreadsPerVault === 'number'
            ? stored.maxThreadsPerVault
            : 50;
      }
    } catch (error) {
      console.warn('Failed to load conversations from storage:', error);
      // Initialize empty state for current vault on error
      if (this.state.currentVaultId) {
        const newMap = new Map(this.state.threadsByVault);
        newMap.set(this.state.currentVaultId, []);
        this.state.threadsByVault = newMap;
      }
    }
  }

  private async saveToStorage(): Promise<void> {
    if (!this.state.currentVaultId) return;

    try {
      const threadsForCurrentVault = this.getThreadsForCurrentVault();

      const toSave = {
        threads: threadsForCurrentVault,
        activeThreadId: this.state.activeThreadId,
        maxThreadsPerVault: this.state.maxThreadsPerVault
      };

      const serializable = $state.snapshot(toSave);
      await window.api?.saveUIState({
        vaultId: this.state.currentVaultId,
        stateKey: 'conversations',
        stateValue: serializable
      });
    } catch (error) {
      console.warn('Failed to save conversations to storage:', error);
      throw error; // Let component handle user feedback
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
