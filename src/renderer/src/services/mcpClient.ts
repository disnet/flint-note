import type { MCPTool } from '../types/chat';

export interface MCPClientEvents {
  ready: () => void;
  error: (error: Error) => void;
  statusChanged: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

export class MCPClient {
  private eventListeners: Map<keyof MCPClientEvents, Set<(...args: any[]) => void>> =
    new Map();
  private status: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';

  constructor() {
    this.initEventListeners();
  }

  private initEventListeners(): void {
    const eventTypes: (keyof MCPClientEvents)[] = ['ready', 'error', 'statusChanged'];
    eventTypes.forEach((eventType) => {
      this.eventListeners.set(eventType, new Set());
    });
  }

  // Event system
  on<T extends keyof MCPClientEvents>(
    event: T,
    listener: MCPClientEvents[T]
  ): () => void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(listener);
    }

    return () => {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        listeners.delete(listener);
      }
    };
  }

  private emit<T extends keyof MCPClientEvents>(
    event: T,
    ...args: Parameters<MCPClientEvents[T]>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          (listener as any)(...args);
        } catch (error) {
          console.error(`Error in ${event} event listener:`, error);
        }
      });
    }
  }

  private setStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error'): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('statusChanged', status);

      if (status === 'connected') {
        this.emit('ready');
      }
    }
  }

  getConnectionStatus(): 'connecting' | 'connected' | 'disconnected' | 'error' {
    return this.status;
  }
  async getTools(): Promise<MCPTool[]> {
    try {
      const response = (await window.api.mcp.getTools()) as any;
      if (!response.success) {
        this.setStatus('error');
        throw new Error(response.error || 'Failed to get MCP tools');
      }

      // If we can get tools, we're connected
      if (this.status !== 'connected') {
        this.setStatus('connected');
      }

      return response.tools || [];
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
    }
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
    try {
      const response = (await window.api.mcp.getStatus()) as any;
      if (!response.success) {
        this.setStatus('error');
        throw new Error(response.error || 'Failed to get MCP status');
      }

      // Update connection status based on response
      if (response.status.connected) {
        this.setStatus('connected');
      } else {
        this.setStatus('disconnected');
      }

      return response;
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
    }
  }

  async reconnect(): Promise<void> {
    try {
      this.setStatus('connecting');
      const response = (await window.api.mcp.reconnect()) as any;
      if (!response.success) {
        this.setStatus('error');
        throw new Error(response.error || 'Failed to reconnect MCP');
      }

      // Check connection status after reconnect
      await this.getStatus();
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
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
    try {
      console.log('🔧 MCPClient.callTool called with:', toolCall);
      console.log('🔧 Tool name:', toolCall.name);
      console.log('🔧 Tool arguments:', JSON.stringify(toolCall.arguments));

      const response = (await window.api.mcp.callTool(toolCall)) as any;
      console.log('🔧 MCPClient.callTool response:', response);

      // If tool call succeeds, we're connected
      if (response.success && this.status !== 'connected') {
        this.setStatus('connected');
      }

      return response;
    } catch (error) {
      this.setStatus('error');
      this.emit('error', error as Error);
      throw error;
    }
  }

  // Wait for MCP to be ready
  async waitForReady(): Promise<void> {
    if (this.status === 'connected') {
      return;
    }

    return new Promise((resolve, reject) => {
      const unsubscribeReady = this.on('ready', () => {
        unsubscribeReady();
        unsubscribeError();
        resolve();
      });

      const unsubscribeError = this.on('error', (error) => {
        unsubscribeReady();
        unsubscribeError();
        reject(error);
      });

      // Try to check status to trigger connection
      this.getStatus().catch(() => {
        // Error handling is done through events
      });
    });
  }
}

export const mcpClient = new MCPClient();
