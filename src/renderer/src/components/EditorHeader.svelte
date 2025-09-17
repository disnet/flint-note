<script lang="ts">
  import NoteTitle from './NoteTitle.svelte';
  import NotePinButton from './NotePinButton.svelte';

  interface Props {
    title: string;
    isPinned: boolean;
    onTitleChange: (newTitle: string) => Promise<void>;
    onPinToggle: () => Promise<void>;
    disabled?: boolean;
  }

  let { title, isPinned, onTitleChange, onPinToggle, disabled = false }: Props = $props();

  let showPinControl = $state(false);
</script>

<div class="editor-header">
  <div
    class="editor-title-section"
    role="group"
    aria-label="Note title with pin control"
    onmouseenter={() => (showPinControl = true)}
    onmouseleave={() => (showPinControl = false)}
  >
    <NotePinButton
      {isPinned}
      onToggle={onPinToggle}
      visible={showPinControl || isPinned}
    />
    <NoteTitle value={title} onSave={onTitleChange} {disabled} />
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
    gap: 0.75rem;
    flex: 1;
    position: relative;
    min-height: 2rem;
  }

  .editor-title-section::before {
    content: '';
    position: absolute;
    left: -3rem;
    top: 0;
    bottom: 0;
    width: 3rem;
    z-index: 1;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .editor-title-section {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }
</style>
