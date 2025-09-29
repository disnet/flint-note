import { getChatService } from './chatService';
import type { VaultInfo } from '@/server/utils/global-config';

interface VaultAvailabilityState {
  hasVaults: boolean;
  currentVault: VaultInfo | null;
  allVaults: VaultInfo[];
  isLoading: boolean;
  error: string | null;
}

function createVaultAvailabilityService(): {
  readonly hasVaults: boolean;
  readonly currentVault: VaultInfo | null;
  readonly allVaults: VaultInfo[];
  readonly isLoading: boolean;
  readonly error: string | null;
  refreshVaultState: () => Promise<void>;
  handleVaultCreated: (newVault: VaultInfo) => void;
  handleVaultSwitched: (vaultId: string) => void;
  handleVaultRemoved: (vaultId: string) => void;
  checkVaultAvailability: () => Promise<void>;
} {
  const chatService = getChatService();

  const state = $state<VaultAvailabilityState>({
    hasVaults: false,
    currentVault: null,
    allVaults: [],
    isLoading: true,
    error: null
  });

  // Check vault availability on service initialization
  async function checkVaultAvailability(): Promise<void> {
    try {
      state.isLoading = true;
      state.error = null;

      const [currentVault, allVaults] = await Promise.all([
        chatService.getCurrentVault().catch(() => null), // Don't fail if no current vault
        chatService.listVaults().catch(() => []) // Don't fail if no vaults exist
      ]);

      state.currentVault = currentVault;
      state.allVaults = allVaults;
      state.hasVaults = allVaults.length > 0;
    } catch (error) {
      console.error('Failed to check vault availability:', error);
      state.error = error instanceof Error ? error.message : 'Failed to check vaults';
      state.hasVaults = false;
      state.currentVault = null;
      state.allVaults = [];
    } finally {
      state.isLoading = false;
    }
  }

  // Refresh vault state after vault operations
  async function refreshVaultState(): Promise<void> {
    await checkVaultAvailability();
  }

  // Handle vault creation - should be called after successful vault creation
  function handleVaultCreated(newVault: VaultInfo): void {
    state.allVaults = [...state.allVaults, newVault];
    state.hasVaults = true;
    state.currentVault = newVault; // Assume newly created vault becomes current
  }

  // Handle vault switching - should be called after successful vault switch
  function handleVaultSwitched(vaultId: string): void {
    const vault = state.allVaults.find((v) => v.id === vaultId);
    if (vault) {
      state.currentVault = vault;
    }
  }

  // Handle vault removal - should be called after successful vault removal
  function handleVaultRemoved(vaultId: string): void {
    state.allVaults = state.allVaults.filter((v) => v.id !== vaultId);
    state.hasVaults = state.allVaults.length > 0;

    // If the removed vault was current, clear current vault
    if (state.currentVault?.id === vaultId) {
      state.currentVault = null;
    }
  }

  // Initialize the service
  checkVaultAvailability();

  return {
    // Reactive state
    get hasVaults() {
      return state.hasVaults;
    },
    get currentVault() {
      return state.currentVault;
    },
    get allVaults() {
      return state.allVaults;
    },
    get isLoading() {
      return state.isLoading;
    },
    get error() {
      return state.error;
    },

    // Methods
    refreshVaultState,
    handleVaultCreated,
    handleVaultSwitched,
    handleVaultRemoved,
    checkVaultAvailability
  };
}

// Create and export the singleton service instance
export const vaultAvailabilityService = createVaultAvailabilityService();
