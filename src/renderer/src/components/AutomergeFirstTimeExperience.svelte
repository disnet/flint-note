<script lang="ts">
  /**
   * First-time experience for automerge-based vaults
   * Creates a vault stored in IndexedDB via automerge-repo
   */
  import { createVault, initializeState } from '../lib/automerge';

  interface Props {
    onVaultCreated: () => void;
  }

  let { onVaultCreated }: Props = $props();

  let vaultName = $state('My Notes');
  let isCreating = $state(false);
  let error = $state<string | null>(null);

  async function handleCreateVault(): Promise<void> {
    if (!vaultName.trim()) {
      error = 'Please enter a vault name';
      return;
    }

    isCreating = true;
    error = null;

    try {
      // Create the vault (this creates the automerge document)
      createVault(vaultName.trim());

      // Initialize state with the new vault
      await initializeState();

      // Notify parent
      onVaultCreated();
    } catch (err) {
      console.error('Failed to create vault:', err);
      error = err instanceof Error ? err.message : 'Failed to create vault';
    } finally {
      isCreating = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleCreateVault();
    }
  }
</script>

<div class="first-time-container">
  <div class="welcome-content">
    <!-- Header -->
    <div class="header">
      <div class="logo-section">
        <h1>Welcome to Flint</h1>
      </div>
      <p class="subtitle">Your intelligent note-taking companion</p>
    </div>

    <!-- Main content -->
    <div class="main-content">
      <div class="vault-explanation">
        <h2>Get Started with Your First Vault</h2>
        <p>
          A <strong>vault</strong> is a collection of notes stored locally in your browser.
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
            <span class="feature-icon">💾</span>
            <div class="feature-text">
              <strong>Local First:</strong> Your notes are stored locally and work offline
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

      <!-- Vault creation form -->
      <div class="vault-form">
        <label for="vault-name" class="form-label">Vault Name</label>
        <input
          id="vault-name"
          type="text"
          class="vault-name-input"
          bind:value={vaultName}
          onkeydown={handleKeyDown}
          placeholder="Enter vault name..."
          maxlength="50"
          disabled={isCreating}
        />

        {#if error}
          <div class="error-message">{error}</div>
        {/if}

        <button
          class="primary-action"
          onclick={handleCreateVault}
          disabled={isCreating || !vaultName.trim()}
        >
          {#if isCreating}
            <span class="button-icon">⏳</span>
            Creating...
          {:else}
            <span class="button-icon">📁</span>
            Create Vault
          {/if}
        </button>
      </div>
    </div>
  </div>
</div>

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

  .vault-form {
    background: var(--bg-primary);
    border-radius: 1rem;
    padding: 1.5rem;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .vault-name-input {
    padding: 0.75rem 1rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1rem;
    transition: all 0.2s ease;
  }

  .vault-name-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .vault-name-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .error-message {
    color: var(--error-text, #ef4444);
    font-size: 0.875rem;
    padding: 0.5rem 0.75rem;
    background: var(--error-bg, rgba(239, 68, 68, 0.1));
    border-radius: 0.375rem;
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

  .primary-action:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    transform: translateY(-2px);
    box-shadow: 0 8px 12px -2px rgba(0, 0, 0, 0.15);
  }

  .primary-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .button-icon {
    font-size: 1rem;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .first-time-container {
      padding: 1rem;
    }

    .header h1 {
      font-size: 2rem;
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
  }
</style>
