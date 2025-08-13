import type { Message } from '../services/types';

export interface ModelUsageBreakdown {
  model: string; // e.g., "anthropic/claude-3-5-sonnet-20241022"
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number; // in USD cents
}

export interface ThreadCostInfo {
  totalCost: number; // in USD cents to avoid floating point precision issues
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  requestCount: number;
  modelUsage: ModelUsageBreakdown[];
  lastUpdated: Date;
}

export interface AIThread {
  id: string;
  title: string; // Auto-generated or user-set
  messages: Message[];
  notesDiscussed: string[]; // Note IDs/identifiers referenced in conversation
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  tags?: string[];
  isArchived?: boolean;
  costInfo: ThreadCostInfo;
}

interface AIThreadsState {
  threads: AIThread[];
  activeThreadId: string | null;
  maxThreads: number;
  isLoading: boolean;
}

const STORAGE_KEY = 'flint-ai-threads';
const MAX_THREADS_DEFAULT = 50;

// Helper function to generate a title from the first user message
function generateThreadTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((msg) => msg.sender === 'user');
  if (!firstUserMessage) return 'New Thread';

  // Take first 50 characters and clean up
  const title = firstUserMessage.text.slice(0, 50).trim();
  return title.length === 50 ? title + '...' : title;
}

// Helper function to extract notes discussed from messages
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

// Load initial state from localStorage
function loadInitialState(): AIThreadsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert date strings back to Date objects
      if (parsed.threads && Array.isArray(parsed.threads)) {
        parsed.threads = parsed.threads.map((thread: Record<string, unknown>) => ({
          ...thread,
          createdAt: new Date(thread.createdAt as string),
          lastActivity: new Date(thread.lastActivity as string),
          // Initialize costInfo for legacy threads that don't have it
          costInfo: thread.costInfo
            ? {
                ...(thread.costInfo as ThreadCostInfo),
                lastUpdated: new Date(
                  (
                    thread.costInfo as ThreadCostInfo & { lastUpdated: string }
                  ).lastUpdated
                )
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
          messages: Array.isArray(thread.messages)
            ? (thread.messages as Record<string, unknown>[]).map(
                (msg: Record<string, unknown>) => ({
                  ...msg,
                  timestamp: new Date(msg.timestamp as string)
                })
              )
            : []
        }));
      }
      return {
        threads: parsed.threads || [],
        activeThreadId: parsed.activeThreadId || null,
        maxThreads: parsed.maxThreads || MAX_THREADS_DEFAULT,
        isLoading: false
      };
    }
  } catch (error) {
    console.warn('Failed to load AI threads from storage:', error);
  }

  return {
    threads: [],
    activeThreadId: null,
    maxThreads: MAX_THREADS_DEFAULT,
    isLoading: false
  };
}

// Save state to localStorage
function saveState(state: AIThreadsState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
        maxThreads: state.maxThreads
      })
    );
  } catch (error) {
    console.warn('Failed to save AI threads to storage:', error);
  }
}

// Initialize state
const initialState = loadInitialState();
let threads = $state<AIThread[]>(initialState.threads);
let activeThreadId = $state<string | null>(initialState.activeThreadId);
let maxThreads = $state<number>(initialState.maxThreads);
const isLoading = $state<boolean>(false);

// Derived state
const activeThread = $derived<AIThread | null>(
  threads.find((thread) => thread.id === activeThreadId) || null
);

const sortedThreads = $derived<AIThread[]>(
  [...threads]
    .filter((thread) => !thread.isArchived)
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
);

const archivedThreads = $derived<AIThread[]>(
  [...threads]
    .filter((thread) => thread.isArchived)
    .sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime())
);

// Auto-save and cleanup effects - these need to be initialized from a component
let effectsInitialized = false;

function initializeEffects(): void {
  if (effectsInitialized) return;
  effectsInitialized = true;

  // Auto-save effect
  $effect(() => {
    saveState({ threads, activeThreadId, maxThreads, isLoading });
  });

  // Cleanup effect - remove old threads when over limit
  $effect(() => {
    if (threads.length > maxThreads) {
      const sortedByActivity = [...threads].sort(
        (a, b) => b.lastActivity.getTime() - a.lastActivity.getTime()
      );
      threads = sortedByActivity.slice(0, maxThreads);
    }
  });
}

