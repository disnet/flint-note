/// <reference types="svelte" />
/// <reference types="vite/client" />

import type { LLMMessage } from '../../shared/types';

declare global {
  interface Window {
    electron: unknown;
    api: {
      llm: {
        generateResponse: (messages: LLMMessage[]) => Promise<unknown>;
        streamResponse: (messages: LLMMessage[]) => Promise<unknown>;
        testConnection: () => Promise<unknown>;
        updateConfig: (config: unknown) => Promise<unknown>;
        getConfig: () => Promise<unknown>;
        onStreamChunk: (callback: (chunk: string) => void) => void;
        onStreamEnd: (callback: (fullResponse: string) => void) => void;
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
        }) => Promise<unknown>;
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
