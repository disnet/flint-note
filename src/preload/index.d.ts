import { ElectronAPI } from '@electron-toolkit/preload';
import type { MCPToolResult } from '../shared/types';

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
  callTool: (toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  }) => Promise<{ success: boolean; result?: MCPToolResult; error?: string }>;
}

export interface FlintApiNote {
  id?: string;
  title?: string;
  content?: string;
  type?: string;
  path?: string;
  created?: string;
  updated?: string;
  metadata?: Record<string, unknown>;
}

interface FlintApiSearchOptions {
  type_filter?: string;
  limit?: number;
  use_regex?: boolean;
  vaultId?: string;
  fields?: string[];
}

interface FlintApiAdvancedSearchOptions {
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
}

interface FlintApiSearchResult {
  notes?: FlintApiNote[];
  total?: number;
  query?: string;
  timing?: Record<string, unknown>;
}

interface FlintApiResponse<T = unknown> {
  success: boolean;
  result?: T;
  note?: FlintApiNote;
  error?: string;
}

interface FlintApiStatus {
  isReady: boolean;
  config: Record<string, unknown>;
}

interface FlintApiConnectionTest {
  success: boolean;
  error?: string;
}

interface FlintAPI {
  getNote: (
    identifier: string,
    vaultId?: string
  ) => Promise<FlintApiResponse<FlintApiNote>>;
  updateNoteContent: (
    identifier: string,
    content: string,
    vaultId?: string
  ) => Promise<FlintApiResponse<unknown>>;
  createSimpleNote: (
    type: string,
    identifier: string,
    content: string,
    vaultId?: string
  ) => Promise<FlintApiResponse<unknown>>;
  searchNotes: (
    query: string,
    options?: FlintApiSearchOptions
  ) => Promise<FlintApiResponse<FlintApiSearchResult>>;
  searchNotesAdvanced: (
    options?: FlintApiAdvancedSearchOptions
  ) => Promise<FlintApiResponse<FlintApiSearchResult>>;
  getStatus: () => Promise<FlintApiResponse<FlintApiStatus>>;
  testConnection: () => Promise<FlintApiResponse<FlintApiConnectionTest>>;
}

interface FileSystemAPI {
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
}

interface SettingsAPI {
  getPath: () => Promise<{ success: boolean; path?: string; error?: string }>;
}

interface API {
  llm: LLMAPI;
  mcp: MCPAPI;
  flintApi: FlintAPI;
  fileSystem: FileSystemAPI;
  settings: SettingsAPI;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: API;
  }
}
