/**
 * Type definitions for the renderer services
 * Legacy server types have been removed - this file contains only types
 * that are still used in the Automerge version
 */

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown> | null | undefined;
  result?: string | Record<string, unknown>;
  error?: string;
  stepIndex?: number;
}

export interface ContextUsage {
  conversationId: string;
  systemPromptTokens: number;
  conversationHistoryTokens: number;
  totalTokens: number;
  maxTokens: number;
  percentage: number;
  warningLevel: 'none' | 'warning' | 'critical' | 'full';
  estimatedMessagesRemaining: number;
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'agent';
  timestamp: Date;
  toolCalls?: ToolCall[];
  currentStepIndex?: number;
}

export interface ChatResponse {
  text: string;
  toolCalls?: ToolCall[];
  hasToolCalls?: boolean;
  followUpResponse?: {
    text: string;
  };
}

export interface ChatService {
  sendMessage(
    text: string,
    conversationId?: string,
    model?: string
  ): Promise<ChatResponse>;
  sendMessageStream?(
    text: string,
    conversationId: string | undefined,
    onChunk: (chunk: string) => void,
    onComplete: (fullText: string) => void,
    onError: (error: string) => void,
    model?: string,
    onToolCall?: (toolCall: ToolCall) => void,
    onToolResult?: (toolCall: ToolCall) => void,
    onStoppedAtLimit?: (data: {
      requestId: string;
      stepCount: number;
      maxSteps: number;
      canContinue: boolean;
    }) => void
  ): string;
}
