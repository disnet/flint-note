import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsResultSchema,
  CallToolResultSchema,
  Tool,
  CallToolRequest
} from '@modelcontextprotocol/sdk/types.js';
import type { MCPTool, MCPToolCall, MCPToolResult } from '../../shared/types';

// Export types for use in other modules
export type { MCPTool, MCPToolCall, MCPToolResult };

interface MCPConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: MCPTool[];
  connected: boolean;
  lastError?: string;
}

export class MCPService {
  private connection: MCPConnection | null = null;
  private isInitialized = false;
  private availableTools: MCPTool[] = [];

  constructor() {
    // Initialize the service
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.isInitialized = true;
      console.log('✅ MCP Service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize MCP service:', error);
      this.isInitialized = false;
    }
  }

  async connect(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      await this.connectToFlintServer();
      this.updateAvailableTools();
    } catch (error) {
      console.error('❌ Failed to connect to Flint MCP server:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.transport.close();
        console.log('🔌 Disconnected from Flint MCP server');
      } catch (error) {
        console.error('❌ Error disconnecting from Flint server:', error);
      }
    }
    this.connection = null;
    this.availableTools = [];
  }

  private async connectToFlintServer(): Promise<void> {
    console.log('🔌 Connecting to Flint Note MCP server...');

    if (this.connection) {
      console.warn('⚠️ Already connected to Flint server');
      return;
    }

    try {
      // Create transport for stdio communication with hardcoded Flint server
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['@flint-note/server'],
        env: {
          ...(Object.fromEntries(
            Object.entries(process.env).filter(([, value]) => value !== undefined)
          ) as Record<string, string>)
        }
      });

      console.log('🚀 Created transport for Flint server');

      // Create MCP client
      const client = new Client(
        {
          name: 'flint-electron',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      console.log('👤 Created MCP client for Flint server');

      // Create connection object
      const connection: MCPConnection = {
        client,
        transport,
        tools: [],
        connected: false
      };

      this.connection = connection;
      console.log('📝 Connection object created');

      // Connect to server
      console.log('🔗 Connecting to Flint server...');
      await client.connect(transport);
      connection.connected = true;
      console.log('✅ Connected to Flint server');

      // List available tools from server
      try {
        console.log('📋 Requesting tools list from Flint server...');
        const toolsResult = await client.request(
          { method: 'tools/list' },
          ListToolsResultSchema
        );

        console.log('🔧 Raw tools response from Flint server:', toolsResult);

        // Convert MCP tools to our format
        connection.tools = toolsResult.tools.map((tool: Tool) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {}
        }));

        console.log(
          `✅ Connected to Flint MCP server with ${connection.tools.length} tools:`,
          connection.tools.map((t) => t.name)
        );
      } catch (error) {
        console.warn('⚠️ Failed to list tools from Flint server:', error);
        connection.tools = [];
      }

      // Set up error handlers
      transport.onclose = () => {
        console.log('🔌 Flint MCP server connection closed');
        if (this.connection) {
          this.connection.connected = false;
        }
        this.updateAvailableTools();
      };

      transport.onerror = (error: Error) => {
        console.error('❌ Flint MCP server error:', error);
        if (this.connection) {
          this.connection.connected = false;
          this.connection.lastError = error.message;
        }
        this.updateAvailableTools();
      };
    } catch (error) {
      console.error('❌ Failed to connect to Flint MCP server:', error);
      console.error(
        'Connection error stack:',
        error instanceof Error ? error.stack : 'No stack'
      );
      this.connection = null;
      throw error;
    }
  }

  private updateAvailableTools(): void {
    console.log('🔄 Updating available tools...');

    if (this.connection && this.connection.connected) {
      this.availableTools = [...this.connection.tools];
      console.log(`✅ Available tools updated: ${this.availableTools.length} tools`);
      console.log(
        '🔧 Tool names:',
        this.availableTools.map((t) => t.name)
      );
    } else {
      this.availableTools = [];
      console.log('⚠️ No connected server, tools cleared');
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return [...this.availableTools];
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    console.log('🔧 MCP Service callTool called with:', toolCall);

    if (!this.isInitialized) {
      console.log('⚠️ MCP Service not initialized, initializing...');
      await this.initialize();
    }

    try {
      console.log(
        '🔍 Available tools:',
        this.availableTools.map((t) => t.name)
      );

      // Find the tool in our available tools list
      const tool = this.availableTools.find((t) => t.name === toolCall.name);

      if (!tool) {
        console.error('❌ Tool not found:', toolCall.name);
        throw new Error(`Tool not found: ${toolCall.name}`);
      }

      console.log('✅ Tool found:', tool);

      // Check connection
      if (!this.connection || !this.connection.connected) {
        console.error('❌ No connection to Flint server');
        throw new Error('No connection to Flint server');
      }

      console.log('📡 Connection status: connected');

      // Prepare the MCP tool call request
      const mcpRequest: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: toolCall.name,
          arguments: toolCall.arguments
        }
      };

      console.log('📤 Sending MCP request:', mcpRequest);

      // Call the tool on the server
      const result = await this.connection.client.request(
        mcpRequest,
        CallToolResultSchema
      );

      console.log('📥 MCP response received:', result);

      // Convert MCP result to our format
      const mcpResult = {
        content: result.content.map((item) => ({
          type: item.type,
          text: (item as any).text || ''
        })),
        isError: result.isError || false
      };

      console.log('✅ MCP result converted:', mcpResult);

      return mcpResult;
    } catch (error) {
      console.error('❌ Error calling MCP tool:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
      return {
        content: [
          {
            type: 'text',
            text: `Error calling tool ${toolCall.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ],
        isError: true
      };
    }
  }

  isToolAvailable(toolName: string): boolean {
    return this.availableTools.some((tool) => tool.name === toolName);
  }

  getToolSchema(toolName: string): Record<string, unknown> | undefined {
    const tool = this.availableTools.find((tool) => tool.name === toolName);
    return tool?.inputSchema;
  }

  isReady(): boolean {
    return this.isInitialized && this.connection !== null && this.connection.connected;
  }

  getConnectionStatus(): { connected: boolean; toolCount: number; error?: string } {
    if (!this.connection) {
      return {
        connected: false,
        toolCount: 0,
        error: 'No connection initialized'
      };
    }

    return {
      connected: this.connection.connected,
      toolCount: this.connection.tools.length,
      error: this.connection.lastError
    };
  }

  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🧪 Testing Flint MCP server connection...');

      // Create temporary transport
      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['@flint-note/server'],
        env: {
          ...(Object.fromEntries(
            Object.entries(process.env).filter(([, value]) => value !== undefined)
          ) as Record<string, string>)
        }
      });

      // Create temporary client
      const client = new Client(
        {
          name: 'flint-electron-test',
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      // Test connection
      console.log('🔗 Testing connection to Flint server...');
      await client.connect(transport);

      // Try to list tools
      console.log('📋 Testing tools list...');
      const toolsResult = await client.request(
        { method: 'tools/list' },
        ListToolsResultSchema
      );
      console.log('✅ Test successful, found', toolsResult.tools.length, 'tools');

      // Close test connection
      await transport.close();

      return { success: true };
    } catch (error) {
      console.error('❌ Test connection failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const mcpService = new MCPService();
