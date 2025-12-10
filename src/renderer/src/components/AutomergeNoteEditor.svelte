<script lang="ts">
  /**
   * Note editor component using Automerge for data storage
   * Simple text-based editor (can be enhanced with CodeMirror later)
   */
  import type { Note } from '../lib/automerge';
  import { getBacklinks } from '../lib/automerge';

  interface Props {
    note: Note;
    onTitleChange: (title: string) => void;
    onContentChange: (content: string) => void;
    onArchive: () => void;
  }

  let { note, onTitleChange, onContentChange, onArchive }: Props = $props();

  // Debounce content changes
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleTitleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    onTitleChange(target.value);
  }

  function handleContentInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    const content = target.value;

    // Debounce content updates
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      onContentChange(content);
    }, 300);
  }

  // Get backlinks for this note
  const backlinks = $derived(getBacklinks(note.id));

  // Format date
  function formatDate(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Handle keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent): void {
    // Save on Cmd/Ctrl+S (no-op since autosave, but prevent browser save dialog)
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="note-editor" onkeydown={handleKeyDown}>
  <!-- Header -->
  <div class="editor-header">
    <input
      type="text"
      class="title-input"
      value={note.title}
      oninput={handleTitleInput}
      placeholder="Untitled"
    />
    <div class="header-actions">
      <span class="last-modified" title="Last modified">
        {formatDate(note.updated)}
      </span>
      <button class="archive-btn" onclick={onArchive} title="Archive note"> 🗑️ </button>
    </div>
  </div>

  <!-- Content -->
  <div class="editor-content">
    <textarea
      class="content-textarea"
      value={note.content}
      oninput={handleContentInput}
      placeholder="Start writing..."
    ></textarea>
  </div>

  <!-- Footer with backlinks -->
  {#if backlinks.length > 0}
    <div class="backlinks-section">
      <div class="backlinks-header">
        <span>Backlinks ({backlinks.length})</span>
      </div>
      <div class="backlinks-list">
        {#each backlinks as backlink (backlink.note.id)}
          <div class="backlink-item">
            <span class="backlink-title">{backlink.note.title || 'Untitled'}</span>
            {#each backlink.contexts as context, contextIndex (contextIndex)}
              <div class="backlink-context">
                {#each context.lines as line, lineIndex (lineIndex)}
                  <span class:highlight={line.isLinkLine}>{line.text}</span>
                {/each}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .note-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  /* Header */
  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
    flex-shrink: 0;
  }

  .title-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    outline: none;
    padding: 0;
  }

  .title-input::placeholder {
    color: var(--text-muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .last-modified {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .archive-btn {
    padding: 0.375rem 0.5rem;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 1rem;
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .archive-btn:hover {
    opacity: 1;
  }

  /* Content */
  .editor-content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .content-textarea {
    flex: 1;
    width: 100%;
    padding: 1.5rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-family:
      ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono',
      monospace;
    font-size: 0.9375rem;
    line-height: 1.6;
    resize: none;
    outline: none;
  }

  .content-textarea::placeholder {
    color: var(--text-muted);
  }

  /* Backlinks */
  .backlinks-section {
    border-top: 1px solid var(--border-light);
    background: var(--bg-secondary);
    max-height: 200px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .backlinks-header {
    padding: 0.75rem 1.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--border-light);
  }

  .backlinks-list {
    padding: 0.5rem 1rem;
  }

  .backlink-item {
    padding: 0.5rem;
    border-radius: 0.375rem;
    margin-bottom: 0.5rem;
  }

  .backlink-item:hover {
    background: var(--bg-hover);
  }

  .backlink-title {
    font-weight: 500;
    color: var(--text-primary);
    display: block;
    margin-bottom: 0.25rem;
  }

  .backlink-context {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
    padding: 0.25rem 0;
  }

  .backlink-context .highlight {
    background: rgba(59, 130, 246, 0.1);
    color: var(--accent-primary);
    border-radius: 0.125rem;
    padding: 0 0.125rem;
  }
</style>
