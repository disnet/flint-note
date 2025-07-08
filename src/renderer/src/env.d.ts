/// <reference types="svelte" />
/// <reference types="vite/client" />

declare global {
  interface Window {
    electron: any;
    api: {
      llm: {
        generateResponse: (messages: any[]) => Promise<any>;
        streamResponse: (messages: any[]) => Promise<any>;
        testConnection: () => Promise<any>;
        updateConfig: (config: any) => Promise<any>;
        getConfig: () => Promise<any>;
        onStreamChunk: (callback: (chunk: string) => void) => void;
        onStreamEnd: (callback: (fullResponse: string) => void) => void;
        onStreamError: (callback: (error: string) => void) => void;
        removeStreamListeners: () => void;
      };
    };
  }
}
