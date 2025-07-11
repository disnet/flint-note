import { mcpClient } from './mcpClient';

export interface VaultInfo {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  description?: string;
  created?: string;
  lastAccessed?: string;
}

export class VaultService {
  private currentVault: string | null = null;
  private availableVaults: VaultInfo[] = [];
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.fetchCurrentVaultWithRetry();
      this.isInitialized = true;
      console.log('✅ Vault service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize vault service:', error);
      // Set default values even if initialization fails
      this.currentVault = 'Default Vault';
      this.availableVaults = [
        { id: 'default', name: 'Default Vault', path: '', isActive: true }
      ];
      this.isInitialized = true;
    }
  }

  async fetchCurrentVaultWithRetry(
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Vault fetch attempt ${attempt}/${maxRetries}`);

        if (attempt > 1) {
          console.log(`⏱️ Waiting ${delay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        await this.fetchCurrentVault();
        console.log(`✅ Vault fetch succeeded on attempt ${attempt}`);
        return;
      } catch (error) {
        lastError = error as Error;
        console.log(`❌ Vault fetch attempt ${attempt} failed:`, error);

        // Don't retry if it's not a "no tools found" error
        if (!error.message.includes('No vault tools found')) {
          throw error;
        }
      }
    }

    console.log(`❌ All ${maxRetries} vault fetch attempts failed`);
    throw lastError || new Error('Failed to fetch vault after retries');
  }

  async tryMultipleVaultTools(): Promise<any> {
    const possibleTools = [
      'list_vaults',
      'get_current_vault',
      'get_vaults',
      'vault_list',
      'current_vault'
    ];

    for (const toolName of possibleTools) {
      try {
        console.log(`🔧 Trying vault tool: ${toolName}`);
        const response = await mcpClient.callTool({
          name: toolName,
          arguments: {}
        });

        console.log(`📋 Response for ${toolName}:`, response);

        if (response.success) {
          console.log(`✅ Tool ${toolName} worked!`);
          return { toolName, response };
        } else {
          console.log(`❌ Tool ${toolName} failed with error: ${response.error}`);
        }
      } catch (error) {
        console.log(`❌ Tool ${toolName} threw exception:`, error);
      }
    }

    console.log('❌ No vault tools found or all tools failed');
    throw new Error('No vault tools found');
  }

  parseFlintVaultData(text: string): VaultInfo[] {
    const vaults: VaultInfo[] = [];
    const lines = text.split('\n');

    let currentVault: Partial<VaultInfo> = {};

    console.log('🔍 Parsing vault data:', text);

    for (const line of lines) {
      const trimmed = line.trim();

      // Match vault header like "⚪ **__default_workspace__**: Default Workspace"
      const vaultMatch = trimmed.match(
        /^[⚪🟢]\s*(?:\(current\)\s*)?[*]{2}([^*]+)[*]{2}:\s*(.+)$/
      );
      if (vaultMatch) {
        console.log('🔍 Matched vault line:', line);
        console.log('🔍 Extracted ID:', vaultMatch[1]);
        console.log('🔍 Extracted Name:', vaultMatch[2]);

        // Save previous vault if exists
        if (currentVault.id) {
          console.log('🔍 Saving previous vault:', currentVault);
          vaults.push(currentVault as VaultInfo);
        }

        currentVault = {
          id: vaultMatch[1],
          name: vaultMatch[2],
          isActive: line.includes('🟢') || line.includes('(current)'),
          path: '',
          description: ''
        };
      }

      // Match path like "Path: /Users/disnet/pkb-flint"
      const pathMatch = trimmed.match(/^Path:\s*(.+)$/);
      if (pathMatch && currentVault.id) {
        currentVault.path = pathMatch[1];
      }

      // Match created date like "Created: 6/25/2025"
      const createdMatch = trimmed.match(/^Created:\s*(.+)$/);
      if (createdMatch && currentVault.id) {
        currentVault.created = createdMatch[1];
      }

      // Match last accessed like "Last accessed: 7/2/2025"
      const accessedMatch = trimmed.match(/^Last accessed:\s*(.+)$/);
      if (accessedMatch && currentVault.id) {
        currentVault.lastAccessed = accessedMatch[1];
      }

      // Match description like "Description: Auto-created vault for workspace compatibility"
      const descMatch = trimmed.match(/^Description:\s*(.+)$/);
      if (descMatch && currentVault.id) {
        currentVault.description = descMatch[1];
      }
    }

    // Add the last vault
    if (currentVault.id) {
      console.log('🔍 Saving last vault:', currentVault);
      vaults.push(currentVault as VaultInfo);
    }

    console.log('🔍 Final parsed vaults:', vaults);
    return vaults;
  }

  parseCurrentVaultData(text: string): VaultInfo | null {
    const lines = text.split('\n');

    // Match "🟢 **Current Vault**: pkb-flint (pkb-flint)"
    const vaultMatch = text.match(/[*]{2}Current Vault[*]{2}:\s*([^(]+)\s*\(([^)]+)\)/);
    if (!vaultMatch) return null;

    const vault: Partial<VaultInfo> = {
      id: vaultMatch[2].trim(),
      name: vaultMatch[1].trim(),
      isActive: true,
      path: '',
      description: ''
    };

    // Parse additional details
    for (const line of lines) {
      const trimmed = line.trim();

      const pathMatch = trimmed.match(/[*]{2}Path[*]{2}:\s*(.+)$/);
      if (pathMatch) {
        vault.path = pathMatch[1];
      }

      const createdMatch = trimmed.match(/[*]{2}Created[*]{2}:\s*(.+)$/);
      if (createdMatch) {
        vault.created = createdMatch[1];
      }

      const accessedMatch = trimmed.match(/[*]{2}Last accessed[*]{2}:\s*(.+)$/);
      if (accessedMatch) {
        vault.lastAccessed = accessedMatch[1];
      }
    }

    return vault as VaultInfo;
  }

  async fetchCurrentVault(): Promise<void> {
    try {
      console.log('🔍 Fetching current vault information...');

      // Check if MCP client is ready
      try {
        const mcpStatus = await mcpClient.getStatus();
        console.log('🔍 MCP Status:', mcpStatus);

        // Try to get available tools
        const tools = await mcpClient.getTools();
        console.log('🔍 Available tools:', tools);

        if (tools && tools.length > 0) {
          const vaultTools = tools.filter(
            (tool) => tool.name.includes('vault') || tool.name.includes('Vault')
          );
          console.log(
            '🔍 Available vault tools:',
            vaultTools.map((t) => t.name)
          );
        }
      } catch (statusError) {
        console.log('⚠️ Could not get MCP status:', statusError);
      }

      // Try multiple possible vault tools
      const result = await this.tryMultipleVaultTools();
      const { toolName, response } = result;

      if (response.success && response.result) {
        const vaultData = response.result;
        console.log(`📁 Vault data from ${toolName}:`, vaultData);

        // Extract vault information from the response
        if (vaultData.content && vaultData.content.length > 0) {
          const content = vaultData.content[0];
          if (content.text) {
            if (toolName === 'list_vaults') {
              // Parse the formatted vault list from Flint
              const vaults = this.parseFlintVaultData(content.text);
              this.availableVaults = vaults;

              // Find current vault
              const currentVault = vaults.find((v) => v.isActive);
              if (currentVault) {
                this.currentVault = currentVault.name;
              }
            } else if (toolName === 'get_current_vault') {
              // Parse the current vault data
              const currentVault = this.parseCurrentVaultData(content.text);
              if (currentVault) {
                this.currentVault = currentVault.name;
                this.availableVaults = [currentVault];
              }
            } else {
              // Fallback for other tools - try JSON parse first
              try {
                const parsed = JSON.parse(content.text);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  this.availableVaults = parsed.map((vault) => ({
                    id: vault.id || vault.name || vault,
                    name: vault.name || vault,
                    path: vault.path || '',
                    isActive: vault.isActive || false
                  }));
                  const activeVault = this.availableVaults.find((v) => v.isActive);
                  if (activeVault) {
                    this.currentVault = activeVault.name;
                  }
                }
              } catch (jsonError) {
                // Plain text fallback
                const vaultNames = content.text.split('\n').filter((name) => name.trim());
                if (vaultNames.length > 0) {
                  this.currentVault = vaultNames[0].trim();
                  this.availableVaults = vaultNames.map((name, index) => ({
                    id: name.trim(),
                    name: name.trim(),
                    path: '',
                    isActive: index === 0
                  }));
                }
              }
            }
          }
        }
      } else {
        console.warn('⚠️ Failed to get vault data:', response.error);
        throw new Error(response.error || 'Failed to get vault data');
      }
    } catch (error) {
      console.error('❌ Error fetching current vault:', error);

      // Check if this is a connection issue
      if (error.message.includes('No vault tools found')) {
        console.log('💡 This might be a timing issue. MCP server may not be ready yet.');
        console.log(
          '💡 Try refreshing or switching to the Tool Inspector tab to test connectivity.'
        );
      }

      throw error;
    }
  }

  async switchVault(vaultName: string): Promise<void> {
    try {
      console.log('🔄 Switching to vault:', vaultName);
      console.log('🔍 Available vaults:', this.availableVaults);

      // Find the vault ID from the available vaults
      const targetVault = this.availableVaults.find((v) => v.name === vaultName);
      if (!targetVault) {
        console.error(
          `❌ Vault "${vaultName}" not found in available vaults:`,
          this.availableVaults
        );
        throw new Error(`Vault "${vaultName}" not found in available vaults`);
      }

      console.log(`🔧 Target vault found:`, targetVault);
      console.log(`🔧 Switching to vault ID: ${targetVault.id}`);

      if (!targetVault.id) {
        console.error(`❌ Target vault has no ID:`, targetVault);
        throw new Error(`Vault "${vaultName}" has no ID`);
      }

      // Try different parameter names that might work
      const possibleArguments = [
        { vault_id: targetVault.id },
        { id: targetVault.id },
        { vault: targetVault.id },
        { name: targetVault.id },
        { vaultId: targetVault.id }
      ];

      let response: any = null;
      let success = false;

      for (const args of possibleArguments) {
        const toolCall = {
          name: 'switch_vault',
          arguments: args
        };
        console.log('🔧 Trying arguments:', JSON.stringify(args));

        try {
          response = await mcpClient.callTool(toolCall);
          console.log('🔧 Response received:', response);

          if (response.success) {
            console.log('✅ Found working parameter format:', args);
            success = true;
            break;
          } else {
            console.log('❌ Failed with args:', args, 'Error:', response.error);
          }
        } catch (error) {
          console.log('❌ Exception with args:', args, 'Error:', error);
        }
      }

      if (!success) {
        console.log('❌ All parameter formats failed');
        throw new Error('Failed to switch vault with any parameter format');
      }

      // Success case is already handled above
      console.log(`✅ Successfully switched to vault: ${vaultName}`);
      this.currentVault = vaultName;
      // Update the active vault in the list
      this.availableVaults = this.availableVaults.map((vault) => ({
        ...vault,
        isActive: vault.name === vaultName
      }));
    } catch (error) {
      console.error('❌ Error switching vault:', error);
      throw error;
    }
  }

  async listVaults(): Promise<VaultInfo[]> {
    try {
      console.log('📋 Listing available vaults...');

      // Try to use the working tool from initialization
      const result = await this.tryMultipleVaultTools();
      const { response } = result;

      if (response.success && response.result) {
        const vaultData = response.result;

        if (vaultData.content && vaultData.content.length > 0) {
          const content = vaultData.content[0];
          if (content.text) {
            try {
              const parsed = JSON.parse(content.text);
              if (Array.isArray(parsed)) {
                this.availableVaults = parsed.map((vault) => ({
                  id: vault.id || vault.name || vault,
                  name: vault.name || vault,
                  path: vault.path || '',
                  isActive:
                    vault.name === this.currentVault || vault === this.currentVault
                }));
              }
            } catch (jsonError) {
              // Parse Flint formatted vault data
              const vaults = this.parseFlintVaultData(content.text);
              if (vaults.length > 0) {
                this.availableVaults = vaults;
              } else {
                // Fallback to plain text parsing
                const vaultNames = content.text.split('\n').filter((name) => name.trim());
                this.availableVaults = vaultNames.map((name) => ({
                  id: name.trim(),
                  name: name.trim(),
                  path: '',
                  isActive: name.trim() === this.currentVault
                }));
              }
            }
          }
        }
      }

      return this.availableVaults;
    } catch (error) {
      console.error('❌ Error listing vaults:', error);
      // Return current vault list if listing fails
      return this.availableVaults;
    }
  }

  getCurrentVault(): string | null {
    return this.currentVault;
  }

  getAvailableVaults(): VaultInfo[] {
    return [...this.availableVaults];
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  // Subscribe to vault changes
  onVaultChange(_callback: (vaultName: string) => void): () => void {
    // This would be implemented with an event system
    // For now, just return a no-op unsubscribe function
    return () => {};
  }
}

// Export singleton instance
export const vaultService = new VaultService();
