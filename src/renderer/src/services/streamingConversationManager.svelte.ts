import type { Message, ToolCall } from './types';

/**
 * Configuration for the streaming conversation manager
 */
export interface StreamingManagerConfig {
  /** Callback to add a new message */
  addMessage: (message: Message) => void | Promise<void>;
  /** Callback to update an existing message */
  updateMessage: (messageId: string, updates: Partial<Message>) => void | Promise<void>;
  /** Callback to get current messages (for cleanup) */
  getMessages: () => Message[];
  /** Callback to set all messages (for cleanup) */
  setMessages: (messages: Message[]) => void | Promise<void>;
  /** Optional callback when streaming text updates */
  onStreamingTextChange?: (text: string) => void;
  /** Optional callback after streaming completes (after cleanup) */
  onComplete?: () => void | Promise<void>;
  /** Optional callback after error */
  onError?: (error: string) => void;
}

/**
 * Streaming state exposed by the manager
 */
export interface StreamingState {
  isLoading: boolean;
  streamingText: string;
  currentToolCalls: ToolCall[];
  currentStepIndex: number;
  error: string | null;
}

/**
 * Handlers returned by createStreamingHandlers for use with sendMessageStream
 */
export interface StreamingHandlers {
  onChunk: (chunk: string) => void;
  onComplete: (fullText: string) => void;
  onError: (error: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (toolResult: ToolCall) => void;
}

/**
 * Creates a streaming conversation manager that handles the complex logic
 * of interleaved text and tool call messages.
 *
 * This manager:
 * - Creates placeholder messages for streaming text
 * - Groups tool calls by step index into separate messages
 * - Creates new messages for text after tool calls
 * - Cleans up empty placeholder messages on completion
 *
 * Used by both ActionBar (local state) and App.svelte (unifiedChatStore).
 */
export class StreamingConversationManager {
  private config: StreamingManagerConfig;

  // Streaming state (reactive for UI)
  private _isLoading = $state(false);
  private _streamingText = $state('');
  private _currentToolCalls = $state<ToolCall[]>([]);
  private _currentStepIndex = $state(0);
  private _error = $state<string | null>(null);

  // Internal tracking (non-reactive)
  private currentMessageId: string | null = null;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  private toolCallMessageIdsByStep: Map<number, string> = new Map();
  private highestStepIndexSeen = 0;

  constructor(config: StreamingManagerConfig) {
    this.config = config;
  }

  // Expose state as getters
  get isLoading(): boolean {
    return this._isLoading;
  }

  get streamingText(): string {
    return this._streamingText;
  }

  get currentToolCalls(): ToolCall[] {
    return this._currentToolCalls;
  }

  get currentStepIndex(): number {
    return this._currentStepIndex;
  }

  get error(): string | null {
    return this._error;
  }

  /**
   * Get current streaming state (useful for passing to components)
   */
  get state(): StreamingState {
    return {
      isLoading: this._isLoading,
      streamingText: this._streamingText,
      currentToolCalls: this._currentToolCalls,
      currentStepIndex: this._currentStepIndex,
      error: this._error
    };
  }

  /**
   * Generate a unique message ID
   */
  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Reset all streaming state
   */
  reset(): void {
    this._isLoading = false;
    this._streamingText = '';
    this._currentToolCalls = [];
    this._currentStepIndex = 0;
    this._error = null;
    this.currentMessageId = null;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    this.toolCallMessageIdsByStep = new Map();
    this.highestStepIndexSeen = 0;
  }

  /**
   * Start a new streaming session
   * Creates the initial placeholder message and returns handlers for sendMessageStream
   */
  startStreaming(): StreamingHandlers {
    // Reset state
    this._streamingText = '';
    this._error = null;
    this._isLoading = true;
    this._currentToolCalls = [];
    this._currentStepIndex = 0;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    this.toolCallMessageIdsByStep = new Map();
    this.highestStepIndexSeen = 0;

    // Create initial placeholder message for streaming text
    const initialMsgId = this.generateMessageId();
    this.currentMessageId = initialMsgId;
    const initialMsg: Message = {
      id: initialMsgId,
      text: '',
      sender: 'agent',
      // eslint-disable-next-line svelte/prefer-svelte-reactivity
      timestamp: new Date()
    };
    this.config.addMessage(initialMsg);

    // Return handlers for sendMessageStream
    return {
      onChunk: this.handleChunk.bind(this),
      onComplete: this.handleComplete.bind(this),
      onError: this.handleError.bind(this),
      onToolCall: this.handleToolCall.bind(this),
      onToolResult: this.handleToolResult.bind(this)
    };
  }

  /**
   * Handle incoming text chunk
   */
  private handleChunk(chunk: string): void {
    this._streamingText += chunk;
    this.config.onStreamingTextChange?.(this._streamingText);

    if (this.currentMessageId) {
      const messages = this.config.getMessages();
      const currentMsg = messages.find((m) => m.id === this.currentMessageId);
      if (currentMsg) {
        this.config.updateMessage(this.currentMessageId, {
          text: currentMsg.text + chunk
        });
      }
    }
  }

