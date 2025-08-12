<script lang="ts">
  import SearchBar from './SearchBar.svelte';
  import type { NoteMetadata } from '../services/noteStore.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onNoteSelect: (note: NoteMetadata) => void;
  }

  let { isOpen, onClose, onNoteSelect }: Props = $props();

  function handleNoteSelect(note: NoteMetadata): void {
    onNoteSelect(note);
    onClose();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }

  function handleOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  // Auto-focus search input when overlay opens
  $effect(() => {
    if (isOpen) {
      setTimeout(() => {
        const searchInput = document.getElementById('global-search');
        searchInput?.focus();
      }, 100);
    }
  });
</script>

{#if isOpen}
  <div
    class="search-overlay"
    onclick={handleOverlayClick}
    onkeydown={handleKeyDown}
    role="dialog"
    aria-modal="true"
    aria-label="Search notes"
    tabindex="0"
  >
    <div class="search-overlay-content">
      <SearchBar onNoteSelect={handleNoteSelect} />
    </div>
  </div>
{/if}

<style>
  .search-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    z-index: 1000;
    padding-top: 20vh;
  }

  .search-overlay-content {
    width: 90%;
    max-width: 1000px;
    padding: 1rem;
  }

  @media (max-width: 768px) {
    .search-overlay {
      padding-top: 10vh;
    }

    .search-overlay-content {
      width: 95%;
      padding: 0.75rem;
    }
  }
</style>
