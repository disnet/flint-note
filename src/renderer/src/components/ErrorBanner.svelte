<script lang="ts">
  interface Props {
    error: string | null;
    onDismiss?: () => void;
  }

  let { error, onDismiss }: Props = $props();

  function handleDismiss(): void {
    onDismiss?.();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      handleDismiss();
    }
  }
</script>

{#if error}
  <div class="error-banner" role="alert">
    <span class="error-message">{error}</span>
    {#if onDismiss}
      <button
        class="dismiss-button"
        onclick={handleDismiss}
        onkeydown={handleKeydown}
        aria-label="Dismiss error"
        title="Dismiss error"
      >
        ×
      </button>
    {/if}
  </div>
{/if}

<style>
  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--error-bg);
    color: var(--error-text);
    border-bottom: 1px solid var(--border-light);
    font-size: 0.875rem;
    gap: 1rem;
  }

  .error-message {
    flex: 1;
  }

  .dismiss-button {
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    font-size: 1.25rem;
    font-weight: bold;
    padding: 0;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
    transition: background-color 0.2s ease;
  }

  .dismiss-button:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  .dismiss-button:focus {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
</style>
