import type { Message, ChatService } from '../services/types';

interface ExtendedChatService extends ChatService {
  setActiveConversation(
    conversationId: string,
    messages: Message[] | string
  ): Promise<{ success: boolean; error?: string }>;
}
import { getChatService } from '../services/chatService';

export interface ModelUsageBreakdown {
  model: string; // e.g., "anthropic/claude-3-5-sonnet-20241022"
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number; // in USD cents
}

export interface ConversationCostInfo {
  totalCost: number; // in USD cents to avoid floating point precision issues
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requestCount: number;
  modelUsage: ModelUsageBreakdown[];
  lastUpdated: Date;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  vaultId: string;
  costInfo: ConversationCostInfo;
}

interface ConversationState {
  conversations: Conversation[];
  activeConversationId: string | null;
  maxConversations: number;
}

const defaultState: ConversationState = {
  conversations: [],
  activeConversationId: null,
  maxConversations: 50 // Keep up to 50 conversations per vault
};

class ConversationStore {
  private state = $state<ConversationState>(defaultState);
  private currentVaultId: string | null = null;
  private isVaultSwitching = false;

  constructor() {
    this.initializeVault();
  }

  get conversations(): Conversation[] {
    return this.state.conversations;
  }

  get activeConversation(): Conversation | null {
    if (!this.state.activeConversationId) return null;
    return (
      this.state.conversations.find((c) => c.id === this.state.activeConversationId) ||
      null
    );
  }

  get activeConversationId(): string | null {
    return this.state.activeConversationId;
  }

  /**
   * Start a new conversation
   */
  async startNewConversation(): Promise<string> {
    if (this.isVaultSwitching) return this.state.activeConversationId || '';

    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    const newConversation: Conversation = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
      vaultId: this.currentVaultId || 'default',
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

    // Add to the beginning of the list (most recent first)
    this.state.conversations.unshift(newConversation);
    this.state.activeConversationId = conversationId;

    // Sync new conversation with backend
    try {
      const chatService = getChatService();
      if ('setActiveConversation' in chatService) {
        await (chatService as ExtendedChatService).setActiveConversation(
          conversationId,
          []
        );
      }
    } catch (error) {
      console.warn('Failed to sync new conversation with backend:', error);
    }

    // Enforce conversation limit
    this.enforceConversationLimit();
    this.saveToStorage();

    return conversationId;
  }

  /**
   * Add a message to the active conversation
   */
  async addMessage(message: Message): Promise<void> {
    if (this.isVaultSwitching) return;

    let conversation = this.activeConversation;
    if (!conversation) {
      // Start a new conversation if none exists
      await this.startNewConversation();
      conversation = this.activeConversation;
      if (!conversation) return;
    }

    conversation.messages.push(message);

    // Update conversation title based on first user message
    this.updateConversationTitle();
    this.updateConversationTimestamp();
    this.saveToStorage();
  }

  /**
   * Update a message in the active conversation (for streaming updates)
   */
  updateMessage(messageId: string, updates: Partial<Message>): void {
    if (this.isVaultSwitching) return;

    const conversation = this.activeConversation;
    if (!conversation) return;

    const messageIndex = conversation.messages.findIndex((m) => m.id === messageId);
    if (messageIndex !== -1) {
      conversation.messages[messageIndex] = {
        ...conversation.messages[messageIndex],
        ...updates
      };
      this.updateConversationTimestamp();
      this.saveToStorage();
    }
  }

  /**
   * Switch to an existing conversation
   */
  async switchToConversation(conversationId: string): Promise<boolean> {
    const conversation = this.state.conversations.find((c) => c.id === conversationId);
    if (conversation) {
      this.state.activeConversationId = conversationId;

      // Sync conversation history with backend
      try {
        const chatService = getChatService();
        if ('setActiveConversation' in chatService) {
          // Serialize messages for IPC transfer
          const serializableMessages = conversation.messages.map((msg) =>
            this.serializeMessage(msg)
          );

          // Send as JSON string to avoid IPC cloning issues
          const messagesAsString = JSON.stringify(serializableMessages);
          await (chatService as ExtendedChatService).setActiveConversation(
            conversationId,
            messagesAsString
          );
        }
      } catch (error) {
        console.warn('Failed to sync conversation with backend:', error);
      }

      this.saveToStorage();
      return true;
    }
    return false;
  }

