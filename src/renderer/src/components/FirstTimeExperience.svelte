<script lang="ts">
  import CreateVaultModal from './CreateVaultModal.svelte';
  import type { VaultInfo } from '@/server/utils/global-config';
  import { vaultAvailabilityService } from '../services/vaultAvailabilityService.svelte';

  interface Props {
    onVaultCreated: (vault: VaultInfo) => void;
  }

  let { onVaultCreated }: Props = $props();

  let isCreateModalOpen = $state(false);

  function handleCreateVault(): void {
    isCreateModalOpen = true;
  }

  function handleModalClose(): void {
    isCreateModalOpen = false;
  }

  async function handleVaultCreated(vault: VaultInfo): Promise<void> {
    // Update the vault availability service
    vaultAvailabilityService.handleVaultCreated(vault);

    // Notify parent component
    onVaultCreated(vault);

    // Close modal
    isCreateModalOpen = false;
  }

  async function handleImportExisting(): Promise<void> {
    try {
      const selectedPath = await window.api.showDirectoryPicker();
      if (selectedPath) {
        // Try to detect if this is an existing Flint vault
        // For now, just open the create modal with the path pre-filled
        // TODO: In the future, we could add proper vault detection logic
        isCreateModalOpen = true;
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  }
</script>

<div class="first-time-container">
  <div class="welcome-content">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        <div class="logo">🔥</div>
        <h1>Welcome to Flint</h1>
      </div>
      <p class="subtitle">Your intelligent note-taking companion</p>
    </div>

    <!-- Main content -->
    <div class="main-content">
      <div class="vault-explanation">
        <h2>📁 Get Started with Your First Vault</h2>
        <p>
          A <strong>vault</strong> is a collection of notes stored in a folder on your computer.
          Think of it as your personal knowledge workspace where all your notes, ideas, and
          thoughts are organized and interconnected.
        </p>

        <div class="features-list">
          <div class="feature">
            <span class="feature-icon">🔗</span>
            <div class="feature-text">
              <strong>Smart Linking:</strong> Connect your thoughts with automatic wikilinks
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">🔍</span>
            <div class="feature-text">
              <strong>Powerful Search:</strong> Find anything across all your notes instantly
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">🤖</span>
            <div class="feature-text">
              <strong>AI Assistant:</strong> Get help writing, organizing, and exploring your
              knowledge
            </div>
          </div>
          <div class="feature">
            <span class="feature-icon">📝</span>
            <div class="feature-text">
              <strong>Flexible Types:</strong> Organize notes with custom types and structures
            </div>
          </div>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="action-section">
        <button class="primary-action" onclick={handleCreateVault}>
          <span class="button-icon">📁</span>
          Create Your First Vault
        </button>

        <div class="secondary-actions">
          <button
            class="secondary-action"
            onclick={handleImportExisting}
            title="Browse for an existing vault folder"
          >
            <span class="button-icon">📂</span>
            Browse for Existing Vault
          </button>
        </div>
      </div>

      <!-- Help text -->
      <div class="help-text">
        <p>
          <strong>New to note-taking?</strong> Start with "Create Your First Vault" – we'll
          set up everything you need including sample notes and templates to get you started.
        </p>
        <p>
          <strong>Have notes elsewhere?</strong> Choose "Browse for Existing Vault" to point
          Flint to a folder where you'd like to store your notes.
        </p>
      </div>
    </div>
  </div>
</div>

<!-- Create Vault Modal -->
<CreateVaultModal
  isOpen={isCreateModalOpen}
  onClose={handleModalClose}
  onVaultCreated={handleVaultCreated}
/>

<style>
  .first-time-container {
    height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
    padding: 2rem;
    box-sizing: border-box;
  }

  .welcome-content {
    max-width: 600px;
    width: 100%;
    text-align: center;
    animation: fadeInUp 0.6s ease-out;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .header {
    margin-bottom: 3rem;
  }

  .logo-section {
    margin-bottom: 1rem;
  }

  .logo {
    font-size: 4rem;
    margin-bottom: 1rem;
    display: block;
  }

  .header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .subtitle {
    font-size: 1.1rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .main-content {
    text-align: left;
  }

  .vault-explanation {
    background: var(--bg-primary);
    border-radius: 1rem;
    padding: 2rem;
    margin-bottom: 2rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-light);
  }

  .vault-explanation h2 {
    font-size: 1.5rem;
    color: var(--text-primary);
    margin: 0 0 1rem 0;
    text-align: center;
  }

  .vault-explanation > p {
    color: var(--text-secondary);
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .features-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .feature {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .feature-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .feature-text {
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .feature-text strong {
    color: var(--text-primary);
  }

  .action-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .primary-action {
    background: var(--accent-primary);
    color: var(--accent-text);
    border: none;
    border-radius: 0.75rem;
    padding: 1rem 2rem;
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .primary-action:hover {
    background: var(--accent-primary-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 12px -2px rgba(0, 0, 0, 0.15);
  }

  .secondary-actions {
    display: flex;
    justify-content: center;
  }

  .secondary-action {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    padding: 0.75rem 1.5rem;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .secondary-action:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-medium);
  }

  .button-icon {
    font-size: 1rem;
  }

  .help-text {
    background: var(--bg-secondary);
    border-radius: 0.75rem;
    padding: 1.5rem;
    border: 1px solid var(--border-light);
  }

  .help-text p {
    margin: 0 0 1rem 0;
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .help-text p:last-child {
    margin-bottom: 0;
  }

  .help-text strong {
    color: var(--text-primary);
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .first-time-container {
      padding: 1rem;
    }

    .header h1 {
      font-size: 2rem;
    }

    .logo {
      font-size: 3rem;
    }

    .vault-explanation {
      padding: 1.5rem;
    }

    .features-list {
      gap: 0.75rem;
    }

    .feature {
      flex-direction: column;
      gap: 0.25rem;
      text-align: center;
    }

    .primary-action {
      padding: 0.875rem 1.5rem;
      font-size: 1rem;
    }

    .help-text {
      padding: 1rem;
    }
  }
</style>
