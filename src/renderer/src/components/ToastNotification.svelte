<script lang="ts">
  import { messageBus } from '../services/messageBus.svelte';

  interface Toast {
    id: string;
    message: string;
    variant: 'info' | 'success' | 'warning' | 'error';
    duration: number;
  }

  let toasts = $state<Toast[]>([]);

  // Listen for toast events
  $effect(() => {
    const unsubscribe = messageBus.subscribe('toast.show', (event) => {
      const toast: Toast = {
        id: `toast-${Date.now()}-${Math.random()}`,
        message: event.message,
        variant: event.variant || 'info',
        duration: event.duration || 3000
      };

      // Add toast to list
      toasts = [...toasts, toast];

      // Auto-dismiss after duration
      setTimeout(() => {
        dismissToast(toast.id);
      }, toast.duration);
    });

    return () => {
      unsubscribe();
    };
  });

  function dismissToast(id: string): void {
    toasts = toasts.filter((t) => t.id !== id);
  }

  function getIcon(variant: Toast['variant']): string {
    switch (variant) {
      case 'success':
        return '✓';
      case 'warning':
        return '⚠';
      case 'error':
        return '✕';
      case 'info':
      default:
        return 'ℹ';
    }
  }
</script>

{#if toasts.length > 0}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast toast-{toast.variant}">
        <div class="toast-content">
          <div class="toast-icon">{getIcon(toast.variant)}</div>
          <div class="toast-message">{toast.message}</div>
        </div>
        <button class="toast-dismiss" onclick={() => dismissToast(toast.id)}> ✕ </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10001;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 0.5rem;
    padding: 0.875rem 1rem;
    box-shadow:
      0 4px 6px rgba(0, 0, 0, 0.1),
      0 2px 4px rgba(0, 0, 0, 0.06);
    animation: slideInUp 0.3s ease-out;
    pointer-events: auto;
  }

  @keyframes slideInUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .toast-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .toast-icon {
    font-size: 1.25rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
  }

  .toast-message {
    color: var(--text-primary);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .toast-dismiss {
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.25rem;
    font-size: 1rem;
    line-height: 1;
    opacity: 0.6;
    transition: opacity 0.2s ease;
    flex-shrink: 0;
  }

  .toast-dismiss:hover {
    opacity: 1;
  }

  /* Variant styles */
  .toast-info {
    border-left: 3px solid var(--accent-primary, #3b82f6);
  }

  .toast-info .toast-icon {
    background: color-mix(in srgb, var(--accent-primary, #3b82f6) 20%, transparent);
    color: var(--accent-primary, #3b82f6);
  }

  .toast-success {
    border-left: 3px solid var(--accent-success, #10b981);
  }

  .toast-success .toast-icon {
    background: color-mix(in srgb, var(--accent-success, #10b981) 20%, transparent);
    color: var(--accent-success, #10b981);
  }

  .toast-warning {
    border-left: 3px solid var(--accent-warning, #f59e0b);
  }

  .toast-warning .toast-icon {
    background: color-mix(in srgb, var(--accent-warning, #f59e0b) 20%, transparent);
    color: var(--accent-warning, #f59e0b);
  }

  .toast-error {
    border-left: 3px solid var(--accent-error, #ef4444);
  }

  .toast-error .toast-icon {
    background: color-mix(in srgb, var(--accent-error, #ef4444) 20%, transparent);
    color: var(--accent-error, #ef4444);
  }
</style>
