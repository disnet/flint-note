<script lang="ts">
  import MarkdownRenderer from './MarkdownRenderer.svelte';

  interface Props {
    isOpen: boolean;
    noteTitle: string;
    noteContent: string;
    onClose: () => void;
  }

  let { isOpen, noteTitle, noteContent, onClose }: Props = $props();

  // Handle escape key to close drawer
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isOpen) {
      onClose();
    }
  }

  $effect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when drawer is open
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="drawer-overlay" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="drawer" onclick={(e) => e.stopPropagation()}>
      <div class="drawer-header">
        <h3>{noteTitle}</h3>
        <button class="close-btn" onclick={onClose} aria-label="Close">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="drawer-content">
        <MarkdownRenderer text={noteContent} />
      </div>
    </div>
  </div>
{/if}

<style>
  .drawer-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: flex-end;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .drawer {
    width: 600px;
    max-width: 90vw;
    background: var(--bg-primary);
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 2px solid var(--border-light);
    background: var(--bg-secondary);
  }

  .drawer-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
    flex: 1;
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 2rem;
    color: var(--text-primary);
    line-height: 1.6;
  }

  /* Scrollbar styling */
  .drawer-content::-webkit-scrollbar {
    width: 8px;
  }

  .drawer-content::-webkit-scrollbar-track {
    background: var(--bg-secondary);
  }

  .drawer-content::-webkit-scrollbar-thumb {
    background: var(--border-light);
    border-radius: 4px;
  }

  .drawer-content::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
</style>
