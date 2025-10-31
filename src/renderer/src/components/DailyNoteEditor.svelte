<script lang="ts">
  import { onMount } from 'svelte';
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
  let showControlsDelayed = $state(true); // Start true so controls show on initial render
  let controlsTimeout: ReturnType<typeof setTimeout> | null = null;

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
  // - Delayed to allow collapse animation to finish
  const showExpandControls = $derived(
    !isFocused && !isManuallyExpanded && showControlsDelayed
  );

  // Cleanup timeout on unmount
  onMount(() => {
    return () => {
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
    };
  });

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

    if (focused) {
      // Hide controls immediately when focusing
      showControlsDelayed = false;
      // Clear any pending timeout
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
        controlsTimeout = null;
      }
    } else {
      // Collapse manual expansion when editor loses focus
      isManuallyExpanded = false;
      // Show controls after collapse animation finishes (500ms)
      if (controlsTimeout) {
        clearTimeout(controlsTimeout);
      }
      controlsTimeout = setTimeout(() => {
        showControlsDelayed = true;
        controlsTimeout = null;
      }, 500);
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

<div class="daily-note-editor-wrapper" class:focused={isFocused || isManuallyExpanded}>
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
    isExpanded={isFocused || isManuallyExpanded}
  />
</div>

<style>
  .daily-note-editor-wrapper {
    position: relative;
    width: 100%;
    border-radius: 0.5rem;
    border: 2px solid transparent;
    /* Smooth transition for border and glow */
    transition:
      border-color 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .daily-note-editor-wrapper.focused {
    /* Bold accent color border */
    border-color: var(--accent-primary);
    /* Glow effect */
    box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
  }
</style>
