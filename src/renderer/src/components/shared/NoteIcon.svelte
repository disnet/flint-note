<script lang="ts">
  import type { NoteMetadata } from '../../services/noteStore.svelte';
  import { notesStore } from '../../services/noteStore.svelte';
  import { getNoteIconData, getSourceIconData, getIconSvg } from '../../utils/noteIconHelpers';

  interface Props {
    note?: NoteMetadata;
    noteId?: string;
    source?: string;
    size?: number;
  }

  let { note, noteId, source, size = 14 }: Props = $props();

  const iconData = $derived.by(() => {
    if (note) {
      return getNoteIconData(note, notesStore.noteTypes);
    } else if (noteId) {
      const foundNote = notesStore.notes.find((n) => n.id === noteId);
      if (foundNote) {
        return getNoteIconData(foundNote, notesStore.noteTypes);
      }
    }

    // Fallback to source-based icon
    if (source) {
      return getSourceIconData(source);
    }

    return { type: 'svg' as const, value: 'document' };
  });
</script>

<div class="note-icon" style="width: {size}px; height: {size}px;">
  {#if iconData.type === 'emoji'}
    <span class="emoji-icon" style="font-size: {size}px;">{iconData.value}</span>
  {:else}
    {@html getIconSvg(iconData.value, size)}
  {/if}
</div>

<style>
  .note-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .emoji-icon {
    line-height: 1;
  }
</style>
