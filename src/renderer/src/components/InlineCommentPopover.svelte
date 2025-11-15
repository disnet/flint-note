<script lang="ts">
  import type { NoteSuggestion } from '../../../server/types';

  interface Props {
    visible: boolean;
    x: number;
    y: number;
    suggestions: NoteSuggestion[];
    onDismiss: (suggestionId: string) => void;
    onClose: () => void;
  }

  let {
    visible = $bindable(false),
    x,
    y,
    suggestions,
    onDismiss,
    onClose
  }: Props = $props();

  let popoverElement: HTMLDivElement | undefined = $state();
  let expandedReasoning = $state<Set<string>>(new Set());

  // Close on Escape key
  function handleKeydown(e: KeyboardEvent): void {
    if (!visible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  }

  // Close when clicking outside
  function handleClickOutside(e: MouseEvent): void {
    if (!visible) return;

    if (popoverElement && !popoverElement.contains(e.target as Node)) {
      onClose();
    }
  }

  // Adjust position to stay on screen
  $effect(() => {
    if (visible && popoverElement) {
      const rect = popoverElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Adjust horizontal position if needed
      if (rect.right > viewportWidth) {
        const newX = viewportWidth - rect.width - 8;
        popoverElement.style.left = `${Math.max(8, newX)}px`;
      }

      // Adjust vertical position if needed
      if (rect.bottom > viewportHeight) {
        const newY = viewportHeight - rect.height - 8;
        popoverElement.style.top = `${Math.max(8, newY)}px`;
      }
    }
  });

  // Set up event listeners
  $effect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeydown);
      document.addEventListener('mousedown', handleClickOutside);

      return () => {
        document.removeEventListener('keydown', handleKeydown);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return undefined;
  });

  function toggleReasoning(suggestionId: string): void {
    const newExpanded = new Set(expandedReasoning);
    if (newExpanded.has(suggestionId)) {
      newExpanded.delete(suggestionId);
    } else {
      newExpanded.add(suggestionId);
    }
    expandedReasoning = newExpanded;
  }

  function handleDismiss(suggestionId: string, e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();
    onDismiss(suggestionId);
  }

  function getPriorityLabel(priority: string | undefined): string {
    if (!priority) return 'low';
    return priority;
  }
</script>

{#if visible && suggestions.length > 0}
  <div
    bind:this={popoverElement}
    class="inline-comment-popover"
    style="left: {x}px; top: {y}px;"
  >
    <div class="popover-header">
      <span class="suggestion-count"
        >{suggestions.length} Suggestion{suggestions.length > 1 ? 's' : ''}</span
      >
      <button class="close-button" onclick={onClose} aria-label="Close">×</button>
    </div>

    <div class="suggestions-list">
      {#each suggestions as suggestion (suggestion.id)}
        <div class="suggestion-card">
          <div class="suggestion-header">
            <span class="suggestion-type">{suggestion.type}</span>
            <span
              class="suggestion-priority priority-{getPriorityLabel(suggestion.priority)}"
            >
              {getPriorityLabel(suggestion.priority)}
            </span>
          </div>

          <div class="suggestion-text">{suggestion.text}</div>

          {#if suggestion.reasoning}
            <button
              class="reasoning-toggle"
              onclick={() => toggleReasoning(suggestion.id)}
            >
              {expandedReasoning.has(suggestion.id) ? '▼' : '▶'}
              Reasoning
            </button>

            {#if expandedReasoning.has(suggestion.id)}
              <div class="reasoning-content">{suggestion.reasoning}</div>
            {/if}
          {/if}

          <button class="dismiss-button" onclick={(e) => handleDismiss(suggestion.id, e)}>
            Dismiss
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .inline-comment-popover {
    position: fixed;
    z-index: 1000;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    box-shadow:
      0 10px 15px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
    min-width: 300px;
    max-width: 400px;
    max-height: 500px;
    display: flex;
    flex-direction: column;
  }

  .popover-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .suggestion-count {
    font-size: 13px;
    font-weight: 600;
    color: #111827;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 24px;
    line-height: 1;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .close-button:hover {
    background-color: #f3f4f6;
    color: #111827;
  }

  .suggestions-list {
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .suggestion-card {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .suggestion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .suggestion-type {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: #6b7280;
    letter-spacing: 0.5px;
  }

  .suggestion-priority {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    padding: 2px 6px;
    border-radius: 3px;
    letter-spacing: 0.3px;
  }

  .suggestion-priority.priority-high {
    background-color: #fee2e2;
    color: #991b1b;
  }

  .suggestion-priority.priority-medium {
    background-color: #fef3c7;
    color: #92400e;
  }

  .suggestion-priority.priority-low {
    background-color: #dbeafe;
    color: #1e40af;
  }

  .suggestion-text {
    font-size: 14px;
    color: #111827;
    line-height: 1.5;
  }

  .reasoning-toggle {
    font-size: 12px;
    color: #6b7280;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
    text-align: left;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: color 0.2s;
  }

  .reasoning-toggle:hover {
    color: #111827;
  }

  .reasoning-content {
    font-size: 13px;
    color: #4b5563;
    line-height: 1.5;
    padding: 8px;
    background: white;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
  }

  .dismiss-button {
    font-size: 12px;
    font-weight: 500;
    color: #6b7280;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 6px 12px;
    cursor: pointer;
    transition: all 0.2s;
    align-self: flex-start;
  }

  .dismiss-button:hover {
    background: #f9fafb;
    border-color: #9ca3af;
    color: #111827;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .inline-comment-popover {
      background: #1f2937;
      border-color: #374151;
    }

    .popover-header {
      border-bottom-color: #374151;
    }

    .suggestion-count {
      color: #e5e7eb;
    }

    .close-button {
      color: #9ca3af;
    }

    .close-button:hover {
      background-color: #374151;
      color: #e5e7eb;
    }

    .suggestion-card {
      background: #111827;
      border-color: #374151;
    }

    .suggestion-type {
      color: #9ca3af;
    }

    .suggestion-priority.priority-high {
      background-color: #7f1d1d;
      color: #fecaca;
    }

    .suggestion-priority.priority-medium {
      background-color: #78350f;
      color: #fde68a;
    }

    .suggestion-priority.priority-low {
      background-color: #1e3a8a;
      color: #bfdbfe;
    }

    .suggestion-text {
      color: #e5e7eb;
    }

    .reasoning-toggle {
      color: #9ca3af;
    }

    .reasoning-toggle:hover {
      color: #e5e7eb;
    }

    .reasoning-content {
      background: #0f172a;
      border-color: #374151;
      color: #d1d5db;
    }

    .dismiss-button {
      background: #0f172a;
      border-color: #374151;
      color: #9ca3af;
    }

    .dismiss-button:hover {
      background: #1f2937;
      border-color: #4b5563;
      color: #e5e7eb;
    }
  }
</style>
