import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsResultSchema,
  CallToolResultSchema,
  Tool,
  CallToolRequest
} from '@modelcontextprotocol/sdk/types.js';
import { mcpConfigService } from './mcpConfigService';
import type { MCPTool, MCPToolCall, MCPToolResult, MCPServer } from '../../shared/types';

// Export types for use in other modules
export type { MCPTool, MCPToolCall, MCPToolResult, MCPServer };

interface MCPConnection {
  server: MCPServer;
  client: Client;
  transport: StdioClientTransport;
  tools: MCPTool[];
  connected: boolean;
  lastError?: string;
}

interface MCPToolWithServer extends MCPTool {
  serverId: string;
  serverName: string;
  originalName: string;
  hasConflict: boolean;
}

export class MCPService {
  private connections: Map<string, MCPConnection> = new Map();
  private isInitialized = false;
  private availableTools: MCPToolWithServer[] = [];

  constructor() {
    // Initialize the service
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await mcpConfigService.loadConfig();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize MCP service:', error);
      this.isInitialized = false;
    }
  }

  async connect(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const enabledServers = await mcpConfigService.getEnabledServers();

      // Connect to all enabled servers
      for (const server of enabledServers) {
        try {
          await this.connectToServer(server);
        } catch (error) {
          console.error(`Failed to connect to MCP server ${server.name}:`, error);
        }
      }

      // Update available tools
      await this.updateAvailableTools();
    } catch (error) {
      console.error('Failed to connect to MCP servers:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    for (const [serverId] of this.connections) {
      try {
        await this.disconnectFromServer(serverId);
      } catch (error) {
        console.error(`Error disconnecting from server ${serverId}:`, error);
      }
    }
    this.connections.clear();
    this.availableTools = [];
  }

  private async connectToServer(server: MCPServer): Promise<void> {
    console.log(`🔌 Attempting to connect to MCP server: ${server.name}`);
    console.log(`Command: ${server.command}, Args: ${server.args?.join(' ')}`);

    if (this.connections.has(server.id)) {
      console.warn(`Already connected to server ${server.name}`);
      return;
    }

    try {
      const env = {
        ...(Object.fromEntries(
          Object.entries(process.env).filter(([, value]) => value !== undefined)
        ) as Record<string, string>),
        ...server.env
      };

      console.log(`🌍 Environment variables for ${server.name}:`, Object.keys(env));

      // Create transport for stdio communication
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: env
      });

      console.log(`🚀 Created transport for ${server.name}`);

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

      console.log(`👤 Created MCP client for ${server.name}`);

      // Create connection object
      const connection: MCPConnection = {
        server,
        client,
        transport,
        tools: [],
        connected: false
      };

      // Add to connections map
      this.connections.set(server.id, connection);
      console.log(`📝 Added connection to map for ${server.name}`);

      // Connect to server
      console.log(`🔗 Connecting to server ${server.name}...`);
      await client.connect(transport);
      connection.connected = true;
      console.log(`✅ Connected to server ${server.name}`);

      // List available tools from server
      try {
        console.log(`📋 Requesting tools list from ${server.name}...`);
        const toolsResult = await client.request(
          { method: 'tools/list' },
          ListToolsResultSchema
        );

        console.log(`🔧 Raw tools response from ${server.name}:`, toolsResult);

        // Convert MCP tools to our format - keep original names for LLM
        connection.tools = toolsResult.tools.map((tool: Tool) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {}
        }));

        console.log(
          `✅ Connected to MCP server ${server.name} with ${connection.tools.length} tools:`,
          connection.tools.map((t) => t.name)
        );
      } catch (error) {
        console.warn(`⚠️ Failed to list tools from server ${server.name}:`, error);
        connection.tools = [];
      }

      // Set up error handlers
      transport.onclose = () => {
        console.log(`🔌 MCP server ${server.name} connection closed`);
        connection.connected = false;
        this.updateAvailableTools();
      };

      transport.onerror = (error: Error) => {
        console.error(`❌ MCP server ${server.name} error:`, error);
        connection.connected = false;
        connection.lastError = error.message;
        this.updateAvailableTools();
      };
    } catch (error) {
      console.error(`❌ Failed to connect to MCP server ${server.name}:`, error);
      console.error(
        'Connection error stack:',
        error instanceof Error ? error.stack : 'No stack'
      );
      // Remove failed connection
      this.connections.delete(server.id);
      throw error;
    }
  }

  private async disconnectFromServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }

    try {
      // Close the transport connection
      if (connection.transport) {
        await connection.transport.close();
      }

      // Remove from connections
      this.connections.delete(serverId);

      console.log(`Disconnected from MCP server ${connection.server.name}`);
    } catch (error) {
      console.error(`Error disconnecting from server ${serverId}:`, error);
      throw error;
    }
  }

  private async updateAvailableTools(): Promise<void> {
    console.log('🔄 Updating available tools...');
    this.availableTools = [];

    // Add tools from all connected servers
    const allToolsWithServer: MCPToolWithServer[] = [];

    console.log(`📊 Processing ${this.connections.size} connections`);
    for (const connection of this.connections.values()) {
      console.log(
        `🔍 Connection ${connection.server.name}: connected=${connection.connected}, tools=${connection.tools.length}`
      );
      if (connection.connected) {
        const toolsWithServer = connection.tools.map((tool) => ({
          ...tool,
          serverId: connection.server.id,
          serverName: connection.server.name,
          originalName: tool.name,
          hasConflict: false
        }));
        allToolsWithServer.push(...toolsWithServer);
        console.log(
          `➕ Added ${toolsWithServer.length} tools from ${connection.server.name}`
        );
      }
    }

    console.log(
      `🔧 Total tools before conflict resolution: ${allToolsWithServer.length}`
    );

    // Check for tool name conflicts and namespace when needed
    const toolNameCounts = new Map<string, number>();
    allToolsWithServer.forEach((tool) => {
      toolNameCounts.set(
        tool.originalName,
        (toolNameCounts.get(tool.originalName) || 0) + 1
      );
    });

    console.log('📊 Tool name counts:', Object.fromEntries(toolNameCounts));

    // Update tool names and conflict flags
    this.availableTools = allToolsWithServer.map((tool) => {
      const hasConflict = (toolNameCounts.get(tool.originalName) || 0) > 1;
      const finalName = hasConflict
        ? `${tool.serverName}:${tool.originalName}`
        : tool.originalName;
      console.log(
        `🏷️ Tool ${tool.originalName} -> ${finalName} (conflict: ${hasConflict})`
      );
      return {
        ...tool,
        name: finalName,
        hasConflict
      };
    });

    console.log(`✅ Available tools updated: ${this.availableTools.length} tools`);
    console.log(
      '🔧 Final tool names:',
      this.availableTools.map((t) => t.name)
    );
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.availableTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
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
        this.availableTools.map((t) => ({
          name: t.name,
          originalName: t.originalName,
          serverId: t.serverId
        }))
      );

      // Find the tool in our available tools list
      let toolWithServer = this.availableTools.find(
        (tool) => tool.name === toolCall.name
      );

      // If not found and tool name doesn't contain ':', try to find by original name
      if (!toolWithServer && !toolCall.name.includes(':')) {
        console.log('🔍 Tool not found by name, trying original name...');
        toolWithServer = this.availableTools.find(
          (tool) => tool.originalName === toolCall.name
        );
      }

      if (!toolWithServer) {
        console.error('❌ Tool not found:', toolCall.name);
        throw new Error(`Tool not found: ${toolCall.name}`);
      }

      console.log('✅ Tool found:', toolWithServer);

      // Find the connection for this server
      const connection = this.connections.get(toolWithServer.serverId);
      if (!connection || !connection.connected) {
        console.error('❌ No connected server found for tool:', toolCall.name);
        console.log('Available connections:', Array.from(this.connections.keys()));
        throw new Error(`No connected server found for tool: ${toolCall.name}`);
      }

      console.log('📡 Connection found:', {
        serverId: toolWithServer.serverId,
        connected: connection.connected
      });

      // Prepare the MCP tool call request
      const mcpRequest: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: toolWithServer.originalName,
          arguments: toolCall.arguments
        }
      };

      console.log('📤 Sending MCP request:', mcpRequest);

      // Call the tool on the server
      const result = await connection.client.request(mcpRequest, CallToolResultSchema);

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
    return this.isInitialized;
  }

  async addServer(server: Omit<MCPServer, 'id'>): Promise<MCPServer> {
    const newServer = await mcpConfigService.addServer(server);

    // If the server is enabled, connect to it immediately
    if (newServer.enabled) {
      try {
        await this.connectToServer(newServer);
        await this.updateAvailableTools();
      } catch (error) {
        console.error(`Failed to connect to new server ${newServer.name}:`, error);
      }
    }

    return newServer;
  }

  async removeServer(serverId: string): Promise<boolean> {
    // Disconnect from server if connected
    if (this.connections.has(serverId)) {
      await this.disconnectFromServer(serverId);
    }

    // Remove from config
    const removed = await mcpConfigService.removeServer(serverId);

    if (removed) {
      await this.updateAvailableTools();
    }

    return removed;
  }

  async updateServer(
    serverId: string,
    updates: Partial<MCPServer>
  ): Promise<MCPServer | null> {
    const updatedServer = await mcpConfigService.updateServer(serverId, updates);

    if (updatedServer) {
      // If server was connected, reconnect with new settings
      if (this.connections.has(serverId)) {
        await this.disconnectFromServer(serverId);

        if (updatedServer.enabled) {
          try {
            await this.connectToServer(updatedServer);
          } catch (error) {
            console.error(
              `Failed to reconnect to updated server ${updatedServer.name}:`,
              error
            );
          }
        }
      } else if (updatedServer.enabled) {
        // If server wasn't connected but is now enabled, connect
        try {
          await this.connectToServer(updatedServer);
        } catch (error) {
          console.error(
            `Failed to connect to updated server ${updatedServer.name}:`,
            error
          );
        }
      }

      await this.updateAvailableTools();
    }

    return updatedServer;
  }

  async getServers(): Promise<MCPServer[]> {
    return mcpConfigService.getServers();
  }

  async getServerStatus(
    serverId: string
  ): Promise<{ connected: boolean; toolCount: number; error?: string } | null> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return null;
    }

    return {
      connected: connection.connected,
      toolCount: connection.tools.length,
      error: connection.lastError
    };
  }

  getConnectedServers(): MCPServer[] {
    return Array.from(this.connections.values())
      .filter((conn) => conn.connected)
      .map((conn) => conn.server);
  }

  async reconnectAllServers(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  async testServer(server: MCPServer): Promise<{ success: boolean; error?: string }> {
    try {
      // Create temporary transport
      const transport = new StdioClientTransport({
        command: server.command,
        args: server.args,
        env: {
          ...(Object.fromEntries(
            Object.entries(process.env).filter(([, value]) => value !== undefined)
          ) as Record<string, string>),
          ...server.env
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
      await client.connect(transport);

      // Try to list tools
      await client.request({ method: 'tools/list' }, ListToolsResultSchema);

      // Close test connection
      await transport.close();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const mcpService = new MCPService();
