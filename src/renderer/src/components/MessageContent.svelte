<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { NoteReference } from '../types/chat';
  import { parseMessageContent } from '../utils/messageParser';
  import NoteReferenceComponent from './NoteReferenceComponent.svelte';

  export let content: string;
  export let messageType: 'user' | 'agent' | 'system' = 'agent';

  const dispatch = createEventDispatcher<{
    noteClick: { note: NoteReference };
  }>();

  $: messageParts = parseMessageContent(content);

  const handleNoteClick = (event: CustomEvent<{ note: NoteReference }>) => {
    dispatch('noteClick', event.detail);
  };

  const formatText = (text: string): string => {
    // Basic markdown-style formatting
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  };
</script>

<div
  class="message-content"
  class:user={messageType === 'user'}
  class:system={messageType === 'system'}
>
  {#each messageParts as part}
    {#if part.type === 'text'}
      <span class="text-part">{@html formatText(part.content)}</span>
    {:else if part.type === 'note' && part.note}
      <NoteReferenceComponent note={part.note} inline={true} on:click={handleNoteClick} />
    {/if}
  {/each}
</div>

<style>
  .message-content {
    line-height: 1.5;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .message-content.user {
    color: white;
  }

  .message-content.system {
    font-style: italic;
    color: #6c757d;
  }

  .text-part {
    white-space: pre-wrap;
  }

  .message-content :global(strong) {
    font-weight: 600;
  }

  .message-content :global(em) {
    font-style: italic;
  }

  .message-content :global(code) {
    background-color: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family:
      ui-monospace,
      SFMono-Regular,
      SF Mono,
      Menlo,
      Consolas,
      Liberation Mono,
      monospace;
    font-size: 0.9em;
  }

  .message-content.user :global(code) {
    background-color: rgba(255, 255, 255, 0.2);
  }

  .message-content.system :global(code) {
    background-color: rgba(108, 117, 125, 0.1);
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .message-content :global(code) {
      background-color: rgba(255, 255, 255, 0.1);
    }

    .message-content.user :global(code) {
      background-color: rgba(255, 255, 255, 0.2);
    }

    .message-content.system {
      color: #adb5bd;
    }

    .message-content.system :global(code) {
      background-color: rgba(173, 181, 189, 0.1);
    }
  }
</style>
