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

  let { dailyNote, content: initialContent, date, onContentChange }: Props = $props();

  let editorElement: HTMLDivElement;
  let editorView: EditorView | null = null;
  let content = $state(initialContent || '');

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
      minHeight: '200px',
      padding: '1rem',
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
    return [
      minimalSetup,
      markdown(),
      wikilinksExtension(handleWikilinkClick),
      markdownListStyling,
      listStylingTheme,
      dailyNoteTheme,

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
    } else if (!initialContent && content === '' && !dailyNote) {
      // Initialize with appropriate daily note template
      const dayOfWeek = new Date(date).getDay();
      const templates = [
        "# Daily Reflection\n\n## What I accomplished today\n- \n\n## What I learned\n- \n\n## Tomorrow's priorities\n- ",
        "# Monday Planning\n\n## Week goals\n- \n\n## Today's tasks\n- [ ] \n- [ ] \n\n## Notes\n",
        '# Tuesday Progress\n\n## Completed\n- \n\n## In progress\n- \n\n## Blockers\n- ',
        '# Wednesday Check-in\n\n## Key accomplishments\n- \n\n## Challenges faced\n- \n\n## Adjustments needed\n- ',
        '# Thursday Review\n\n## Project updates\n- \n\n## Meetings & insights\n- \n\n## Action items\n- ',
        '# Friday Wrap-up\n\n## Week summary\n- \n\n## What went well\n- \n\n## Areas for improvement\n- \n\n## Next week planning\n- ',
        '# Weekend Planning\n\n## Personal projects\n- \n\n## Learning goals\n- \n\n## Reflection\n- '
      ];

      const templateContent = templates[dayOfWeek] || templates[0];
      content = templateContent;

      if (editorView) {
        editorView.dispatch({
          changes: {
            from: 0,
            to: editorView.state.doc.length,
            insert: templateContent
          }
        });
      }
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
  <div class="editor-header">
    <label for="daily-note-{date}" class="editor-label"> Daily Note </label>
    <span class="editor-hint"> Auto-saves as you type </span>
  </div>

  <div class="editor-container">
    <div bind:this={editorElement} class="codemirror-editor"></div>
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
    overflow: hidden;
  }

  .editor-container:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
  }

  .codemirror-editor {
    width: 100%;
    min-height: 200px;
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
    .editor-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .codemirror-editor {
      min-height: 150px;
    }

    .daily-note-editor :global(.cm-editor) {
      font-size: 1rem !important; /* Larger font on mobile for better readability */
    }
  }
</style>
