<script lang="ts">
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte';

  interface Props {
    content: string;
    onContentChange?: (content: string) => void;
  }

  let { content, onContentChange }: Props = $props();

  let editorRef: CodeMirrorEditor;
  let isFocused = $state(false);
  let isManuallyExpanded = $state(false);

  // Calculate max height based on focus and expansion state
  // 5 lines when unfocused and not expanded: ~120px (24px per line)
  // Large height when focused or manually expanded - effectively no limit but allows CSS transitions
  const maxHeight = $derived.by(() => {
    if (isFocused || isManuallyExpanded) {
      return '10000px'; // Very large height for smooth transition
    }
    return '240px'; // 5 lines default
  });

  // Show expand button and fade gradient when:
  // - Not focused AND not manually expanded AND has content
  const showExpandControls = $derived(!isFocused && !isManuallyExpanded);

  // Wikilink click handler - use centralized wikilink service
  const handleWikilinkClick = async (
    noteId: string,
    title: string,
    shouldCreate?: boolean,
    shiftKey?: boolean
  ): Promise<void> => {
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate, shiftKey);
  };

  function handleFocusChange(focused: boolean): void {
    isFocused = focused;
    // Collapse manual expansion when editor loses focus
    if (!focused) {
      isManuallyExpanded = false;
    }
  }

  function toggleExpansion(): void {
    isManuallyExpanded = !isManuallyExpanded;
    if (isManuallyExpanded && editorRef) {
      // Focus the editor when expanding
      editorRef.focus();
    }
  }

  // Public methods for external control
  export function focus(): void {
    editorRef?.focus();
  }

  export function getContent(): string {
    return editorRef?.getContent() || '';
  }

  export function setContent(newContent: string): void {
    editorRef?.setContent(newContent);
  }
</script>

<div class="daily-note-editor-wrapper">
  <CodeMirrorEditor
    bind:this={editorRef}
    {content}
    {onContentChange}
    onWikilinkClick={handleWikilinkClick}
    onFocusChange={handleFocusChange}
    placeholder="Start typing to create entry..."
    variant="daily-note"
    {maxHeight}
    {showExpandControls}
    {toggleExpansion}
    readOnly={!isFocused && !isManuallyExpanded}
  />
</div>

<style>
  .daily-note-editor-wrapper {
    position: relative;
    width: 100%;
  }
</style>
