<script lang="ts">
  import MarkdownRenderer from '../MarkdownRenderer.svelte';
  import AgentActivityWidget from '../AgentActivityWidget.svelte';
  import type { ToolCall } from '../../services/types';

  /**
   * ConversationMessage - Reusable message display component
   *
   * Supports different roles (user, agent, system) with role-based styling.
   * Can be used in both agent panel and review mode with different visual variants.
   */

  interface Props {
    /** Message content (markdown) */
    content: string;
    /** Message role: user, agent, or system */
    role: 'user' | 'agent' | 'system';
    /** Optional label to display above message (e.g., "Review Prompt:", "Feedback:") */
    label?: string;
    /** Collapsed state for reference messages */
    collapsed?: boolean;
    /** Visual variant: 'bubble' for agent panel, 'section' for review mode */
    variant?: 'bubble' | 'section';
    /** Tool calls to display (agent panel only) */
    toolCalls?: ToolCall[];
    /** Current step index for tool calls */
    currentStepIndex?: number;
    /** Callback for note clicks in markdown */
    onNoteClick?: (noteId: string, shiftKey?: boolean) => void;
    /** Disable slide-in animation */
    noAnimation?: boolean;
  }

  let {
    content,
    role,
    label,
    collapsed = false,
    variant = 'bubble',
    toolCalls,
    currentStepIndex,
    onNoteClick,
    noAnimation = false
  }: Props = $props();

  // Determine border color based on role and state
  let borderColor = $derived.by(() => {
    if (variant === 'section') {
      if (collapsed) return 'var(--text-muted)';
      if (role === 'user') return 'var(--accent-secondary)';
      if (role === 'agent' && label?.toLowerCase().includes('feedback')) {
        return 'var(--success)';
      }
      return 'var(--accent-primary)';
    }
    return 'var(--message-agent-border)';
  });

  // Determine background based on role and variant
  let background = $derived.by(() => {
    if (variant === 'section') {
      if (collapsed) return 'var(--bg-tertiary)';
      return 'var(--bg-secondary)';
    }
    if (role === 'user') return 'var(--bg-secondary)';
    return 'var(--message-agent-bg)';
  });
</script>

<div
  class="conversation-message"
  class:user={role === 'user'}
  class:agent={role === 'agent'}
  class:system={role === 'system'}
  class:bubble-variant={variant === 'bubble'}
  class:section-variant={variant === 'section'}
  class:collapsed
  class:no-animation={noAnimation}
  style:--border-color={borderColor}
  style:--bg-color={background}
>
  {#if label}
    <div class="message-label">{label}</div>
  {/if}

  {#if content.trim()}
    <div class="message-content">
      <MarkdownRenderer text={content} {onNoteClick} />
    </div>
  {/if}

  {#if toolCalls && toolCalls.length > 0}
    <div class="tool-calls">
      <AgentActivityWidget {toolCalls} {currentStepIndex} />
    </div>
  {/if}
</div>

<style>
  .conversation-message {
    padding: 0;
    margin-bottom: 0;
  }

  .conversation-message:not(.no-animation) {
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Bubble variant (agent panel style) */
  .bubble-variant .message-content {
    background: var(--bg-color);
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    line-height: 1.6;
    font-size: 0.875rem;
    color: var(--message-agent-text);
    border: 1px solid var(--border-color);
    transition: all 0.2s ease;
  }

  .bubble-variant.agent .message-content {
    border: 0;
    box-shadow: 0;
  }

  /* Section variant (review mode style) */
  .section-variant {
    padding: 1.5rem;
    border-radius: 4px;
    border-left: 4px solid var(--border-color);
    background: var(--bg-color);
  }

  .section-variant .message-label {
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 1rem;
    color: var(--text-secondary);
  }

  .section-variant.collapsed .message-label {
    color: var(--text-muted);
  }

  .section-variant .message-content {
    color: var(--text-primary);
    line-height: 1.6;
  }

  /* Tool calls */
  .tool-calls {
    margin-top: 0.75rem;
  }

  .bubble-variant.user .tool-calls {
    margin-right: 0;
  }

  .bubble-variant.agent .tool-calls {
    margin-left: 0;
  }
</style>
