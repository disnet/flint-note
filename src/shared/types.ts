export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  modelName: string;
  temperature: number;
  maxTokens: number;
}

export interface LLMResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export interface ToolCallInfo {
  name: string;
  arguments: Record<string, any>;
  result?: string;
  error?: string;
  timestamp: Date;
  duration?: number;
}

export interface LLMResponseWithToolCalls {
  success: boolean;
  content?: string;
  toolCalls?: ToolCallInfo[];
  error?: string;
}

export interface LLMConnectionTest {
  success: boolean;
  connected: boolean;
  error?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  description?: string;
  env?: Record<string, string>;
}

export interface MCPServerConfig {
  servers: MCPServer[];
}

export interface MCPResponse {
  success: boolean;
  tools?: MCPTool[];
  enabled?: boolean;
  servers?: MCPServer[];
  error?: string;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPResourceContent {
  uri: string;
  mimeType: string;
  text?: string;
  blob?: Uint8Array;
}

export interface NoteMetadata {
  id: string;
  type: string;
  filename: string;
  title: string;
  created: string;
  modified: string;
  size: number;
  tags: string[];
  path: string;
}

export interface Note extends NoteMetadata {
  content: string;
  content_hash: string;
  metadata: {
    title: string;
    type: string;
    created: string;
    updated: string;
    tags: string[];
  };
  updated: string;
}

export interface NoteType {
  name: string;
  count?: number;
  path?: string;
  purpose?: string;
  agentInstructions?: string[];
  hasDescription?: boolean;
  lastModified?: string;
}
