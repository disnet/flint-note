import type { ToolCall, MCPTool, ToolCallInfo } from '../../../shared/types';

export interface Message {
  id: string;
  type: 'user' | 'agent' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCallInfo[];
  metadata?: {
    noteReferences?: NoteReference[];
    error?: boolean;
    toolCalls?: ToolCall[];
    toolCallId?: string;
  };
}

export interface NoteReference {
  id: string;
  title: string;
  type?: string | 'loading' | 'broken';
  path?: string;
}

export interface ChatState {
  messages: Message[];
  isTyping: boolean;
  currentVault?: string;
}

export interface SlashCommand {
  name: string;
  description: string;
  category: 'note' | 'vault' | 'prompt' | 'system' | 'tool';
  handler: (args: string[]) => Promise<void>;
}

// Re-export shared types for convenience
export type { MCPTool, ToolCall };
