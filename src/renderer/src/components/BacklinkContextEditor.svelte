<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorView } from 'codemirror';
  import { EditorState } from '@codemirror/state';
  import { EditorConfig } from '../stores/editorConfig.svelte.js';
  import { getChatService } from '../services/chatService.js';

  interface Props {
    sourceNoteId: string;
    lineNumber: number;
    initialContent: string;
    onNavigate: () => void;
    onWikilinkClick?: (
      noteId: string,
      title: string,
      shouldCreate?: boolean
    ) => Promise<void>;
  }

  let { sourceNoteId, lineNumber, initialContent, onNavigate, onWikilinkClick }: Props =
    $props();

  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;
  let currentContent = $state(initialContent);
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  const editorConfig = new EditorConfig({
    onWikilinkClick,
    onContentChange: handleContentChange,
    variant: 'backlink-context',
    onEnterKey: handleEnterKey
  });

  onMount(() => {
    editorConfig.initializeTheme();

    return () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      editorConfig.destroy();
    };
  });

  $effect(() => {
    if (editorContainer && !editorView) {
      createEditor();
    }
  });

  $effect(() => {
    // Only update editor content when initialContent changes from parent
    if (editorView) {
      updateEditorContent();
    }
  });

  function createEditor(): void {
    if (!editorContainer || editorView) return;

    const startState = EditorState.create({
      doc: initialContent,
      extensions: editorConfig.getExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });
  }

  function updateEditorContent(): void {
    if (!editorView) return;

    const currentDoc = editorView.state.doc.toString();
    if (currentDoc !== initialContent) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: initialContent
        }
      });
      currentContent = initialContent;
    }
  }

  function handleContentChange(content: string): void {
    currentContent = content;
    debouncedSave();
  }

  function handleEnterKey(): void {
    // Navigate to source note when Enter is pressed
    onNavigate();
  }

  function debouncedSave(): void {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveContent();
    }, 1000);
  }

  async function saveContent(): Promise<void> {
    if (currentContent === initialContent) return;

    try {
      const noteService = getChatService();
      if (!(await noteService.isReady())) return;

      // Fetch the full note content
      const note = await noteService.getNote({ identifier: sourceNoteId });
      if (!note?.content) return;

      // Replace the specific line
      const lines = note.content.split('\n');
      if (lineNumber > 0 && lineNumber <= lines.length) {
        lines[lineNumber - 1] = currentContent;
        const updatedContent = lines.join('\n');

        // Save the updated content
        await noteService.updateNote({
          identifier: sourceNoteId,
          content: updatedContent
        });
      }
    } catch (err) {
      console.error('Error saving backlink context:', err);
    }
  }

  async function handleBlur(): Promise<void> {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    await saveContent();
  }
</script>

<div
  class="backlink-context-editor"
  bind:this={editorContainer}
  onblur={handleBlur}
  role="textbox"
  tabindex="0"
></div>

<style>
  .backlink-context-editor {
    width: 100%;
    min-height: 1.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    padding-left: 1.25rem;
  }

  .backlink-context-editor :global(.cm-editor) {
    background: transparent;
  }

  .backlink-context-editor :global(.cm-content) {
    padding: 0;
    min-height: 1.5rem;
  }

  .backlink-context-editor :global(.cm-line) {
    padding: 0;
  }

  .backlink-context-editor :global(.cm-scroller) {
    overflow: hidden;
  }
</style>
