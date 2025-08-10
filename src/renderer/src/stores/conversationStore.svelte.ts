import type { Message } from '../services/types';
import { getChatService } from '../services/chatService';

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  vaultId: string;
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
  startNewConversation(): string {
    if (this.isVaultSwitching) return this.state.activeConversationId || '';

    const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newConversation: Conversation = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      vaultId: this.currentVaultId || 'default'
    };

    // Add to the beginning of the list (most recent first)
    this.state.conversations.unshift(newConversation);
    this.state.activeConversationId = conversationId;

    // Enforce conversation limit
    this.enforceConversationLimit();
    this.saveToStorage();

    return conversationId;
  }

  /**
   * Add a message to the active conversation
   */
  addMessage(message: Message): void {
    if (this.isVaultSwitching) return;

    let conversation = this.activeConversation;
    if (!conversation) {
      // Start a new conversation if none exists
      this.startNewConversation();
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
  switchToConversation(conversationId: string): boolean {
    const conversation = this.state.conversations.find((c) => c.id === conversationId);
    if (conversation) {
      this.state.activeConversationId = conversationId;
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
  setCurrentMessages(messages: Message[]): void {
    if (this.isVaultSwitching) return;

    let conversation = this.activeConversation;
    if (!conversation) {
      this.startNewConversation();
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
              }
            ) => ({
              ...conv,
              createdAt: new Date(conv.createdAt),
              updatedAt: new Date(conv.updatedAt),
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

    this.isVaultSwitching = false;
  }
}

export const conversationStore = new ConversationStore();