  /**
   * Delete a conversation
   */
  deleteConversation(conversationId: string): void {
    const conversationIndex = this.state.conversations.findIndex(
      (c) => c.id === conversationId
    );
    if (conversationIndex !== -1) {
      this.state.conversations.splice(conversationIndex, 1);

      // If we deleted the active conversation, switch to the next one
      if (this.state.activeConversationId === conversationId) {
        this.state.activeConversationId =
          this.state.conversations.length > 0 ? this.state.conversations[0].id : null;
      }

      this.saveToStorage();
    }
  }

  /**
   * Clear all conversations
   */
  clearAllConversations(): void {
    this.state.conversations = [];
    this.state.activeConversationId = null;
    this.saveToStorage();
  }

  /**
   * Get current messages for the active conversation (for backwards compatibility)
   */
  get currentMessages(): Message[] {
    return this.activeConversation?.messages || [];
  }

  /**
   * Set messages for the active conversation (for backwards compatibility)
   */
  async setCurrentMessages(messages: Message[]): Promise<void> {
    if (this.isVaultSwitching) return;

    let conversation = this.activeConversation;
    if (!conversation) {
      await this.startNewConversation();
      conversation = this.activeConversation;
      if (!conversation) return;
    }

    conversation.messages = messages;
    this.updateConversationTitle();
    this.updateConversationTimestamp();
    this.saveToStorage();
  }

  private updateConversationTitle(): void {
    const conversation = this.activeConversation;
    if (!conversation) return;

    // Update title based on first user message if it's still the default
    if (conversation.title === 'New Conversation' && conversation.messages.length > 0) {
      const firstUserMessage = conversation.messages.find((m) => m.sender === 'user');
      if (firstUserMessage) {
        // Take first 50 characters of the first user message as title
        conversation.title = firstUserMessage.text.slice(0, 50).trim();
        if (firstUserMessage.text.length > 50) {
          conversation.title += '...';
        }
      }
    }
  }

  private updateConversationTimestamp(): void {
    const conversation = this.activeConversation;
    if (conversation) {
      conversation.updatedAt = new Date();
      // Move to top of list to maintain recency order
      this.moveConversationToTop(conversation.id);
    }
  }

  private moveConversationToTop(conversationId: string): void {
    const conversationIndex = this.state.conversations.findIndex(
      (c) => c.id === conversationId
    );
    if (conversationIndex > 0) {
      // Don't move if already at top
      const [conversation] = this.state.conversations.splice(conversationIndex, 1);
      this.state.conversations.unshift(conversation);
    }
  }

  private enforceConversationLimit(): void {
    if (this.state.conversations.length > this.state.maxConversations) {
      this.state.conversations = this.state.conversations.slice(
        0,
        this.state.maxConversations
      );
    }
  }

  private async initializeVault(): Promise<void> {
    try {
      const service = getChatService();
      const vault = await service.getCurrentVault();
      this.currentVaultId = vault?.id || 'default';
      this.loadFromStorage();

      // Sync active conversation with backend on app startup
      await this.syncActiveConversationWithBackend();
    } catch (error) {
      console.warn('Failed to initialize vault for conversations:', error);
      this.currentVaultId = 'default';
      this.loadFromStorage();
    }
  }

