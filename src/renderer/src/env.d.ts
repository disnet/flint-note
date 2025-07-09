/// <reference types="svelte" />
/// <reference types="vite/client" />

declare global {
  interface Window {
    electron: unknown;
    api: {
      llm: {
        generateResponse: (messages: unknown[]) => Promise<unknown>;
        streamResponse: (messages: unknown[]) => Promise<unknown>;
        testConnection: () => Promise<unknown>;
        updateConfig: (config: unknown) => Promise<unknown>;
        getConfig: () => Promise<unknown>;
        onStreamChunk: (callback: (chunk: string) => void) => void;
        onStreamEnd: (callback: (fullResponse: string) => void) => void;
        onStreamError: (callback: (error: string) => void) => void;
        removeStreamListeners: () => void;
      };
    };
  }
}
