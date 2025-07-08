<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { NoteReference } from '../types/chat';

  export let note: NoteReference;
  export let inline: boolean = false;

  const dispatch = createEventDispatcher<{
    click: { note: NoteReference };
  }>();

  const handleClick = () => {
    dispatch('click', { note });
  };

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
      default:
        return '📄';
    }
  };

  const getNoteTypeColor = (type?: string): string => {
    switch (type) {
      case 'daily':
        return '#28a745';
      case 'project':
        return '#007bff';
      case 'meeting':
        return '#fd7e14';
      case 'idea':
        return '#6f42c1';
      case 'reference':
        return '#6c757d';
      default:
        return '#007bff';
    }
  };
</script>

<button
  class="note-reference"
  class:inline
  on:click={handleClick}
  style="--note-color: {getNoteTypeColor(note.type)}"
  title={note.path ? `${note.title} (${note.path})` : note.title}
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
    color: var(--note-color);
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
