<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * ConversationContainer - Reusable container for conversation-style UIs
   *
   * Implements the critical flexbox pattern for fixed header + scrollable content + fixed controls.
   * This pattern is used across Agent, ReviewMode, and other conversation interfaces.
   *
   * Key CSS trick: min-height: 0 on scrollable content allows flex items to scroll properly.
   */

  interface Props {
    /** Enable auto-scroll to bottom when content changes */
    autoScroll?: boolean;
    /** CSS class for the container */
    class?: string;
    /** Optional header snippet */
    header?: Snippet;
    /** Required content snippet */
    content: Snippet;
    /** Optional controls snippet */
    controls?: Snippet;
    /** Optional dependency to track for triggering auto-scroll (e.g., messages array) */
    scrollDependency?: unknown;
  }

  let {
    autoScroll = false,
    class: className = '',
    header,
    content,
    controls,
    scrollDependency
  }: Props = $props();

  let contentContainer = $state<HTMLDivElement>();

  // Auto-scroll effect when content changes
  $effect(() => {
    if (!autoScroll || !contentContainer) return;

    // Track the scroll dependency to detect content changes
    void scrollDependency;

    // Scroll to bottom immediately
    const scrollToBottom = (): void => {
      if (contentContainer) {
        contentContainer.scrollTop = contentContainer.scrollHeight;
      }
    };

    requestAnimationFrame(scrollToBottom);

    // Set up MutationObserver to watch for DOM changes (streaming text updates)
    const observer = new MutationObserver(() => {
      requestAnimationFrame(scrollToBottom);
    });

    observer.observe(contentContainer, {
      childList: true,
      subtree: true,
      characterData: true
    });

    return () => {
      observer.disconnect();
    };
  });
</script>

<div class="conversation-container {className}">
  <!-- Fixed header section (optional) -->
  {#if header}
    <div class="conversation-header">
      {@render header()}
    </div>
  {/if}

  <!-- Scrollable content section -->
  <div class="conversation-content" bind:this={contentContainer}>
    {@render content()}
  </div>

  <!-- Fixed controls section (optional) -->
  {#if controls}
    <div class="conversation-controls">
      {@render controls()}
    </div>
  {/if}
</div>

<style>
  .conversation-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-height: 100%;
    min-height: 0; /* Critical for flexbox children to respect parent height */
    overflow: hidden;
  }

  .conversation-header {
    flex-shrink: 0; /* Never shrink header */
  }

  .conversation-content {
    flex: 1; /* Grow to fill available space */
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0; /* !!! CRITICAL !!! Allows flex item to scroll properly */
    max-height: 100%; /* Force height constraint */
  }

  .conversation-controls {
    flex-shrink: 0; /* Never shrink controls */
  }

  /* Scrollbar styling */
  .conversation-content::-webkit-scrollbar {
    width: 8px;
  }

  .conversation-content::-webkit-scrollbar-track {
    background: transparent;
  }

  .conversation-content::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
    transition: background-color 0.2s ease;
  }

  .conversation-content::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
</style>
