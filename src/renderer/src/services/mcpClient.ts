import type { MCPTool, MCPResponse } from '../../../shared/types';

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
}

// Export singleton instance
export const mcpClient = new MCPClient();
