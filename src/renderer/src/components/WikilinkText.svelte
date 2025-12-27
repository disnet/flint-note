<script lang="ts" module>
  /**
   * Resolve wikilinks in text to their display text (plain text output)
   * Use this when you need the resolved text without clickable links
   */
  import { getNote } from '../lib/automerge/state.svelte';

  export function resolveWikilinks(input: string): string {
    if (!input.includes('[[') || !input.includes(']]')) {
      return input;
    }

    return input.replace(/\[\[([^\]]+)\]\]/g, (_, linkContent) => {
      const pipeIndex = linkContent.indexOf('|');
      if (pipeIndex !== -1) {
        // Has explicit display text: [[target|display]]
        return linkContent.substring(pipeIndex + 1).trim();
      } else {
        // Look up note title if using ID-only syntax
        const noteId = linkContent.trim();
        const note = getNote(noteId);
        return note?.title || noteId;
      }
    });
  }
</script>

<script lang="ts">
  /**
   * WikilinkText - Renders text with inline clickable wikilinks
   *
   * Parses [[wikilink]] syntax and renders them as clickable links.
   * Used for displaying titles and other short text that may contain wikilinks.
   */
  // getNote is imported from the module script above

  interface Props {
    /** The text to render, may contain [[wikilinks]] */
    text: string;
    /** Callback when a wikilink is clicked */
    onNoteClick?: (noteId: string) => void;
  }

  let { text, onNoteClick }: Props = $props();

  interface TextPart {
    type: 'text' | 'link';
    content: string;
    noteId?: string;
    displayText?: string;
  }

  // Parse wikilinks from text
  function parseWikilinks(input: string): TextPart[] {
    const parts: TextPart[] = [];
    const regex = /\[\[([^\]]+)\]\]/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(input)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: input.slice(lastIndex, match.index) });
      }

      // Parse the link content (may be [[target]] or [[target|display]])
      const linkContent = match[1];
      const pipeIndex = linkContent.indexOf('|');
      let noteId: string;
      let displayText: string;

      if (pipeIndex !== -1) {
        noteId = linkContent.substring(0, pipeIndex).trim();
        displayText = linkContent.substring(pipeIndex + 1).trim();
      } else {
        noteId = linkContent.trim();
        // Look up note title if using ID-only syntax
        const note = getNote(noteId);
        displayText = note?.title || noteId;
      }

      parts.push({
        type: 'link',
        content: displayText,
        noteId,
        displayText
      });
      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < input.length) {
      parts.push({ type: 'text', content: input.slice(lastIndex) });
    }

    return parts.length > 0 ? parts : [{ type: 'text', content: input }];
  }

  // Check if text contains wikilinks
  const hasWikilinks = $derived(text.includes('[[') && text.includes(']]'));

  // Parse wikilinks if present
  const parts = $derived(hasWikilinks ? parseWikilinks(text) : null);

  // Handle link click
  function handleLinkClick(noteId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    onNoteClick?.(noteId);
  }
</script>

{#if parts}
  <span class="wikilink-text">
    {#each parts as part, index (index)}
      {#if part.type === 'link'}
        <button
          class="inline-wikilink"
          onclick={(e) => handleLinkClick(part.noteId!, e)}
          type="button"
          title={part.displayText}
        >
          {part.content}
        </button>
      {:else}
        {part.content}
      {/if}
    {/each}
  </span>
{:else}
  {text}
{/if}

<style>
  .wikilink-text {
    display: inline;
  }

  .inline-wikilink {
    display: inline;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: var(--accent-primary);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-style: dotted;
    text-underline-offset: 2px;
  }

  .inline-wikilink:hover {
    text-decoration-style: solid;
    color: var(--accent-primary-hover, var(--accent-primary));
  }
</style>
