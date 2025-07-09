import { app } from 'electron';
import { join } from 'path';
import { promises as fs } from 'fs';
import type { MCPServer, MCPServerConfig } from '../../shared/types';

export class MCPConfigService {
  private configPath: string;
  private config: MCPServerConfig;

  constructor() {
    this.configPath = join(app.getPath('userData'), 'mcp-config.json');
    this.config = { servers: [] };
  }

  async loadConfig(): Promise<MCPServerConfig> {
    try {
      const data = await fs.readFile(this.configPath, 'utf8');
      this.config = JSON.parse(data);

      // Validate config structure
      if (!this.config.servers || !Array.isArray(this.config.servers)) {
        this.config = { servers: [] };
      }

      return this.config;
    } catch (error) {
      // If file doesn't exist or is invalid, create default config
      this.config = { servers: [] };
      await this.saveConfig();
      return this.config;
    }
  }

  async saveConfig(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save MCP config:', error);
      throw error;
    }
  }

  async addServer(server: Omit<MCPServer, 'id'>): Promise<MCPServer> {
    const newServer: MCPServer = {
      ...server,
      id: this.generateId()
    };

    this.config.servers.push(newServer);
    await this.saveConfig();

    return newServer;
  }

  async updateServer(id: string, updates: Partial<MCPServer>): Promise<MCPServer | null> {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) {
      return null;
    }

    this.config.servers[index] = { ...this.config.servers[index], ...updates };
    await this.saveConfig();

    return this.config.servers[index];
  }

  async removeServer(id: string): Promise<boolean> {
    const index = this.config.servers.findIndex(s => s.id === id);
    if (index === -1) {
      return false;
    }

    this.config.servers.splice(index, 1);
    await this.saveConfig();

    return true;
  }

  async getServers(): Promise<MCPServer[]> {
    if (!this.config.servers) {
      await this.loadConfig();
    }
    return this.config.servers;
  }

  async getServer(id: string): Promise<MCPServer | null> {
    const servers = await this.getServers();
    return servers.find(s => s.id === id) || null;
  }

  async getEnabledServers(): Promise<MCPServer[]> {
    const servers = await this.getServers();
    return servers.filter(s => s.enabled);
  }

  async toggleServer(id: string): Promise<MCPServer | null> {
    const server = await this.getServer(id);
    if (!server) {
      return null;
    }

    return this.updateServer(id, { enabled: !server.enabled });
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}

// Export singleton instance
export const mcpConfigService = new MCPConfigService();
