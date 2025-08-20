<script lang="ts">
  import { getChatService } from '../services/chatService';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onVaultCreated?: (vaultInfo: any) => void;
  }

  let { isOpen, onClose, onVaultCreated }: Props = $props();

  let vaultName = $state('');
  let vaultPath = $state('');
  let vaultDescription = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let nameError = $state<string | null>(null);
  let pathError = $state<string | null>(null);

  // Focus name input when modal opens
  $effect(() => {
    if (isOpen) {
      setTimeout(() => {
        const nameInput = document.querySelector(
          '.vault-name-input'
        ) as HTMLInputElement;
        nameInput?.focus();
      }, 100);
    }
  });

  // Reset form when modal closes
  $effect(() => {
    if (!isOpen) {
      resetForm();
    }
  });

  function resetForm(): void {
    vaultName = '';
    vaultPath = '';
    vaultDescription = '';
    error = null;
    nameError = null;
    pathError = null;
    isLoading = false;
  }

  function validateName(name: string): string | null {
    if (!name.trim()) {
      return 'Vault name is required';
    }
    if (name.length < 2) {
      return 'Name must be at least 2 characters';
    }
    if (name.length > 50) {
      return 'Name must be less than 50 characters';
    }
    // Check for invalid characters
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(name)) {
      return 'Name can only contain letters, numbers, spaces, hyphens, underscores, and periods';
    }
    return null;
  }

  function validatePath(path: string): string | null {
    if (!path.trim()) {
      return 'Vault path is required';
    }
    // Basic path validation - could be enhanced based on OS
    if (path.length > 500) {
      return 'Path is too long';
    }
    return null;
  }

  function handleNameInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    vaultName = target.value;
    nameError = validateName(vaultName);
  }

  function handlePathInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    vaultPath = target.value;
    pathError = validatePath(vaultPath);
  }

  async function selectPath(): Promise<void> {
    try {
      const selectedPath = await window.api.showDirectoryPicker();
      if (selectedPath) {
        vaultPath = selectedPath;
        pathError = validatePath(vaultPath);
      }
    } catch (err) {
      console.error('Failed to select path:', err);
    }
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    
    const nameValidation = validateName(vaultName);
    const pathValidation = validatePath(vaultPath);
    
    if (nameValidation) {
      nameError = nameValidation;
      return;
    }
    if (pathValidation) {
      pathError = pathValidation;
      return;
    }

    isLoading = true;
    error = null;

    try {
      const chatService = getChatService();
      const vaultInfo = await chatService.createVault({
        name: vaultName.trim(),
        path: vaultPath.trim(),
        description: vaultDescription.trim() || undefined
      });

      // Notify parent component
      onVaultCreated?.(vaultInfo);

      // Close modal
      onClose();
    } catch (err) {
      console.error('Failed to create vault:', err);

      let errorMessage = 'Failed to create vault';
      if (err instanceof Error) {
        if (err.message.includes('exists')) {
          errorMessage = 'A vault with this name or path already exists';
        } else if (err.message.includes('permission')) {
          errorMessage = 'Permission denied. Please check the path permissions.';
        } else if (err.message.includes('path')) {
          errorMessage = 'Invalid path. Please check the directory exists or can be created.';
        } else {
          errorMessage = err.message;
        }
      }

      error = errorMessage;
    } finally {
      isLoading = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleModalClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if isOpen}
  <div
    class="modal-overlay"
    onclick={handleModalClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
    tabindex="-1"
  >
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modal-title">📁 Create New Vault</h3>
        <button class="close-btn" onclick={onClose} aria-label="Close modal"> ✕ </button>
      </div>

      <form class="vault-form" onsubmit={handleSubmit}>
        <div class="form-group">
          <label for="vault-name">Name:</label>
          <input
            id="vault-name"
            type="text"
            class="vault-name-input"
            class:error={nameError}
            value={vaultName}
            oninput={handleNameInput}
            placeholder="Enter vault name..."
            maxlength="50"
            required
          />
          {#if nameError}
            <div class="error-text">{nameError}</div>
          {:else}
            <div
              class="validation-indicator"
              class:valid={vaultName.trim() && !nameError}
            >
              {vaultName.trim() && !nameError ? '✓' : ''}
            </div>
          {/if}
        </div>

        <div class="form-group">
          <label for="vault-path">Path:</label>
          <div class="path-input-group">
            <input
              id="vault-path"
              type="text"
              class="vault-path-input"
              class:error={pathError}
              value={vaultPath}
              oninput={handlePathInput}
              placeholder="/path/to/vault/directory"
              required
            />
            <button
              type="button"
              class="select-path-btn"
              onclick={selectPath}
              title="Browse for folder"
            >
              📂
            </button>
          </div>
          {#if pathError}
            <div class="error-text">{pathError}</div>
          {:else}
            <div
              class="validation-indicator"
              class:valid={vaultPath.trim() && !pathError}
            >
              {vaultPath.trim() && !pathError ? '✓' : ''}
            </div>
          {/if}
        </div>

        <div class="form-group">
          <label for="vault-description">Description (optional):</label>
          <textarea
            id="vault-description"
            class="vault-description-input"
            bind:value={vaultDescription}
            placeholder="Describe what this vault is for..."
            rows="3"
            maxlength="200"
          ></textarea>
        </div>

        {#if error}
          <div class="error-message">
            {error}
          </div>
        {/if}

        <div class="form-actions">
          <div class="pro-tip">💡 Pro tip: Use Ctrl+Enter to create quickly</div>
          <div class="action-buttons">
            <button type="button" class="cancel-btn" onclick={onClose}> Cancel </button>
            <button
              type="submit"
              class="create-btn"
              disabled={isLoading || !!nameError || !!pathError || !vaultName.trim() || !vaultPath.trim()}
            >
              {isLoading ? 'Creating...' : 'Create Vault'}
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: var(--bg-primary);
    border-radius: 0.75rem;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    width: 100%;
    max-width: 500px;
    max-height: 90vh;
    overflow: hidden;
    animation: slideIn 0.2s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.5rem 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.25rem;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    transition: all 0.2s ease;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .vault-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    position: relative;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .vault-name-input,
  .vault-path-input,
  .vault-description-input {
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .vault-name-input:focus,
  .vault-path-input:focus,
  .vault-description-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .vault-name-input.error,
  .vault-path-input.error {
    border-color: var(--error-border, #ef4444);
  }

  .path-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .vault-path-input {
    flex: 1;
  }

  .select-path-btn {
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    min-width: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .select-path-btn:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
  }

  .vault-description-input {
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
  }

  .validation-indicator {
    position: absolute;
    right: 0.75rem;
    top: 2.25rem;
    color: var(--success-text, #10b981);
    font-weight: 600;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .validation-indicator.valid {
    opacity: 1;
  }

  .error-text {
    font-size: 0.75rem;
    color: var(--error-text, #ef4444);
    margin-top: 0.25rem;
  }

  .error-message {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    border-left: 4px solid var(--error-border, #ef4444);
  }

  .form-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 0.5rem;
    gap: 1rem;
  }

  .pro-tip {
    font-size: 0.75rem;
    color: var(--text-secondary);
    flex: 1;
  }

  .action-buttons {
    display: flex;
    gap: 0.75rem;
  }

  .cancel-btn,
  .create-btn {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .cancel-btn {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border-color: var(--border-light);
  }

  .cancel-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .create-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .create-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    transform: translateY(-1px);
  }

  .create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0.5rem;
    }

    .modal-content {
      max-height: 95vh;
    }

    .modal-header,
    .vault-form {
      padding: 1rem;
    }

    .form-actions {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }

    .action-buttons {
      width: 100%;
    }

    .cancel-btn,
    .create-btn {
      flex: 1;
    }

    .pro-tip {
      order: 1;
      text-align: center;
    }
  }
</style>