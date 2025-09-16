<script lang="ts">
  import { EditorView, minimalSetup } from 'codemirror';
  import { EditorState, Compartment, type Extension } from '@codemirror/state';
  import { markdown } from '@codemirror/lang-markdown';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    wikilinksExtension,
    type WikilinkClickHandler
  } from '../lib/wikilinks.svelte.js';
  import { dropCursor, keymap } from '@codemirror/view';
  import { indentOnInput } from '@codemirror/language';
  import {
    defaultKeymap,
    history,
    historyKeymap,
    indentWithTab
  } from '@codemirror/commands';
  import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
  import { markdownListStyling, listStylingTheme } from '../lib/markdownListStyling';
  import { onMount } from 'svelte';
  import type { DailyNote } from '../stores/dailyViewStore.svelte';

  interface Props {
    dailyNote: DailyNote | null;
    content: string;
    date: string;
    onContentChange?: (content: string) => void;
  }

  let { dailyNote, content: initialContent, onContentChange }: Props = $props();

  let editorElement: HTMLDivElement;
  let editorView: EditorView | null = null;
  let content = $state(initialContent || '');
  let showPlaceholder = $derived(!dailyNote && !content.trim());

  // Compartments for dynamic reconfiguration
  const themeCompartment = new Compartment();

  // Debounced content change handler
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Wikilink click handler - for now just log, can be enhanced later
  const handleWikilinkClick: WikilinkClickHandler = (
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): void => {
    console.log('Daily note wikilink clicked:', { noteId, title, shouldCreate });
    // Could integrate with navigation here in the future
  };

  function debounceContentChange(newContent: string): void {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    debounceTimeout = setTimeout(() => {
      onContentChange?.(newContent);
    }, 500); // 500ms debounce
  }

  // Auto-detect dark mode preference
  let isDarkMode = $derived.by(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  // Placeholder extension for empty daily notes
  const placeholderExtension = EditorView.theme({
    '.cm-placeholder': {
      color: 'var(--text-secondary)',
      fontStyle: 'italic',
      opacity: '0.7'
    }
  });

  // Create theme extension for daily note editor styling
  const dailyNoteTheme = EditorView.theme({
    '&': {
      height: '100%',
      fontFamily:
        "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace",
      fontSize: '0.875rem',
      lineHeight: '1.6',
      width: '100%'
    },
    '&.cm-editor': {
      backgroundColor: 'var(--bg-primary)',
      border: 'none',
      borderRadius: '0.375rem'
    },
    '.cm-scroller': {
      width: '100%',
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(0, 0, 0, 0.2) transparent',
      minHeight: '100px',
      padding: '0.25rem',
      fontFamily: 'inherit'
    },
    '&.cm-focused': {
      outline: 'none',
      boxShadow: 'none !important'
    },
    '.cm-content': {
      fontFamily: 'inherit',
      padding: '0'
    },
    '.cm-line': {
      lineHeight: '1.6'
    }
  });

  // Create editor extensions
  function createExtensions(): Extension[] {
    const extensions = [
      minimalSetup,
      markdown(),
      wikilinksExtension(handleWikilinkClick),
      markdownListStyling,
      listStylingTheme,
      dailyNoteTheme,
      placeholderExtension,

      // Theme compartment
      themeCompartment.of(isDarkMode ? githubDark : githubLight),

      // Editor features
      history(),
      dropCursor(),
      indentOnInput(),
      highlightSelectionMatches(),

      // Keymaps
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),

      // Update listener with debouncing
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newContent = update.state.doc.toString();
          content = newContent;
          debounceContentChange(newContent);
        }
      })
    ];

    // Add placeholder if no daily note exists
    if (showPlaceholder) {
      extensions.push(
        EditorView.theme({
          '.cm-content': {
            '&::before': {
              content: '"Start typing to create entry..."',
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              opacity: '0.7',
              position: 'absolute',
              pointerEvents: 'none'
            }
          }
        })
      );
    }

    return extensions;
  }

  // Initialize the editor
  onMount(() => {
    if (!editorElement) return;

    const state = EditorState.create({
      doc: content,
      extensions: createExtensions()
    });

    editorView = new EditorView({
      state,
      parent: editorElement
    });

    return () => {
      if (editorView) {
        editorView.destroy();
        editorView = null;
      }
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  });

  // Update editor content when initialContent changes
  $effect(() => {
    if (initialContent && editorView) {
      const currentDoc = editorView.state.doc.toString();
      if (currentDoc !== initialContent) {
        content = initialContent;
        editorView.dispatch({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: initialContent
          }
        });
      }
    }
    // Remove template initialization - start with blank content
  });

  // Reconfigure editor when placeholder state changes
  $effect(() => {
    if (editorView) {
      // Recreate the editor view with new extensions when placeholder state changes
      const currentContent = editorView.state.doc.toString();
      editorView.destroy();

      const state = EditorState.create({
        doc: currentContent,
        extensions: createExtensions()
      });

      editorView = new EditorView({
        state,
        parent: editorElement
      });
    }
  });

  // Update theme when system theme changes
  $effect(() => {
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(isDarkMode ? githubDark : githubLight)
      });
    }
  });

  // Public methods for external control
  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }

  export function getContent(): string {
    return content;
  }

  export function setContent(newContent: string): void {
    content = newContent;
    if (editorView) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: newContent
        }
      });
    }
  }