export const aiThreadsStore = {
  // Initialize effects (must be called from a component)
  initializeEffects,
  // Getters
  get threads() {
    return threads;
  },
  get activeThreadId() {
    return activeThreadId;
  },
  get activeThread() {
    return activeThread;
  },
  get sortedThreads() {
    return sortedThreads;
  },
  get archivedThreads() {
    return archivedThreads;
  },
  get maxThreads() {
    return maxThreads;
  },
  get isLoading() {
    return isLoading;
  },

  // Thread CRUD operations
  createThread(initialMessage?: Message): AIThread {
    const now = new Date();
    const newThread: AIThread = {
      id: `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: initialMessage ? generateThreadTitle([initialMessage]) : 'New Thread',
      messages: initialMessage ? [initialMessage] : [],
      notesDiscussed: initialMessage ? extractNotesDiscussed([initialMessage]) : [],
      isActive: true,
      createdAt: now,
      lastActivity: now,
      isArchived: false,
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

    threads = [newThread, ...threads];
    activeThreadId = newThread.id;
    if (!effectsInitialized) this.save();
    return newThread;
  },

  updateThread(
    threadId: string,
    updates: Partial<Omit<AIThread, 'id' | 'createdAt'>>
  ): boolean {
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

    threads = [
      ...threads.slice(0, threadIndex),
      updatedThread,
      ...threads.slice(threadIndex + 1)
    ];
    if (!effectsInitialized) this.save();
    return true;
  },

  deleteThread(threadId: string): boolean {
    const initialLength = threads.length;
    threads = threads.filter((t) => t.id !== threadId);

    // If we deleted the active thread, switch to the most recent one
    if (activeThreadId === threadId) {
      activeThreadId = threads.length > 0 ? threads[0].id : null;
    }

    const changed = threads.length < initialLength;
    if (changed && !effectsInitialized) this.save();
    return changed;
  },

  archiveThread(threadId: string): boolean {
    return this.updateThread(threadId, { isArchived: true });
  },

  unarchiveThread(threadId: string): boolean {
    return this.updateThread(threadId, { isArchived: false });
  },

  // Thread management
  switchThread(threadId: string): boolean {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return false;

    activeThreadId = threadId;
    // Update last activity
    this.updateThread(threadId, { lastActivity: new Date() });
    if (!effectsInitialized) this.save();
    return true;
  },

  // Message operations
  addMessage(threadId: string, message: Message): boolean {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return false;

    const updatedMessages = [...thread.messages, message];
    return this.updateThread(threadId, { messages: updatedMessages });
  },

  addMessageToActiveThread(message: Message): boolean {
    if (!activeThreadId) {
      // Create a new thread if none exists
      this.createThread(message);
      return true;
    }
    return this.addMessage(activeThreadId, message);
  },

  updateMessage(threadId: string, messageId: string, updates: Partial<Message>): boolean {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return false;

    const messageIndex = thread.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return false;

    const updatedMessages = [...thread.messages];
    updatedMessages[messageIndex] = { ...updatedMessages[messageIndex], ...updates };

    return this.updateThread(threadId, { messages: updatedMessages });
  },

  // Utility operations
  clearAllThreads(): void {
    threads = [];
    activeThreadId = null;
    if (!effectsInitialized) this.save();
  },

  importThread(threadData: Partial<AIThread>): AIThread | null {
    if (!threadData.messages || threadData.messages.length === 0) return null;

    const now = new Date();
    const thread: AIThread = {
      id:
        threadData.id ||
        `thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: threadData.title || generateThreadTitle(threadData.messages),
      messages: threadData.messages,
      notesDiscussed:
        threadData.notesDiscussed || extractNotesDiscussed(threadData.messages),
      isActive: threadData.isActive ?? true,
      createdAt: threadData.createdAt || now,
      lastActivity: threadData.lastActivity || now,
      tags: threadData.tags || [],
      isArchived: threadData.isArchived || false,
      costInfo: threadData.costInfo || {
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        requestCount: 0,
        modelUsage: [],
        lastUpdated: now
      }
    };

    threads = [thread, ...threads];
    if (!effectsInitialized) this.save();
    return thread;
  },

  // Migration helper for existing chat history
  migrateFromMessages(messages: Message[]): AIThread | null {
    if (messages.length === 0) return null;

    const thread = this.importThread({
      title: 'Imported Conversation',
      messages,
      createdAt: messages[0]?.timestamp || new Date(),
      lastActivity: messages[messages.length - 1]?.timestamp || new Date()
    });

    if (thread && !activeThreadId) {
      activeThreadId = thread.id;
    }

    return thread;
  },

  // Settings
  setMaxThreads(max: number): void {
    maxThreads = Math.max(1, max);
    if (!effectsInitialized) this.save();
  },

  // Search and filtering
  searchThreads(query: string): AIThread[] {
    const lowerQuery = query.toLowerCase();
    return threads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(lowerQuery) ||
        thread.messages.some((msg) => msg.text.toLowerCase().includes(lowerQuery)) ||
        thread.notesDiscussed.some((note) => note.toLowerCase().includes(lowerQuery))
    );
  },

  getThreadsWithNote(noteId: string): AIThread[] {
    return threads.filter((thread) => thread.notesDiscussed.includes(noteId));
  },

  // Cost tracking methods
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
    const threadIndex = threads.findIndex((t) => t.id === threadId);
    if (threadIndex === -1) return false;

    const thread = threads[threadIndex];

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

    // Update the threads array to trigger reactivity
    threads = [
      ...threads.slice(0, threadIndex),
      thread,
      ...threads.slice(threadIndex + 1)
    ];

    if (!effectsInitialized) this.save();
    return true;
  },

  // Get total cost across all threads
  getTotalCost(): number {
    return threads.reduce((total, thread) => total + thread.costInfo.totalCost, 0);
  },

  // Get cost summary for all threads
  getCostSummary(): {
    totalCost: number;
    totalTokens: number;
    averageCostPerThread: number;
    threadsWithCost: number;
  } {
    const threadsWithCost = threads.filter((t) => t.costInfo.totalCost > 0);
    const totalCost = this.getTotalCost();
    const totalTokens = threads.reduce(
      (total, thread) =>
        total + thread.costInfo.inputTokens + thread.costInfo.outputTokens,
      0
    );

    return {
      totalCost,
      totalTokens,
      averageCostPerThread:
        threadsWithCost.length > 0 ? totalCost / threadsWithCost.length : 0,
      threadsWithCost: threadsWithCost.length
    };
  },

  // Manual save function for when effects aren't available
  save(): void {
    saveState({ threads, activeThreadId, maxThreads, isLoading });
  }
};