  private getStorageKey(): string {
    const vaultId = this.currentVaultId || 'default';
    return `conversations-${vaultId}`;
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(this.getStorageKey());
      if (stored) {
        const parsed = JSON.parse(stored);

        // Convert date strings back to Date objects and message timestamps
        if (parsed.conversations) {
          parsed.conversations = parsed.conversations.map(
            (
              conv: Conversation & {
                createdAt: string;
                updatedAt: string;
                messages: Array<Message & { timestamp: string }>;
                costInfo?: ConversationCostInfo & { lastUpdated: string };
              }
            ) => ({
              ...conv,
              createdAt: new Date(conv.createdAt),
              updatedAt: new Date(conv.updatedAt),
              // Initialize costInfo for legacy conversations that don't have it
              costInfo: conv.costInfo
                ? {
                    ...conv.costInfo,
                    lastUpdated: new Date(conv.costInfo.lastUpdated)
                  }
                : {
                    totalCost: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    cachedTokens: 0,
                    requestCount: 0,
                    modelUsage: [],
                    lastUpdated: new Date()
                  },
              messages: conv.messages.map((msg) => ({
                ...msg,
                timestamp: new Date(msg.timestamp)
              }))
            })
          );
        }

        this.state = { ...defaultState, ...parsed };

        // Ensure we don't exceed conversation limit
        this.enforceConversationLimit();
      }
    } catch (error) {
      console.warn('Failed to load conversations from storage:', error);
      this.state = { ...defaultState };
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(this.state));
    } catch (error) {
      console.warn('Failed to save conversations to storage:', error);
    }
  }

  async refreshForVault(vaultId?: string): Promise<void> {
    console.log('🔄 refreshForVault: switching conversations to vault', vaultId);
    this.isVaultSwitching = true;

    // Save current state before switching
    this.saveToStorage();

    if (vaultId) {
      this.currentVaultId = vaultId;
    } else {
      try {
        const service = getChatService();
        const vault = await service.getCurrentVault();
        this.currentVaultId = vault?.id || 'default';
      } catch (error) {
        console.warn('Failed to get current vault for conversations:', error);
      }
    }

    // Reset state and load for new vault
    this.state = {
      conversations: [],
      activeConversationId: null,
      maxConversations: 50
    };

    this.loadFromStorage();
    console.log(
      '💾 refreshForVault: loaded',
      this.state.conversations.length,
      'conversations for vault',
      this.currentVaultId
    );

    // Sync active conversation with backend after loading
    await this.syncActiveConversationWithBackend();

    this.isVaultSwitching = false;
  }

  /**
   * Serialize a message for IPC transfer
   */
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

  /**
   * Safely stringify any object, handling circular references and non-serializable values
   */
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

  /**
   * Deep clean an object by removing all non-serializable properties
   */
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

  /**
   * Sync the active conversation with the backend (for app startup and vault switching)
   */
  private async syncActiveConversationWithBackend(): Promise<void> {
    if (this.state.activeConversationId && !this.isVaultSwitching) {
      const activeConversation = this.activeConversation;
      if (activeConversation) {
        try {
          const chatService = getChatService();
          if ('setActiveConversation' in chatService) {
            // Serialize messages for IPC transfer
            const serializableMessages = activeConversation.messages.map((msg) =>
              this.serializeMessage(msg)
            );

            // Send as JSON string to avoid IPC cloning issues
            try {
              const messagesAsString = JSON.stringify(serializableMessages);
              await (chatService as ExtendedChatService).setActiveConversation(
                this.state.activeConversationId,
                messagesAsString
              );
            } catch {
              // Fallback to empty conversation if serialization fails
              await (chatService as ExtendedChatService).setActiveConversation(
                this.state.activeConversationId,
                []
              );
            }
          }
        } catch (error) {
          console.warn('Failed to sync active conversation with backend:', error);
        }
      }
    }
  }

  /**
   * Record usage and cost data for a conversation
   */
  recordConversationUsage(
    conversationId: string,
    usageData: {
      modelName: string;
      inputTokens: number;
      outputTokens: number;
      cachedTokens: number;
      cost: number;
      timestamp: Date;
    }
  ): boolean {
    const conversation = this.state.conversations.find((c) => c.id === conversationId);
    if (!conversation) return false;

    // Update cost info
    conversation.costInfo.totalCost += usageData.cost;
    conversation.costInfo.inputTokens += usageData.inputTokens;
    conversation.costInfo.outputTokens += usageData.outputTokens;
    conversation.costInfo.cachedTokens += usageData.cachedTokens;
    conversation.costInfo.requestCount += 1;
    conversation.costInfo.lastUpdated = usageData.timestamp;

    // Update or add model breakdown
    const existingModelIndex = conversation.costInfo.modelUsage.findIndex(
      (m) => m.model === usageData.modelName
    );

    if (existingModelIndex !== -1) {
      const existingModel = conversation.costInfo.modelUsage[existingModelIndex];
      existingModel.inputTokens += usageData.inputTokens;
      existingModel.outputTokens += usageData.outputTokens;
      existingModel.cachedTokens += usageData.cachedTokens;
      existingModel.cost += usageData.cost;
    } else {
      conversation.costInfo.modelUsage.push({
        model: usageData.modelName,
        inputTokens: usageData.inputTokens,
        outputTokens: usageData.outputTokens,
        cachedTokens: usageData.cachedTokens,
        cost: usageData.cost
      });
    }

    this.saveToStorage();
    return true;
  }

  /**
   * Get total cost across all conversations
   */
  getTotalCost(): number {
    return this.state.conversations.reduce(
      (total, conversation) => total + conversation.costInfo.totalCost,
      0
    );
  }
}

export const conversationStore = new ConversationStore();
