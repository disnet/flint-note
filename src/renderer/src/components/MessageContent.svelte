<script lang="ts">
  import type { NoteReference } from '../types/chat';
  import { parseMessageContentSync, preloadNoteReferences } from '../utils/messageParser';
  import NoteReferenceComponent from './NoteReferenceComponent.svelte';

  interface Props {
    content: string;
    messageType: 'user' | 'agent' | 'system' | 'tool';
    openNote: (note: NoteReference) => void;
  }
  let { content, messageType = 'agent', openNote }: Props = $props();

  let messageParts = $derived(parseMessageContentSync(content));

  // Preload note references in the background
  $effect(() => {
    if (content) {
      preloadNoteReferences(content).catch(console.error);
    }
  });

  const formatText = (text: string): { type: string; content: string }[] => {
    // Parse text into segments for safe rendering
    const segments: { type: string; content: string }[] = [];

    // Simple regex patterns for basic markdown
    const patterns = [
      { regex: /\*\*(.*?)\*\*/g, type: 'bold' },
      { regex: /\*(.*?)\*/g, type: 'italic' },
      { regex: /`(.*?)`/g, type: 'code' }
    ];

    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (i > 0) {
        segments.push({ type: 'br', content: '' });
      }

      let line = lines[i];
      let lastIndex = 0;
      const matches: { start: number; end: number; type: string; content: string }[] = [];

      // Find all matches in this line
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.regex.exec(line)) !== null) {
          matches.push({
            start: match.index,
            end: match.index + match[0].length,
            type: pattern.type,
            content: match[1]
          });
        }
      }

      // Sort matches by position
      matches.sort((a, b) => a.start - b.start);

      // Process matches
      for (const match of matches) {
        // Add text before match
        if (match.start > lastIndex) {
          segments.push({ type: 'text', content: line.slice(lastIndex, match.start) });
        }

        // Add formatted match
        segments.push({ type: match.type, content: match.content });
        lastIndex = match.end;
      }

      // Add remaining text
      if (lastIndex < line.length) {
        segments.push({ type: 'text', content: line.slice(lastIndex) });
      }
    }

    return segments;
  };
</script>

<div
  class="message-content"
  class:user={messageType === 'user'}
  class:system={messageType === 'system'}
>
  {#each messageParts as part, index (index)}
    {#if part.type === 'text'}
      {#each formatText(part.content) as segment, segIndex (segIndex)}
        {#if segment.type === 'text'}
          <span class="text-part">{segment.content}</span>
        {:else if segment.type === 'bold'}
          <strong>{segment.content}</strong>
        {:else if segment.type === 'italic'}
          <em>{segment.content}</em>
        {:else if segment.type === 'code'}
          <code>{segment.content}</code>
        {:else if segment.type === 'br'}
          <br />
        {/if}
      {/each}
    {:else if part.type === 'note' && part.note}
      <NoteReferenceComponent
        note={part.note}
        inline={true}
        onclick={() => openNote(part.note)}
      />
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
