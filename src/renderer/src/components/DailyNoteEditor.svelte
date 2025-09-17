<script lang="ts">
  import CodeMirrorEditor from './CodeMirrorEditor.svelte';
  import { wikilinkService } from '../services/wikilinkService.svelte';

  interface Props {
    content: string;
    onContentChange?: (content: string) => void;
  }

  let { content, onContentChange }: Props = $props();

  let editorRef: CodeMirrorEditor;

  // Wikilink click handler - use centralized wikilink service
  const handleWikilinkClick = async (
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): Promise<void> => {
    await wikilinkService.handleWikilinkClick(noteId, title, shouldCreate);
  };

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

<CodeMirrorEditor
  bind:this={editorRef}
  {content}
  {onContentChange}
  onWikilinkClick={handleWikilinkClick}
  placeholder="Start typing to create entry..."
  variant="daily-note"
/>
