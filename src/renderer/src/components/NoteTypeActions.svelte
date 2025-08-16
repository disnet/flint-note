<script lang="ts">
  interface Props {
    typeName: string;
    onCreateNote: (noteType: string) => void;
    onShowTypeInfo: (typeName: string) => void;
  }

  let { typeName, onCreateNote, onShowTypeInfo }: Props = $props();

  function handleToggleTypeInfo(): void {
    onShowTypeInfo(typeName);
  }

  function handleCreateNote(): void {
    onCreateNote(typeName);
  }
</script>

<div class="note-type-actions">
  <button
    class="action-btn info-btn"
    onclick={handleToggleTypeInfo}
    title="View note type information"
    aria-label="View note type information"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M12 16v-4"></path>
      <path d="M12 8h.01"></path>
    </svg>
  </button>

  <button
    class="action-btn create-btn"
    onclick={handleCreateNote}
    title="Create new {typeName} note"
    aria-label="Create new {typeName} note"
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  </button>
</div>

<style>
  .note-type-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .action-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .action-btn:hover {
    background: var(--bg-secondary);
    color: var(--accent-primary);
  }
</style>
