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
    if (this.connections.has(server.id)) {
      console.warn(`Already connected to server ${server.name}`);
      return;
    }

    try {
      // Create transport for stdio communication
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

      // Connect to server
      await client.connect(transport);
      connection.connected = true;

      // List available tools from server
      try {
        const toolsResult = await client.request(
          { method: 'tools/list' },
          ListToolsResultSchema
        );

        // Convert MCP tools to our format - keep original names for LLM
        connection.tools = toolsResult.tools.map((tool: Tool) => ({
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {}
        }));

        console.log(
          `Connected to MCP server ${server.name} with ${connection.tools.length} tools`
        );
      } catch (error) {
        console.warn(`Failed to list tools from server ${server.name}:`, error);
        connection.tools = [];
      }

      // Set up error handlers
      transport.onclose = () => {
        console.log(`MCP server ${server.name} connection closed`);
        connection.connected = false;
        this.updateAvailableTools();
      };

      transport.onerror = (error: Error) => {
        console.error(`MCP server ${server.name} error:`, error);
        connection.connected = false;
        connection.lastError = error.message;
        this.updateAvailableTools();
      };
    } catch (error) {
      console.error(`Failed to connect to MCP server ${server.name}:`, error);
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
    this.availableTools = [];

    // Add tools from all connected servers
    const allToolsWithServer: MCPToolWithServer[] = [];

    for (const connection of this.connections.values()) {
      if (connection.connected) {
        const toolsWithServer = connection.tools.map((tool) => ({
          ...tool,
          serverId: connection.server.id,
          serverName: connection.server.name,
          originalName: tool.name,
          hasConflict: false
        }));
        allToolsWithServer.push(...toolsWithServer);
      }
    }

    // Check for tool name conflicts and namespace when needed
    const toolNameCounts = new Map<string, number>();
    allToolsWithServer.forEach((tool) => {
      toolNameCounts.set(
        tool.originalName,
        (toolNameCounts.get(tool.originalName) || 0) + 1
      );
    });

    // Update tool names and conflict flags
    this.availableTools = allToolsWithServer.map((tool) => {
      const hasConflict = (toolNameCounts.get(tool.originalName) || 0) > 1;
      return {
        ...tool,
        name: hasConflict ? `${tool.serverName}:${tool.originalName}` : tool.originalName,
        hasConflict
      };
    });
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
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Find the tool in our available tools list
      let toolWithServer = this.availableTools.find(
        (tool) => tool.name === toolCall.name
      );

      // If not found and tool name doesn't contain ':', try to find by original name
      if (!toolWithServer && !toolCall.name.includes(':')) {
        toolWithServer = this.availableTools.find(
          (tool) => tool.originalName === toolCall.name
        );
      }

      if (!toolWithServer) {
        throw new Error(`Tool not found: ${toolCall.name}`);
      }

      // Find the connection for this server
      const connection = this.connections.get(toolWithServer.serverId);
      if (!connection || !connection.connected) {
        throw new Error(`No connected server found for tool: ${toolCall.name}`);
      }

      // Prepare the MCP tool call request
      const mcpRequest: CallToolRequest = {
        method: 'tools/call',
        params: {
          name: toolWithServer.originalName,
          arguments: toolCall.arguments
        }
      };

      // Call the tool on the server
      const result = await connection.client.request(mcpRequest, CallToolResultSchema);

      // Convert MCP result to our format
      return {
        content: result.content.map((item) => ({
          type: item.type,
          text: (item as any).text || ''
        })),
        isError: result.isError || false
      };
    } catch (error) {
      console.error('Error calling MCP tool:', error);
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
