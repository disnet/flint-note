<script lang="ts">
  import { EditorView, keymap, placeholder } from '@codemirror/view';
  import { EditorState, Compartment, type Extension } from '@codemirror/state';
  import { javascript } from '@codemirror/lang-javascript';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { defaultKeymap, indentWithTab } from '@codemirror/commands';
  import {
    bracketMatching,
    indentOnInput,
    syntaxHighlighting,
    defaultHighlightStyle
  } from '@codemirror/language';
  import { searchKeymap } from '@codemirror/search';
  import { autocompletion } from '@codemirror/autocomplete';
  import { lintKeymap } from '@codemirror/lint';
  import { onMount } from 'svelte';

  interface Props {
    value: string;
    placeholder?: string;
    readonly?: boolean;
    height?: string;
    theme?: 'light' | 'dark';
    language?: 'javascript' | 'typescript';
    onUpdate?: (value: string) => void;
  }

  let {
    value = '',
    placeholder: placeholderText = 'Enter code...',
    readonly = false,
    height = '300px',
    theme = 'light',
    language = 'typescript',
    onUpdate
  }: Props = $props();

  // Auto-detect dark mode preference if theme not explicitly set
  let actualTheme = $derived(() => {
    if (theme === 'dark') return 'dark';
    if (theme === 'light') return 'light';

    // Auto-detect from system
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  let editorElement: HTMLDivElement;
  let editorView: EditorView | null = null;

  // Compartments for dynamic reconfiguration
  const themeCompartment = new Compartment();
  const languageCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();

  // Create the editor extensions
  function createExtensions(): Extension[] {
    const extensions = [
      // Language support
      languageCompartment.of(
        language === 'typescript'
          ? javascript({ typescript: true, jsx: false })
          : javascript({ typescript: false, jsx: false })
      ),

      // Theme
      themeCompartment.of(
        actualTheme() === 'dark'
          ? [oneDark, syntaxHighlighting(defaultHighlightStyle)]
          : [syntaxHighlighting(defaultHighlightStyle)]
      ),

      // Read-only state
      readOnlyCompartment.of(EditorView.editable.of(!readonly)),

      // Basic editor features
      EditorView.lineWrapping,
      bracketMatching(),
      indentOnInput(),
      autocompletion(),

      // Placeholder
      placeholder(placeholderText),

      // Keymaps
      keymap.of([...defaultKeymap, ...searchKeymap, ...lintKeymap, indentWithTab]),

      // Update listener
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onUpdate) {
          const newValue = update.state.doc.toString();
          if (newValue !== value) {
            onUpdate(newValue);
          }
        }
      }),

      // Styling
      EditorView.theme({
        '&': {
          fontSize: '14px',
          fontFamily:
            '"SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          height: height
        },
        '.cm-content': {
          padding: '12px',
          minHeight: height
        },
        '.cm-focused': {
          outline: '2px solid var(--accent)',
          outlineOffset: '2px'
        },
        '.cm-editor': {
          borderRadius: '6px',
          border: '1px solid var(--border-light)',
          backgroundColor: 'var(--bg-primary)'
        },
        '.cm-scroller': {
          fontSize: 'inherit',
          fontFamily: 'inherit'
        },
        '.cm-line': {
          lineHeight: '1.5'
        }
      })
    ];

    return extensions;
  }

  // Initialize the editor
  onMount(() => {
    if (!editorElement) return;

    const state = EditorState.create({
      doc: value,
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
    };
  });

  // Update editor content when value prop changes
  $effect(() => {
    if (editorView && editorView.state.doc.toString() !== value) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: value
        }
      });
    }
  });

  // Update theme when theme prop changes or system theme changes
  $effect(() => {
    if (editorView) {
      editorView.dispatch({
        effects: themeCompartment.reconfigure(
          actualTheme() === 'dark'
            ? [oneDark, syntaxHighlighting(defaultHighlightStyle)]
            : [syntaxHighlighting(defaultHighlightStyle)]
        )
      });
    }
  });

  // Update language when language prop changes
  $effect(() => {
    if (editorView) {
      editorView.dispatch({
        effects: languageCompartment.reconfigure(
          language === 'typescript'
            ? javascript({ typescript: true, jsx: false })
            : javascript({ typescript: false, jsx: false })
        )
      });
    }
  });

  // Update readonly state when readonly prop changes
  $effect(() => {
    if (editorView) {
      editorView.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorView.editable.of(!readonly))
      });
    }
  });

  // Public methods
  export function focus(): void {
    if (editorView) {
      editorView.focus();
    }
  }

  export function getSelection(): string {
    if (editorView) {
      const { from, to } = editorView.state.selection.main;
      return editorView.state.doc.sliceString(from, to);
    }
    return '';
  }

  export function insertText(text: string): void {
    if (editorView && !readonly) {
      const { from, to } = editorView.state.selection.main;
      editorView.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length }
      });
    }
  }
</script>

<div class="code-editor-wrapper">
  <div bind:this={editorElement} class="code-editor"></div>
</div>

<style>
  .code-editor-wrapper {
    position: relative;
    width: 100%;
  }

  .code-editor {
    width: 100%;
  }

  /* Override CodeMirror theme for light mode */
  :global(.cm-editor:not(.cm-focused)) {
    border-color: var(--border-light);
  }

  :global(.cm-editor.cm-focused) {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent);
  }

  /* Light theme overrides */
  :global(.cm-editor .cm-content) {
    color: var(--text-primary);
  }

  :global(.cm-editor .cm-cursor) {
    border-color: var(--text-primary);
  }

  :global(.cm-editor .cm-selectionBackground) {
    background: color-mix(in srgb, var(--accent) 30%, transparent);
  }

  :global(.cm-editor .cm-activeLine) {
    background: var(--bg-secondary);
  }

  :global(.cm-editor .cm-gutters) {
    background: var(--bg-secondary);
    border-color: var(--border-light);
  }

  :global(.cm-editor .cm-lineNumbers .cm-gutterElement) {
    color: var(--text-secondary);
  }

  /* Syntax highlighting for light theme */
  :global(.cm-editor .tok-keyword) {
    color: #d73a49;
    font-weight: bold;
  }

  :global(.cm-editor .tok-string) {
    color: #032f62;
  }

  :global(.cm-editor .tok-comment) {
    color: #6a737d;
    font-style: italic;
  }

  :global(.cm-editor .tok-number) {
    color: #005cc5;
  }

  :global(.cm-editor .tok-operator) {
    color: #d73a49;
  }

  :global(.cm-editor .tok-variableName) {
    color: #24292e;
  }

  :global(.cm-editor .tok-function) {
    color: #6f42c1;
  }

  :global(.cm-editor .tok-typeName) {
    color: #005cc5;
  }

  /* Dark theme adjustments when using oneDark */
  :global(.cm-theme-dark .cm-editor) {
    background: var(--bg-primary);
    color: var(--text-primary);
  }
</style>
