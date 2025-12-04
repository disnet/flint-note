<script lang="ts">
  import NoteTitle from './NoteTitle.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';

  interface Props {
    title: string;
    noteType: string;
    onTitleChange: (newTitle: string) => Promise<void>;
    onTypeChange: (newType: string) => Promise<void>;
    onTabToContent?: () => void;
    disabled?: boolean;
  }

  let {
    title,
    noteType,
    onTitleChange,
    onTypeChange,
    onTabToContent,
    disabled = false
  }: Props = $props();

  let titleComponent: { focus?: () => void } | null = null;

  export function focusTitle(): void {
    if (titleComponent && titleComponent.focus) {
      titleComponent.focus();
    }
  }
</script>

<div class="editor-header" role="group" aria-label="Note title">
  <NoteTypeDropdown currentType={noteType} {onTypeChange} {disabled} compact={true} />
  <NoteTitle
    bind:this={titleComponent}
    value={title}
    onSave={onTitleChange}
    {onTabToContent}
    {disabled}
  />
</div>

<style>
  .editor-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    width: 100%;
    min-width: 0;
  }

  /* Make compact type dropdown match title size */
  .editor-header :global(.note-type-dropdown.compact .type-button) {
    padding: 0.1em 0.25rem;
  }

  .editor-header :global(.note-type-dropdown.compact .type-icon) {
    font-size: 1.5rem;
  }
</style>
