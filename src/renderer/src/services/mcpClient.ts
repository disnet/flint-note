import type { MCPTool, MCPResponse, MCPServer } from '../../../shared/types';

export class MCPClient {
  private api: typeof window.api.mcp;

  constructor() {
    this.api = window.api?.mcp;
    if (!this.api) {
      throw new Error('MCP API not available. Make sure the preload script is loaded.');
    }
  }

  async getAvailableTools(): Promise<MCPTool[]> {
    try {
      const response = (await this.api.getTools()) as MCPResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to get MCP tools');
      }

      return response.tools || [];
    } catch (error) {
      console.error('Error getting MCP tools:', error);
      return [];
    }
  }

  async isEnabled(): Promise<boolean> {
    try {
      const response = (await this.api.isEnabled()) as MCPResponse;

      if (!response.success) {
        return false;
      }

      return response.enabled || false;
    } catch (error) {
      console.error('Error checking MCP status:', error);
      return false;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    try {
      const response = (await this.api.setEnabled(enabled)) as MCPResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to set MCP enabled state');
      }
    } catch (error) {
      console.error('Error setting MCP enabled state:', error);
      throw error;
    }
  }

  isAvailable(): boolean {
    return !!this.api;
  }

  async getToolByName(name: string): Promise<MCPTool | null> {
    const tools = await this.getAvailableTools();
    return tools.find((tool) => tool.name === name) || null;
  }

  async hasWeatherTools(): Promise<boolean> {
    const tools = await this.getAvailableTools();
    return tools.some(
      (tool) => tool.name === 'get_weather' || tool.name === 'get_forecast'
    );
  }

  async getServers(): Promise<MCPServer[]> {
    try {
      const response = (await this.api.getServers()) as MCPResponse;

      if (!response.success) {
        throw new Error(response.error || 'Failed to get MCP servers');
      }

      return response.servers || [];
    } catch (error) {
      console.error('Error getting MCP servers:', error);
      return [];
    }
  }

  async addServer(server: Omit<MCPServer, 'id'>): Promise<MCPServer> {
    try {
      // Debug logging
      console.log('MCPClient.addServer called with:', server);
      console.log('Server type:', typeof server);
      console.log('Server keys:', Object.keys(server));
      console.log('Args type:', typeof server.args, 'Array?', Array.isArray(server.args));
      console.log(
        'Env type:',
        typeof server.env,
        'Keys:',
        server.env ? Object.keys(server.env) : 'null'
      );

      // Try to serialize to catch issues early
      try {
        const serialized = JSON.stringify(server);
        console.log('Server serializes OK, length:', serialized.length);
      } catch (serErr) {
        console.error('Server serialization failed:', serErr);
        throw new Error('Server object cannot be serialized: ' + serErr.message);
      }

      const response = (await this.api.addServer(server)) as {
        success: boolean;
        server?: MCPServer;
        error?: string;
      };

      if (!response.success) {
        throw new Error(response.error || 'Failed to add MCP server');
      }

      return response.server!;
    } catch (error) {
      console.error('Error adding MCP server:', error);
      throw error;
    }
  }

  async updateServer(serverId: string, updates: Partial<MCPServer>): Promise<MCPServer> {
    try {
      const response = (await this.api.updateServer(serverId, updates)) as {
        success: boolean;
        server?: MCPServer;
        error?: string;
      };

      if (!response.success) {
        throw new Error(response.error || 'Failed to update MCP server');
      }

      return response.server!;
    } catch (error) {
      console.error('Error updating MCP server:', error);
      throw error;
    }
  }

  async removeServer(serverId: string): Promise<boolean> {
    try {
      const response = (await this.api.removeServer(serverId)) as {
        success: boolean;
        removed?: boolean;
        error?: string;
      };

      if (!response.success) {
        throw new Error(response.error || 'Failed to remove MCP server');
      }

      return response.removed || false;
    } catch (error) {
      console.error('Error removing MCP server:', error);
      throw error;
    }
  }

  async testServer(server: Omit<MCPServer, 'id'>): Promise<{
    success: boolean;
    error?: string;
    toolCount?: number;
  }> {
    try {
      // Debug logging
      console.log('MCPClient.testServer called with:', server);
      console.log('Server type:', typeof server);
      console.log('Server keys:', Object.keys(server));
      console.log('Args type:', typeof server.args, 'Array?', Array.isArray(server.args));
      console.log(
        'Env type:',
        typeof server.env,
        'Keys:',
        server.env ? Object.keys(server.env) : 'null'
      );

      // Try to serialize to catch issues early
      try {
        const serialized = JSON.stringify(server);
        console.log('Server serializes OK, length:', serialized.length);
      } catch (serErr) {
        console.error('Server serialization failed:', serErr);
        throw new Error('Server object cannot be serialized: ' + serErr.message);
      }

      const response = (await this.api.testServer(server)) as {
        success: boolean;
        result?: {
          success: boolean;
          error?: string;
          toolCount?: number;
        };
        error?: string;
      };

      if (!response.success) {
        throw new Error(response.error || 'Failed to test MCP server');
      }

      return response.result!;
    } catch (error) {
      console.error('Error testing MCP server:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const mcpClient = new MCPClient();
