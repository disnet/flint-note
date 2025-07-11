import type { MCPTool } from '../types/chat';

export class MCPClient {
  async getTools(): Promise<MCPTool[]> {
    const response = (await window.api.mcp.getTools()) as any;
    if (!response.success) {
      throw new Error(response.error || 'Failed to get MCP tools');
    }
    return response.tools || [];
  }

  async isEnabled(): Promise<boolean> {
    const response = (await window.api.mcp.isEnabled()) as any;
    if (!response.success) {
      throw new Error(response.error || 'Failed to check MCP enabled status');
    }
    return response.enabled || false;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const response = (await window.api.mcp.setEnabled(enabled)) as any;
    if (!response.success) {
      throw new Error(response.error || 'Failed to set MCP enabled status');
    }
  }

  async getStatus(): Promise<{
    success: boolean;
    status: {
      connected: boolean;
      toolCount: number;
      error?: string;
    };
  }> {
    const response = (await window.api.mcp.getStatus()) as any;
    if (!response.success) {
      throw new Error(response.error || 'Failed to get MCP status');
    }
    return response;
  }

  async reconnect(): Promise<void> {
    const response = (await window.api.mcp.reconnect()) as any;
    if (!response.success) {
      throw new Error(response.error || 'Failed to reconnect MCP');
    }
  }

  async testConnection(): Promise<{
    success: boolean;
    result: {
      success: boolean;
      error?: string;
    };
  }> {
    const response = (await window.api.mcp.testConnection()) as any;
    if (!response.success) {
      throw new Error(response.error || 'Failed to test MCP connection');
    }
    return response;
  }

  async callTool(toolCall: {
    name: string;
    arguments: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    console.log('🔧 MCPClient.callTool called with:', toolCall);
    console.log('🔧 Tool name:', toolCall.name);
    console.log('🔧 Tool arguments:', JSON.stringify(toolCall.arguments));

    const response = (await window.api.mcp.callTool(toolCall)) as any;
    console.log('🔧 MCPClient.callTool response:', response);

    return response;
  }
}

export const mcpClient = new MCPClient();
