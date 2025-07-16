
import { writable } from 'svelte/store';
import type { Message } from '../../types/chat';
import type { ToolCallInfo } from '../../../../shared/types';

export type ConversationStatus =
  | 'idle'
  | 'streaming'
  | 'awaitingToolResult'
  | 'generatingFinalResponse'
  | 'error';

export interface ConversationState {
  messages: Message[];
  status: ConversationStatus;
  error: string | null;
  streamingResponse: string;
  toolCalls: ToolCallInfo[];
}

export const conversationStore = writable<ConversationState>({
  messages: [
    {
      id: '1',
      type: 'system',
      content: "Welcome to Flint! I'm your AI assistant. How can I help you today?",
      timestamp: new Date()
    }
  ],
  status: 'idle',
  error: null,
  streamingResponse: '',
  toolCalls: []
});
