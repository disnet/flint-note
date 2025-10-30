<script lang="ts">
  import type { AgentInputConfig, AgentInputResponse } from '../types/agent-input';
  import { validateInput } from '../utils/message-stream-parser.svelte';

  interface Props {
    isOpen: boolean;
    config: AgentInputConfig;
    onSubmit: (response: AgentInputResponse) => void;
    onCancel: () => void;
  }

  let { isOpen, config, onSubmit, onCancel }: Props = $props();

  // State for input value and validation
  let inputValue = $state<unknown>(config.defaultValue ?? false);
  let validationError = $state<string | null>(null);
  let isSubmitting = $state(false);

  // Reset input value when config changes or modal opens
  $effect(() => {
    if (isOpen) {
      inputValue = config.defaultValue ?? getDefaultValueForType(config.inputType);
      validationError = null;
      isSubmitting = false;

      // Focus first interactive element
      setTimeout(() => {
        const modal = document.querySelector('.agent-input-modal');
        const firstInput = modal?.querySelector('input, button') as HTMLElement;
        firstInput?.focus();
      }, 100);
    }
  });

  function getDefaultValueForType(inputType: string): unknown {
    switch (inputType) {
      case 'confirm':
        return false;
      case 'select':
        return '';
      case 'multiselect':
        return [];
      case 'text':
      case 'textarea':
        return '';
      case 'number':
      case 'slider':
        return config.validation?.min ?? 0;
      case 'date':
        return new Date().toISOString().split('T')[0];
      default:
        return null;
    }
  }

  function handleSubmit(event?: Event): void {
    event?.preventDefault();

    // Validate input
    const error = validateInput(inputValue, config);
    if (error) {
      validationError = error;
      return;
    }

    isSubmitting = true;

    // Send response
    onSubmit({
      requestId: config.id,
      value: inputValue,
      canceled: false
    });
  }

  function handleCancel(): void {
    onCancel();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      handleCancel();
    } else if (event.key === 'Enter' && config.inputType === 'confirm') {
      event.preventDefault();
      handleSubmit();
    }
  }

  function handleModalClick(event: MouseEvent): void {
    // Close on backdrop click if cancelable
    if (event.target === event.currentTarget && config.cancelable !== false) {
      handleCancel();
    }
  }

  // For confirm type: handle Yes/No button clicks
  function handleConfirmYes(): void {
    inputValue = true;
    handleSubmit();
  }

  function handleConfirmNo(): void {
    if (config.cancelable === false) {
      inputValue = false;
      handleSubmit();
    } else {
      handleCancel();
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
    aria-labelledby="agent-input-title"
    tabindex="-1"
  >
    <div class="modal-content agent-input-modal">
      <div class="modal-header">
        <div class="header-icon">🤖</div>
        <h3 id="agent-input-title">Agent Input Request</h3>
        {#if config.cancelable !== false}
          <button class="close-btn" onclick={handleCancel} aria-label="Close modal">
            ✕
          </button>
        {/if}
      </div>

      <div class="modal-body">
        <div class="prompt-section">
          <p class="prompt-text">{config.prompt}</p>
          {#if config.description}
            <p class="description-text">{config.description}</p>
          {/if}
        </div>

        <form class="input-section" onsubmit={handleSubmit}>
          {#if config.inputType === 'confirm'}
            <!-- Confirm Type: Yes/No Buttons -->
            <div class="confirm-buttons">
              <button
                type="button"
                class="confirm-btn confirm-yes"
                onclick={handleConfirmYes}
                disabled={isSubmitting}
              >
                {config.confirmText || 'Yes'}
              </button>
              <button
                type="button"
                class="confirm-btn confirm-no"
                onclick={handleConfirmNo}
                disabled={isSubmitting}
              >
                {config.cancelText || (config.cancelable === false ? 'No' : 'Cancel')}
              </button>
            </div>
          {/if}

          {#if config.helpText}
            <p class="help-text">
              <span class="help-icon">ℹ️</span>
              {config.helpText}
            </p>
          {/if}

          {#if validationError}
            <div class="error-message" role="alert">
              {validationError}
            </div>
          {/if}
        </form>
      </div>
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
    display: flex;
    flex-direction: column;
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
    gap: 0.75rem;
    padding: 1.5rem 1.5rem 1rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .header-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  .modal-header h3 {
    flex: 1;
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

  .modal-body {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .prompt-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .prompt-text {
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-primary);
    margin: 0;
    line-height: 1.5;
  }

  .description-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
    line-height: 1.4;
  }

  .input-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Confirm Type Styles */
  .confirm-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
  }

  .confirm-btn {
    padding: 0.875rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .confirm-yes {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .confirm-yes:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    transform: translateY(-1px);
  }

  .confirm-no {
    background: var(--bg-secondary);
    color: var(--text-secondary);
    border-color: var(--border-light);
  }

  .confirm-no:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .confirm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Help Text */
  .help-text {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    margin: 0;
    padding: 0.75rem;
    background: var(--bg-tertiary);
    border-radius: 0.375rem;
    border-left: 3px solid var(--accent-primary);
  }

  .help-icon {
    line-height: 1;
    flex-shrink: 0;
  }

  /* Error Message */
  .error-message {
    background: var(--error-bg, #fef2f2);
    color: var(--error-text, #ef4444);
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    border-left: 4px solid var(--error-border, #ef4444);
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
    .modal-body {
      padding: 1rem;
    }

    .confirm-buttons {
      grid-template-columns: 1fr;
    }
  }
</style>
