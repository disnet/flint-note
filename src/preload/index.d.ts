import { ElectronAPI } from '@electron-toolkit/preload';

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMConfig {
  baseURL: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

interface LLMResponse {
  success: boolean;
  data?: string;
  error?: string;
}

interface LLMConnectionTest {
  success: boolean;
  connected: boolean;
  error?: string;
}

interface LLMAPI {
  generateResponse: (messages: LLMMessage[]) => Promise<LLMResponse>;
  streamResponse: (messages: LLMMessage[]) => Promise<LLMResponse>;
  testConnection: () => Promise<LLMConnectionTest>;
  updateConfig: (config: Partial<LLMConfig>) => Promise<LLMResponse>;
  getConfig: () => Promise<{ success: boolean; config?: LLMConfig; error?: string }>;
  onStreamChunk: (callback: (chunk: string) => void) => void;
  onStreamEnd: (callback: (fullResponse: string) => void) => void;
  onStreamError: (callback: (error: string) => void) => void;
  removeStreamListeners: () => void;
}

interface MCPAPI {
  getTools: () => Promise<unknown>;
  isEnabled: () => Promise<unknown>;
  setEnabled: (enabled: boolean) => Promise<unknown>;
  getStatus: () => Promise<unknown>;
  reconnect: () => Promise<unknown>;
  testConnection: () => Promise<unknown>;
}

interface API {
  llm: LLMAPI;
  mcp: MCPAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: API;
  }
}
