<script lang="ts">
  import type { NoteViewProps } from './ViewRegistry';
  import type { Snippet } from 'svelte';

  let {
    activeNote,
    noteContent,
    metadata,
    onContentChange,
    onMetadataChange,
    onSave,
    children
  }: NoteViewProps & {
    children: Snippet<
      [
        {
          activeNote: Record<string, unknown>;
          noteContent: string;
          metadata: Record<string, unknown>;
          handleContentChange: (content: string) => void;
          handleMetadataChange: (metadata: Record<string, unknown>) => void;
          handleSave: () => void;
        }
      ]
    >;
  } = $props();

  // Default implementation - override in child components
  function handleContentChange(newContent: string): void {
    onContentChange(newContent);
  }

  function handleMetadataChange(newMetadata: Record<string, unknown>): void {
    onMetadataChange(newMetadata);
  }

  function handleSave(): void {
    onSave();
  }
</script>

<div class="base-note-view">
  {@render children({
    activeNote,
    noteContent,
    metadata,
    handleContentChange,
    handleMetadataChange,
    handleSave
  })}
</div>

<style>
  .base-note-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }
</style>