  /**
   * Handle streaming completion
   */
  private handleComplete(_fullText: string): void {
    this._isLoading = false;
    this._streamingText = '';

    // Mark the final step as completed if we have tool calls
    if (this.toolCallMessageIdsByStep.size > 0) {
      const finalStepMessageId = this.toolCallMessageIdsByStep.get(
        this.highestStepIndexSeen
      );
      if (finalStepMessageId) {
        // Mark with a high index to indicate streaming is done
        this.config.updateMessage(finalStepMessageId, {
          currentStepIndex: this.highestStepIndexSeen + 1
        });
      }
    }

    // Remove empty messages (placeholders that never got content)
    const messages = this.config.getMessages();
    const filteredMessages = messages.filter((msg) => {
      if (msg.sender === 'user') return true;
      if (msg.text.trim() !== '') return true;
      if (msg.toolCalls && msg.toolCalls.length > 0) return true;
      return false;
    });

    if (filteredMessages.length !== messages.length) {
      this.config.setMessages(filteredMessages);
    }

    // Reset streaming tracking state
    this._currentToolCalls = [];
    this._currentStepIndex = 0;
    this.currentMessageId = null;
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    this.toolCallMessageIdsByStep = new Map();
    this.highestStepIndexSeen = 0;

    // Call optional completion callback
    this.config.onComplete?.();
  }

  /**
   * Handle streaming error
   */
  private handleError(error: string): void {
    this._isLoading = false;
    this._error = error;

    // Call optional error callback
    this.config.onError?.(error);
  }

  /**
   * Handle tool call arrival
   */
  private handleToolCall(toolCall: ToolCall): void {
    const stepIndex = toolCall.stepIndex ?? 0;

    // Detect step change and mark previous step as complete
    if (stepIndex > this.highestStepIndexSeen) {
      const previousStepMessageId = this.toolCallMessageIdsByStep.get(
        this.highestStepIndexSeen
      );
      if (previousStepMessageId) {
        this.config.updateMessage(previousStepMessageId, {
          currentStepIndex: stepIndex // Mark as completed
        });
      }
      this.highestStepIndexSeen = stepIndex;
    }

    // Update current step for live display
    if (stepIndex > this._currentStepIndex) {
      this._currentStepIndex = stepIndex;
    }

    // Check if we already have a message for this step
    if (!this.toolCallMessageIdsByStep.has(stepIndex)) {
      // First tool call of this step - create a new message
      const toolCallMsgId = this.generateMessageId();
      this.toolCallMessageIdsByStep.set(stepIndex, toolCallMsgId);

      const toolCallMsg: Message = {
        id: toolCallMsgId,
        text: '',
        sender: 'agent',
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        timestamp: new Date(),
        toolCalls: [toolCall],
        currentStepIndex: stepIndex
      };
      this.config.addMessage(toolCallMsg);

      // Create placeholder for text after tool calls
      const postToolMsgId = this.generateMessageId();
      const postToolMsg: Message = {
        id: postToolMsgId,
        text: '',
        sender: 'agent',
        // eslint-disable-next-line svelte/prefer-svelte-reactivity
        timestamp: new Date()
      };
      this.config.addMessage(postToolMsg);
      this.currentMessageId = postToolMsgId;
    } else {
      // Add tool call to existing step's message
      const toolCallMessageId = this.toolCallMessageIdsByStep.get(stepIndex)!;
      const messages = this.config.getMessages();
      const toolCallMessage = messages.find((m) => m.id === toolCallMessageId);
      if (toolCallMessage) {
        this.config.updateMessage(toolCallMessageId, {
          toolCalls: [...(toolCallMessage.toolCalls || []), toolCall]
        });
      }
    }

    // Update live tool calls display
    this._currentToolCalls = [...this._currentToolCalls, toolCall];
  }

  /**
   * Handle tool call result
   */
  private handleToolResult(toolResult: ToolCall): void {
    const stepIndex = toolResult.stepIndex ?? 0;
    const toolCallMessageId = this.toolCallMessageIdsByStep.get(stepIndex);

    if (toolCallMessageId) {
      const messages = this.config.getMessages();
      const toolCallMessage = messages.find((m) => m.id === toolCallMessageId);
      if (toolCallMessage && toolCallMessage.toolCalls) {
        this.config.updateMessage(toolCallMessageId, {
          toolCalls: toolCallMessage.toolCalls.map((tc) =>
            tc.id === toolResult.id
              ? { ...tc, result: toolResult.result, error: toolResult.error }
              : tc
          )
        });
      }
    }

    // Update live tool calls display
    this._currentToolCalls = this._currentToolCalls.map((tc) =>
      tc.id === toolResult.id
        ? { ...tc, result: toolResult.result, error: toolResult.error }
        : tc
    );
  }
}

/**
 * Factory function to create a streaming conversation manager
 */
export function createStreamingManager(
  config: StreamingManagerConfig
): StreamingConversationManager {
  return new StreamingConversationManager(config);
}
