<script lang="ts">
  import type { DailyNote } from '../stores/dailyViewStore.svelte';

  interface Props {
    dailyNote: DailyNote | null;
    date: string;
    onContentChange?: (content: string) => void;
  }

  let { dailyNote, date, onContentChange }: Props = $props();

  // Mock content for Phase 0
  let content = $state('');

  // Debounced content change handler
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  function handleInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    content = target.value;

    // Debounce the content change callback
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    debounceTimeout = setTimeout(() => {
      onContentChange?.(content);
    }, 500); // 500ms debounce
  }

  function handleKeyDown(event: KeyboardEvent): void {
    // Allow Tab key to insert tab character
    if (event.key === 'Tab') {
      event.preventDefault();
      const target = event.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      // Insert tab character
      const newValue = content.substring(0, start) + '\t' + content.substring(end);
      content = newValue;

      // Restore cursor position
      setTimeout(() => {
        target.setSelectionRange(start + 1, start + 1);
      }, 0);

      // Trigger content change
      onContentChange?.(content);
    }
  }

  // Initialize with mock content for demonstration
  $effect(() => {
    if (dailyNote && content === '') {
      // Mock content for Phase 0 - different content for different days
      const dayOfWeek = new Date(date).getDay();
      const mockContents = [
        "# Daily Reflection\n\n## What I accomplished today\n- \n\n## What I learned\n- \n\n## Tomorrow's priorities\n- ",
        "# Monday Planning\n\n## Week goals\n- \n\n## Today's tasks\n- [ ] \n- [ ] \n\n## Notes\n",
        '# Tuesday Progress\n\n## Completed\n- \n\n## In progress\n- \n\n## Blockers\n- ',
        '# Wednesday Check-in\n\n## Key accomplishments\n- \n\n## Challenges faced\n- \n\n## Adjustments needed\n- ',
        '# Thursday Review\n\n## Project updates\n- \n\n## Meetings & insights\n- \n\n## Action items\n- ',
        '# Friday Wrap-up\n\n## Week summary\n- \n\n## What went well\n- \n\n## Areas for improvement\n- \n\n## Next week planning\n- ',
        '# Weekend Planning\n\n## Personal projects\n- \n\n## Learning goals\n- \n\n## Reflection\n- '
      ];

      content = mockContents[dayOfWeek] || mockContents[0];
    }
  });
</script>

<div class="daily-note-editor">
  <div class="editor-header">
    <label for="daily-note-{date}" class="editor-label"> Daily Note </label>
    <span class="editor-hint"> Auto-saves as you type </span>
  </div>

  <div class="editor-container">
    <textarea
      id="daily-note-{date}"
      class="editor-textarea"
      bind:value={content}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      placeholder="Start writing your daily note..."
      rows="8"
    ></textarea>
  </div>
</div>

<style>
  .daily-note-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .editor-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0;
  }

  .editor-hint {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-style: italic;
  }

  .editor-container {
    position: relative;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
  }

  .editor-container:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
  }

  .editor-textarea {
    width: 100%;
    min-height: 200px;
    padding: 1rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-primary);
    font-family: var(--font-mono, 'Consolas', 'Monaco', monospace);
    font-size: 0.875rem;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    white-space: pre-wrap;
    word-wrap: break-word;
    tab-size: 2;
  }

  .editor-textarea::placeholder {
    color: var(--text-tertiary);
    font-style: italic;
  }

  .editor-textarea::-webkit-scrollbar {
    width: 8px;
  }

  .editor-textarea::-webkit-scrollbar-track {
    background: transparent;
  }

  .editor-textarea::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }

  .editor-textarea::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .editor-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .editor-textarea {
      font-size: 1rem; /* Larger font on mobile for better readability */
      min-height: 150px;
    }
  }
</style>
