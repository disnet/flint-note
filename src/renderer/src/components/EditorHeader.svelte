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

<div class="editor-header">
  <div class="editor-title-section" role="group" aria-label="Note title">
    <NoteTitle
      bind:this={titleComponent}
      value={title}
      onSave={onTitleChange}
      {disabled}
    />
  </div>
</div>

<style>
  .editor-header {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    background: var(--bg-primary);
    width: 100%;
  }

  .editor-title-section {
    display: flex;
    align-items: center;
    flex: 1;
    min-height: 2rem;
  }
</style>
