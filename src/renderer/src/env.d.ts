/// <reference types="svelte" />
/// <reference types="vite/client" />

import type { FlintApiNote } from '../../preload';
import type { LLMMessage } from '../../shared/types';

declare global {
  interface Window {
    electron: unknown;
    api: {
      llm: {
        generateResponse: (messages: LLMMessage[]) => Promise<unknown>;
        streamResponse: (messages: LLMMessage[]) => Promise<unknown>;
        streamResponseWithTools: (messages: LLMMessage[]) => Promise<unknown>;
        getFinalResponseAfterTools: (originalMessages: LLMMessage[], toolCallInfos: any[]) => Promise<unknown>;
        testConnection: () => Promise<unknown>;
        updateConfig: (config: unknown) => Promise<unknown>;
        getConfig: () => Promise<unknown>;
        onStreamChunk: (callback: (chunk: string) => void) => void;
        onStreamEnd: (callback: (fullResponse: string) => void) => void;
        onStreamEndWithTools: (callback: (response: any) => void) => void;
        onStreamError: (callback: (error: string) => void) => void;
        removeStreamListeners: () => void;
      };
      mcp: {
        getTools: () => Promise<unknown>;
        isEnabled: () => Promise<unknown>;
        setEnabled: (enabled: boolean) => Promise<unknown>;
        getStatus: () => Promise<unknown>;
        reconnect: () => Promise<unknown>;
        testConnection: () => Promise<unknown>;
        callTool: (toolCall: {
          name: string;
          arguments: Record<string, unknown>;
        }) => Promise<{ success: boolean; result?: MCPToolResult; error?: string }>;
      };
      flintApi: {
        getNote: (
          identifier: string,
          vaultId?: string
        ) => Promise<{
          success: boolean;
          note?: FlintApiNote;
          error?: string;
        }>;
        updateNoteContent: (
          identifier: string,
          content: string,
          vaultId?: string
        ) => Promise<{ success: boolean; result?: unknown; error?: string }>;
        createSimpleNote: (
          type: string,
          identifier: string,
          content: string,
          vaultId?: string
        ) => Promise<{ success: boolean; result?: unknown; error?: string }>;
        searchNotes: (
          query: string,
          options?: {
            type_filter?: string;
            limit?: number;
            use_regex?: boolean;
            vaultId?: string;
            fields?: string[];
          }
        ) => Promise<{ success: boolean; result?: unknown; error?: string }>;
        searchNotesAdvanced: (options?: {
          query?: string;
          type?: string;
          metadata_filters?: Array<{
            key: string;
            value: string;
            operator?: string;
          }>;
          updated_within?: string;
          updated_before?: string;
          created_within?: string;
          created_before?: string;
          content_contains?: string;
          sort?: Array<{
            field: string;
            order: string;
          }>;
          limit?: number;
          offset?: number;
          vaultId?: string;
          fields?: string[];
        }) => Promise<{ success: boolean; result?: unknown; error?: string }>;
        getStatus: () => Promise<{
          success: boolean;
          isReady?: boolean;
          config?: unknown;
          error?: string;
        }>;
        testConnection: () => Promise<{
          success: boolean;
          result?: { success: boolean; error?: string };
          error?: string;
        }>;
      };
      fileSystem: {
        readFile: (
          filePath: string
        ) => Promise<{ success: boolean; content?: string; error?: string }>;
        writeFile: (
          filePath: string,
          content: string
        ) => Promise<{ success: boolean; error?: string }>;
        watchFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        unwatchFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
        onFileChange: (callback: (filePath: string, content: string) => void) => void;
        removeFileListeners: () => void;
      };
    };
  }
}
