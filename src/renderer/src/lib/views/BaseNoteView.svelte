<script lang="ts">
  import type { NoteViewProps } from './ViewRegistry';

  let {
    activeNote,
    noteContent,
    metadata,
    onContentChange,
    onMetadataChange,
    onSave
  }: NoteViewProps = $props();

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
  <slot
    {activeNote}
    {noteContent}
    {metadata}
    {handleContentChange}
    {handleMetadataChange}
    {handleSave}
  />
</div>

<style>
  .base-note-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }
</style>
