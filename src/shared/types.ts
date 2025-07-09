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

export interface LLMConnectionTest {
  success: boolean;
  connected: boolean;
  error?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export interface MCPResponse {
  success: boolean;
  tools?: MCPTool[];
  enabled?: boolean;
  error?: string;
}
