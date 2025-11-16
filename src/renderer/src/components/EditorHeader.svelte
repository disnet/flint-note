<script lang="ts">
  import NoteTitle from './NoteTitle.svelte';
  import NoteTypeDropdown from './NoteTypeDropdown.svelte';

  interface Props {
    title: string;
    noteType: string;
    onTitleChange: (newTitle: string) => Promise<void>;
    onTypeChange: (newType: string) => Promise<void>;
    disabled?: boolean;
  }

  let {
    title,
    noteType,
    onTitleChange,
    onTypeChange,
    disabled = false
  }: Props = $props();

  let titleComponent: { focus?: () => void } | null = null;

  export function focusTitle(): void {
    if (titleComponent && titleComponent.focus) {
      titleComponent.focus();
    }
  }
</script>

<div class="editor-header">
  <div class="header-type-row">
    <NoteTypeDropdown currentType={noteType} {onTypeChange} {disabled} />
  </div>
  <div class="header-title-row" role="group" aria-label="Note title">
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
    flex-direction: column;
    background: var(--bg-primary);
    width: 100%;
    gap: 0.25rem;
  }

  .header-type-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    min-height: 1.5rem;
  }

  .header-title-row {
    display: flex;
    width: 100%;
    min-width: 0;
  }

  .separator {
    color: var(--text-secondary);
    opacity: 0.4;
    font-size: 1rem;
    font-weight: 300;
    margin: 0 0.125rem;
  }
</style>
