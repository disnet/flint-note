<script lang="ts">
  import NoteTitle from './NoteTitle.svelte';

  interface Props {
    title: string;
    onTitleChange: (newTitle: string) => Promise<void>;
    disabled?: boolean;
  }

  let { title, onTitleChange, disabled = false }: Props = $props();

  let titleComponent: { focus?: () => void } | null = null;

  export function focusTitle(): void {
    if (titleComponent && titleComponent.focus) {
      titleComponent.focus();
    }
  }
</script>

<div class="editor-header" role="group" aria-label="Note title">
  <NoteTitle bind:this={titleComponent} value={title} onSave={onTitleChange} {disabled} />
</div>

<style>
  .editor-header {
    display: flex;
    width: 100%;
    min-width: 0;
  }
</style>
