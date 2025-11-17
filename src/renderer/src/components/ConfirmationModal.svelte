<script lang="ts">
  interface Props {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmStyle?: 'primary' | 'danger';
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    confirmStyle = 'primary',
    onConfirm,
    onCancel
  }: Props = $props();

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onCancel();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onConfirm();
    }
  }

  function handleModalClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onCancel();
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
        <h3 id="modal-title">{title}</h3>
        <button class="close-btn" onclick={onCancel} aria-label="Close modal"> ✕ </button>
      </div>

      <div class="modal-body">
        <p>{message}</p>
      </div>

      <div class="modal-footer">
        <button type="button" class="cancel-btn" onclick={onCancel}>
          {cancelText}
        </button>
        <button
          type="button"
          class="confirm-btn"
          class:danger={confirmStyle === 'danger'}
          onclick={onConfirm}
        >
          {confirmText}
        </button>
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
    max-width: 400px;
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
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.125rem;
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
  }

  .modal-body p {
    margin: 0;
    color: var(--text-primary);
    font-size: 0.9375rem;
    line-height: 1.6;
  }

  .modal-footer {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border-light);
    justify-content: flex-end;
  }

  .cancel-btn,
  .confirm-btn {
    padding: 0.625rem 1.25rem;
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

  .confirm-btn {
    background: var(--accent-primary);
    color: var(--accent-text);
  }

  .confirm-btn:hover {
    background: var(--accent-primary-hover);
    transform: translateY(-1px);
  }

  .confirm-btn.danger {
    background: #ef4444;
    color: white;
  }

  .confirm-btn.danger:hover {
    background: #dc2626;
  }

  /* Mobile responsive */
  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0.5rem;
    }

    .modal-footer {
      flex-direction: column-reverse;
    }

    .cancel-btn,
    .confirm-btn {
      width: 100%;
    }
  }
</style>
