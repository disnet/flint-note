<script lang="ts">
  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onImport: (url: string) => Promise<void>;
  }

  let { isOpen, onClose, onImport }: Props = $props();

  let url = $state('');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let urlError = $state<string | null>(null);

  // Focus URL input when modal opens
  $effect(() => {
    if (isOpen) {
      setTimeout(() => {
        const urlInput = document.querySelector('.url-input') as HTMLInputElement;
        urlInput?.focus();
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
    url = '';
    error = null;
    urlError = null;
    isLoading = false;
  }

  function validateUrl(urlString: string): string | null {
    if (!urlString.trim()) {
      return 'URL is required';
    }
    try {
      const parsed = new URL(urlString);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return 'Only HTTP and HTTPS URLs are supported';
      }
      return null;
    } catch {
      return 'Invalid URL format';
    }
  }

  function handleUrlInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    url = target.value;
    urlError = validateUrl(url);
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    const validation = validateUrl(url);
    if (validation) {
      urlError = validation;
      return;
    }

    isLoading = true;
    error = null;

    try {
      await onImport(url.trim());
      onClose();
    } catch (err) {
      console.error('Failed to import webpage:', err);

      let errorMessage = 'Failed to import webpage';
      if (err instanceof Error) {
        if (err.message.includes('Failed to fetch')) {
          errorMessage = 'Could not fetch the webpage. It may be blocked or unavailable.';
        } else if (err.message.includes('extract')) {
          errorMessage =
            'Could not extract article content. The page may not be a readable article.';
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
    } else if (event.key === 'Enter' && !isLoading) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  function handleModalClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  async function handlePaste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        url = text.trim();
        urlError = validateUrl(url);
      }
    } catch {
      // Clipboard access denied or not available
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
        <h3 id="modal-title">Import Webpage</h3>
        <button class="close-btn" onclick={onClose} aria-label="Close modal">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 4L12 12M4 12L12 4"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <form class="import-form" onsubmit={handleSubmit}>
        <div class="form-description">
          Enter the URL of a webpage to import. The page will be converted to a clean,
          readable format that you can read and highlight.
        </div>

        <div class="form-group">
          <label for="webpage-url">URL:</label>
          <div class="url-input-group">
            <input
              id="webpage-url"
              type="url"
              class="url-input"
              class:error={urlError}
              value={url}
              oninput={handleUrlInput}
              placeholder="https://example.com/article"
              disabled={isLoading}
            />
            <button
              type="button"
              class="paste-btn"
              onclick={handlePaste}
              disabled={isLoading}
              title="Paste from clipboard"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4V2.5C4 1.67157 4.67157 1 5.5 1H10.5C11.3284 1 12 1.67157 12 2.5V4"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
                <rect
                  x="2"
                  y="4"
                  width="12"
                  height="11"
                  rx="1.5"
                  stroke="currentColor"
                  stroke-width="1.5"
                />
              </svg>
            </button>
          </div>
          {#if urlError}
            <div class="error-text">{urlError}</div>
          {/if}
        </div>

        {#if error}
          <div class="error-message">
            {error}
          </div>
        {/if}

        {#if isLoading}
          <div class="loading-message">
            <div class="loading-spinner"></div>
            <span>Fetching and processing webpage...</span>
          </div>
        {/if}

        <div class="form-actions">
          <button type="button" class="cancel-btn" onclick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            type="submit"
            class="import-btn"
            disabled={isLoading || !!urlError || !url.trim()}
          >
            {isLoading ? 'Importing...' : 'Import'}
          </button>
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
    max-width: 480px;
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
    padding: 1.25rem 1.5rem 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .close-btn {
    background: none;
    border: none;
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

  .import-form {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .form-description {
    font-size: 0.875rem;
    color: var(--text-secondary);
    line-height: 1.5;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .url-input-group {
    display: flex;
    gap: 0.5rem;
    align-items: stretch;
  }

  .url-input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .url-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .url-input.error {
    border-color: var(--error-border, #ef4444);
  }

  .url-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .paste-btn {
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .paste-btn:hover:not(:disabled) {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
    color: var(--text-primary);
  }

  .paste-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-text {
    font-size: 0.75rem;
    color: var(--error-text, #ef4444);
  }

  .error-message {
    background: var(--error-bg);
    color: var(--error-text);
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    border-left: 4px solid var(--error-border, #ef4444);
  }

  .loading-message {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .loading-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border-light);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .cancel-btn,
  .import-btn {
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

  .cancel-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .cancel-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .import-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .import-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    transform: translateY(-1px);
  }

  .import-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0.5rem;
    }

    .form-actions {
      flex-direction: column;
    }

    .cancel-btn,
    .import-btn {
      width: 100%;
    }
  }
</style>
