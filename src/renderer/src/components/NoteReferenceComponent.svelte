<script lang="ts">
  import type { NoteReference } from '../types/chat';

  interface Props {
    note: NoteReference;
    inline: boolean;
    onclick: (evt: MouseEvent) => void;
  }

  let { note, inline = false, onclick }: Props = $props();

  const getNoteIcon = (type?: string): string => {
    switch (type) {
      case 'daily':
        return '📅';
      case 'project':
        return '📋';
      case 'meeting':
        return '🤝';
      case 'idea':
        return '💡';
      case 'reference':
        return '🔗';
      case 'loading':
        return '⏳';
      case 'broken':
        return '❌';
      default:
        return '📄';
    }
  };

  const getNoteTypeColor = (type?: string): string => {
    switch (type) {
      case 'daily':
        return '40, 167, 69';
      case 'project':
        return '0, 123, 255';
      case 'meeting':
        return '253, 126, 20';
      case 'idea':
        return '111, 66, 193';
      case 'reference':
        return '108, 117, 125';
      case 'loading':
        return '255, 193, 7';
      case 'broken':
        return '220, 53, 69';
      case 'reading':
        return '111, 66, 193';
      case 'todo':
        return '40, 167, 69';
      default:
        return '0, 123, 255';
    }
  };
</script>

<button
  class="note-reference"
  class:inline
  class:loading={note.type === 'loading'}
  class:broken={note.type === 'broken'}
  onclick={note.type === 'loading' || note.type === 'broken' ? undefined : onclick}
  style="--note-color: {getNoteTypeColor(note.type)};"
  title={note.path ? `${note.title} (${note.path})` : note.title}
  disabled={note.type === 'loading' || note.type === 'broken'}
>
  <span class="note-icon">{getNoteIcon(note.type)}</span>
  <span class="note-title">{note.title}</span>
  {#if note.type && !inline}
    <span class="note-type">{note.type}</span>
  {/if}
</button>

<style>
  .note-reference {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background-color: rgba(var(--note-color), 0.1);
    border: 1px solid rgba(var(--note-color), 0.2);
    border-radius: 0.375rem;
    color: rgb(var(--note-color));
    font-size: 0.875rem;
    font-weight: 500;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
    margin: 0.125rem;
    --note-color: 0, 123, 255;
  }

  .note-reference:hover {
    background-color: rgba(var(--note-color), 0.15);
    border-color: rgba(var(--note-color), 0.3);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(var(--note-color), 0.1);
  }

  .note-reference:active {
    transform: translateY(0);
  }

  .note-reference.loading {
    opacity: 0.7;
    cursor: wait;
  }

  .note-reference.broken {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .note-reference:disabled {
    cursor: not-allowed;
  }

  .note-reference:disabled:hover {
    transform: none;
    box-shadow: none;
  }

  .note-reference.inline {
    padding: 0.125rem 0.375rem;
    font-size: 0.8rem;
    margin: 0 0.125rem;
  }

  .note-icon {
    font-size: 1em;
    line-height: 1;
  }

  .note-title {
    line-height: 1.2;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-type {
    font-size: 0.75rem;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.025em;
    font-weight: 600;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .note-reference {
      background-color: rgba(var(--note-color), 0.15);
      border-color: rgba(var(--note-color), 0.3);
    }

    .note-reference:hover {
      background-color: rgba(var(--note-color), 0.2);
      border-color: rgba(var(--note-color), 0.4);
    }
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .note-title {
      max-width: 150px;
    }
  }
</style>