</script>

<div class="daily-note-editor">
  <div 
    class="editor-container" 
    class:has-placeholder={showPlaceholder}
    onclick={() => editorView?.focus()}
    onkeydown={(e) => {
      // Only handle key events when placeholder is shown and not coming from CodeMirror
      if (showPlaceholder && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        editorView?.focus();
      }
    }}
    role={showPlaceholder ? "button" : undefined}
    tabindex={showPlaceholder ? 0 : -1}
    aria-label={showPlaceholder ? "Click to start typing in daily note" : undefined}
  >
    {#if showPlaceholder}
      <div class="placeholder-text">
        Start typing to create entry...
      </div>
    {/if}
    <div bind:this={editorElement} class="codemirror-editor"></div>
  </div>
</div>

<style>
  .daily-note-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .editor-container {
    position: relative;
    background: var(--bg-primary);
    transition: border-color 0.2s ease;
    overflow: hidden;
    min-height: 100px;
    cursor: text;
  }


  .editor-container.has-placeholder {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    padding: 0.25rem;
  }

  .placeholder-text {
    color: var(--text-secondary);
    font-style: italic;
    opacity: 0.7;
    font-family:
      'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    line-height: 1.6;
    pointer-events: none;
    user-select: none;
  }

  .editor-container.has-placeholder .codemirror-editor {
    position: relative;
    z-index: 1;
  }

  .editor-container.has-placeholder .codemirror-editor :global(.cm-content) {
    color: transparent;
  }

  .editor-container.has-placeholder .codemirror-editor :global(.cm-cursor) {
    border-color: var(--text-primary) !important;
    opacity: 1 !important;
  }

  .placeholder-text {
    position: absolute;
    top: 0.25rem;
    left: 0.25rem;
    z-index: 0;
    pointer-events: none;
    user-select: none;
  }

  .codemirror-editor {
    width: 100%;
    min-height: 100px;
  }

  /* Override CodeMirror styles for daily note editor */
  .daily-note-editor :global(.cm-editor) {
    background: transparent !important;
    border: none !important;
    border-radius: 0 !important;
  }

  .daily-note-editor :global(.cm-focused) {
    outline: none !important;
    box-shadow: none !important;
  }

  .daily-note-editor :global(.cm-scroller) {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) transparent;
  }

  .daily-note-editor :global(.cm-scroller::-webkit-scrollbar) {
    width: 8px;
  }

  .daily-note-editor :global(.cm-scroller::-webkit-scrollbar-track) {
    background: transparent;
  }

  .daily-note-editor :global(.cm-scroller::-webkit-scrollbar-thumb) {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }

  .daily-note-editor :global(.cm-scroller::-webkit-scrollbar-thumb:hover) {
    background: var(--scrollbar-thumb-hover);
  }

  /* Ensure proper text coloring based on theme */
  .daily-note-editor :global(.cm-content) {
    color: var(--text-primary);
  }

  .daily-note-editor :global(.cm-cursor) {
    border-color: var(--text-primary);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .codemirror-editor {
      min-height: 150px;
    }

    .daily-note-editor :global(.cm-editor) {
      font-size: 1rem !important; /* Larger font on mobile for better readability */
    }
  }
</style>
