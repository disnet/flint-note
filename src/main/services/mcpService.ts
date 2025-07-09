import { spawn, ChildProcess } from 'child_process';
import { mcpConfigService } from './mcpConfigService';
import type { MCPTool, MCPToolCall, MCPToolResult, MCPServer } from '../../shared/types';

// Export types for use in other modules
export type { MCPTool, MCPToolCall, MCPToolResult, MCPServer };

interface MCPConnection {
  server: MCPServer;
  process: ChildProcess | null;
  tools: MCPTool[];
  connected: boolean;
  lastError?: string;
}

export class MCPService {
  private connections: Map<string, MCPConnection> = new Map();
  private isInitialized = false;
  private availableTools: MCPTool[] = [];

  constructor() {
    // Initialize the service
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      await mcpConfigService.loadConfig();
      this.isInitialized = true;

      // Initialize with mock weather tools for demonstration
      await this.initializeMockTools();
    } catch (error) {
      console.error('Failed to initialize MCP service:', error);
      this.isInitialized = false;
    }
  }

  private async initializeMockTools(): Promise<void> {
    // Mock tools for demonstration
    this.availableTools = [
      {
        name: 'weather:get_current',
        description: 'Get current weather conditions for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The location to get weather for (city, state/country)'
            }
          },
          required: ['location']
        }
      },
      {
        name: 'weather:get_forecast',
        description: 'Get weather forecast for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The location to get forecast for (city, state/country)'
            },
            days: {
              type: 'number',
              description: 'Number of days to forecast (1-7)',
              default: 3
            }
          },
          required: ['location']
        }
      }
    ];
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
    await this.initializeMockTools();
  }

  private async connectToServer(server: MCPServer): Promise<void> {
    if (this.connections.has(server.id)) {
      console.warn(`Already connected to server ${server.name}`);
      return;
    }

    try {
      // For now, we'll create a mock connection
      // In a real implementation, this would use the actual MCP SDK
      const connection: MCPConnection = {
        server,
        process: null,
        tools: this.generateMockToolsForServer(server),
        connected: true
      };

      this.connections.set(server.id, connection);

      // Try to spawn the actual process for validation
      try {
        const childProcess = spawn(server.command, server.args, {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, ...server.env }
        });

        connection.process = childProcess;

        // Handle process events
        childProcess.on('error', (error) => {
          console.error(`MCP server ${server.name} process error:`, error);
          this.handleServerError(server.id, error);
        });

        childProcess.on('exit', (code) => {
          console.log(`MCP server ${server.name} exited with code ${code}`);
          this.handleServerExit(server.id, code);
        });

        // For now, assume connection is successful if process spawns
        console.log(`Mock connection established to MCP server ${server.name}`);
      } catch (error) {
        console.warn(
          `Could not spawn process for ${server.name}, using mock connection:`,
          error
        );
        connection.lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    } catch (error) {
      console.error(`Failed to connect to MCP server ${server.name}:`, error);
      throw error;
    }
  }

  private generateMockToolsForServer(server: MCPServer): MCPTool[] {
    // Generate some mock tools based on server name
    const baseName = server.name.toLowerCase();
    return [
      {
        name: `${baseName}:list`,
        description: `List items from ${server.name}`,
        inputSchema: {
          type: 'object',
          properties: {
            limit: {
              type: 'number',
              description: 'Maximum number of items to return',
              default: 10
            }
          }
        }
      },
      {
        name: `${baseName}:get`,
        description: `Get an item from ${server.name}`,
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The ID of the item to get'
            }
          },
          required: ['id']
        }
      }
    ];
  }

  private async disconnectFromServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      return;
    }

    try {
      // Kill process if running
      if (connection.process && !connection.process.killed) {
        connection.process.kill();
      }

      // Remove from connections
      this.connections.delete(serverId);

      console.log(`Disconnected from MCP server ${connection.server.name}`);
    } catch (error) {
      console.error(`Error disconnecting from server ${serverId}:`, error);
      throw error;
    }
  }

  private handleServerError(serverId: string, error: Error): void {
    const connection = this.connections.get(serverId);
    if (connection) {
      connection.connected = false;
      connection.lastError = error.message;
      console.error(`MCP server ${connection.server.name} error:`, error);
    }
  }

  private handleServerExit(serverId: string, code: number | null): void {
    const connection = this.connections.get(serverId);
    if (connection) {
      connection.connected = false;
      this.connections.delete(serverId);
      console.log(`MCP server ${connection.server.name} exited with code ${code}`);

      // Update available tools
      this.updateAvailableTools();
    }
  }

  private async updateAvailableTools(): Promise<void> {
    this.availableTools = [];

    // Add mock weather tools
    this.availableTools.push(
      {
        name: 'weather:get_current',
        description: 'Get current weather conditions for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The location to get weather for (city, state/country)'
            }
          },
          required: ['location']
        }
      },
      {
        name: 'weather:get_forecast',
        description: 'Get weather forecast for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The location to get forecast for (city, state/country)'
            },
            days: {
              type: 'number',
              description: 'Number of days to forecast (1-7)',
              default: 3
            }
          },
          required: ['location']
        }
      }
    );

    // Add tools from connected servers
    for (const connection of this.connections.values()) {
      if (connection.connected) {
        this.availableTools.push(...connection.tools);
      }
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.availableTools;
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Handle mock weather tools
      if (toolCall.name === 'weather:get_current') {
        return await this.mockGetWeather(toolCall.arguments);
      } else if (toolCall.name === 'weather:get_forecast') {
        return await this.mockGetForecast(toolCall.arguments);
      }

      // Handle tools from connected servers
      for (const connection of this.connections.values()) {
        if (connection.connected) {
          const tool = connection.tools.find((t) => t.name === toolCall.name);
          if (tool) {
            return await this.mockCallServerTool(connection.server, toolCall);
          }
        }
      }

      throw new Error(`Unknown tool: ${toolCall.name}`);
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

  private async mockGetWeather(args: Record<string, unknown>): Promise<MCPToolResult> {
    const location = args.location;
    if (!location) {
      throw new Error('Location is required');
    }

    // Mock weather data
    const weatherData = {
      location: location,
      temperature: Math.floor(Math.random() * 30) + 10, // 10-40°C
      condition: ['sunny', 'cloudy', 'rainy', 'snowy'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 40) + 40, // 40-80%
      windSpeed: Math.floor(Math.random() * 20) + 5, // 5-25 km/h
      timestamp: new Date().toISOString()
    };

    const weatherText = `Current weather in ${weatherData.location}:
- Temperature: ${weatherData.temperature}°C
- Condition: ${weatherData.condition}
- Humidity: ${weatherData.humidity}%
- Wind Speed: ${weatherData.windSpeed} km/h
- Last updated: ${new Date(weatherData.timestamp).toLocaleString()}`;

    return {
      content: [
        {
          type: 'text',
          text: weatherText
        }
      ]
    };
  }

  private async mockGetForecast(args: Record<string, unknown>): Promise<MCPToolResult> {
    const location = args.location;
    const days = (args.days as number) || 3;

    if (!location) {
      throw new Error('Location is required');
    }

    if (days < 1 || days > 7) {
      throw new Error('Days must be between 1 and 7');
    }

    // Mock forecast data
    const forecast: Array<{
      date: string;
      high: number;
      low: number;
      condition: string;
      precipitationChance: number;
    }> = [];
    const conditions = ['sunny', 'cloudy', 'rainy', 'snowy', 'partly cloudy'];

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() + i);

      forecast.push({
        date: date.toDateString(),
        high: Math.floor(Math.random() * 15) + 20, // 20-35°C
        low: Math.floor(Math.random() * 15) + 5, // 5-20°C
        condition: conditions[Math.floor(Math.random() * conditions.length)],
        precipitationChance: Math.floor(Math.random() * 100)
      });
    }

    const forecastText = `${days}-day weather forecast for ${location}:

${forecast
  .map(
    (day) =>
      `${day.date}:
  - High: ${day.high}°C, Low: ${day.low}°C
  - Condition: ${day.condition}
  - Precipitation: ${day.precipitationChance}%`
  )
  .join('\n\n')}`;

    return {
      content: [
        {
          type: 'text',
          text: forecastText
        }
      ]
    };
  }

  private async mockCallServerTool(
    server: MCPServer,
    toolCall: MCPToolCall
  ): Promise<MCPToolResult> {
    // Mock implementation for server tools
    return {
      content: [
        {
          type: 'text',
          text: `Mock response from ${server.name} for tool ${toolCall.name} with arguments: ${JSON.stringify(toolCall.arguments, null, 2)}`
        }
      ]
    };
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
}

// Export singleton instance
export const mcpService = new MCPService();
