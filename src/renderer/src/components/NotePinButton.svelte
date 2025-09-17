<script lang="ts">
  interface Props {
    isPinned: boolean;
    onToggle: () => Promise<void>;
    showOnHover?: boolean;
    visible?: boolean;
  }

  let { isPinned, onToggle, showOnHover = false, visible = true }: Props = $props();

  let isProcessing = $state(false);

  async function handleToggle(): Promise<void> {
    if (isProcessing) return;

    try {
      isProcessing = true;
      await onToggle();
    } catch (error) {
      console.error('Failed to toggle pin status:', error);
    } finally {
      isProcessing = false;
    }
  }

  let shouldShow = $derived(visible && (!showOnHover || isPinned));
</script>

{#if shouldShow}
  <button
    class="pin-control"
    class:pinned={isPinned}
    class:processing={isProcessing}
    onclick={handleToggle}
    disabled={isProcessing}
    aria-label={isPinned ? 'Unpin note' : 'Pin note'}
    title={isPinned ? 'Unpin note' : 'Pin note'}
  >
    📌
  </button>
{/if}

<style>
  .pin-control {
    position: absolute;
    left: -2rem;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 0.25rem;
    width: 1.5rem;
    height: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    color: rgba(0, 0, 0, 0.6);
    z-index: 10;
  }

  .pin-control:hover {
    background: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.8);
    border-color: rgba(0, 0, 0, 0.25);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .pin-control.pinned {
    background: var(--accent-light);
    color: var(--text-primary);
    border-color: #3b82f6;
  }

  .pin-control.pinned:hover {
    background: var(--accent-hover);
    color: white;
    border-color: #2563eb;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
  }

  .pin-control:disabled,
  .pin-control.processing {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (prefers-color-scheme: dark) {
    .pin-control {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.7);
    }

    .pin-control:hover {
      background: rgba(255, 255, 255, 0.15);
      color: rgba(255, 255, 255, 0.9);
      border-color: rgba(255, 255, 255, 0.3);
      box-shadow: 0 2px 4px rgba(255, 255, 255, 0.1);
    }
  }
</style>
