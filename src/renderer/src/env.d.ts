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
      };
    };
  }
}
