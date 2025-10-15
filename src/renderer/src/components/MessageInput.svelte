<script lang="ts">
  import ModelSelector from './ModelSelector.svelte';
  import ContextUsageWidget from './ContextUsageWidget.svelte';
  import SlashCommandAutocomplete from './SlashCommandAutocomplete.svelte';
  type SlashCommandAutocompleteType = SlashCommandAutocomplete;
  import type { ContextUsage } from '../services/types';
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, WidgetType, Decoration } from '@codemirror/view';
  import {
    EditorState,
    StateEffect,
    StateField,
    RangeSet,
    Range,
    type Extension
  } from '@codemirror/state';
  import { githubLight } from '@fsegurai/codemirror-theme-github-light';
  import { githubDark } from '@fsegurai/codemirror-theme-github-dark';
  import {
    keymap,
    placeholder,
    highlightSpecialChars,
    drawSelection,
    rectangularSelection,
    crosshairCursor
  } from '@codemirror/view';
  import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { wikilinksExtension } from '../lib/wikilinks.svelte.js';
  import { wikilinkService } from '../services/wikilinkService.svelte.js';
  import {
    slashCommandsStore,
    type SlashCommand
  } from '../stores/slashCommandsStore.svelte';

  interface Props {
    onSend: (text: string) => void;
    contextUsage?: ContextUsage | null;
    onStartNewThread?: () => void;
    isLoading?: boolean;
    onCancel?: () => void;
  }

  let {
    onSend,
    contextUsage = null,
    onStartNewThread,
    isLoading = false,
    onCancel
  }: Props = $props();

  let inputText = $state('');
  let autocompleteComponent = $state<SlashCommandAutocompleteType | null>(null);

  // Slash command widget for atomic display
  class SlashCommandWidget extends WidgetType {
    commandName: string;
    isEditing: boolean;

    constructor(commandName: string, isEditing: boolean = false) {
      super();
      this.commandName = commandName;
      this.isEditing = isEditing;
    }

    toDOM(): HTMLElement {
      const chip = document.createElement('span');
      chip.className = 'slash-command-chip';
      if (this.isEditing) {
        chip.classList.add('editing');
      }
      chip.textContent = `/${this.commandName}`;

      // Make chip clickable to toggle editing
      chip.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleChipEditing(chip);
      };

      return chip;
    }

    eq(other: SlashCommandWidget): boolean {
      return this.commandName === other.commandName && this.isEditing === other.isEditing;
    }
  }

  // State effect for adding slash command decorations
  const addSlashCommandEffect = StateEffect.define<{
    from: number;
    to: number;
    commandName: string;
  }>();

  // State effect for removing slash command decorations
  const removeSlashCommandEffect = StateEffect.define<{
    from: number;
    to: number;
  }>();

  // State field to manage slash command decorations
  const slashCommandField = StateField.define({
    create() {
      return Decoration.none;
    },
    update(decorations, transaction) {
      // Map existing decorations through document changes
      decorations = decorations.map(transaction.changes);

      // Process effects
      for (const effect of transaction.effects) {
        if (effect.is(addSlashCommandEffect)) {
          const { from, to, commandName } = effect.value;
          const widget = new SlashCommandWidget(commandName);
          const decoration = Decoration.replace({
            widget,
            inclusive: false,
            block: false
          });
          decorations = decorations.update({
            add: [decoration.range(from, to)]
          });
        } else if (effect.is(removeSlashCommandEffect)) {
          const { from, to } = effect.value;
          decorations = decorations.update({
            filter: (rangeFrom, rangeTo) => {
              return !(rangeFrom <= from && rangeTo >= to);
            }
          });
        }
      }

      return decorations;
    },
    provide: (field) => EditorView.decorations.from(field)
  });

  function toggleChipEditing(chipElement: HTMLElement): void {
    if (!editorView) return;

    // Find the decoration range for this chip
    const pos = editorView.posAtDOM(chipElement);
    const decorations = editorView.state.field(slashCommandField);

    // Find the decoration range that contains this position
    let rangeStart = pos;
    let rangeEnd = pos + 1;

    decorations.between(pos - 50, pos + 50, (from, to, value) => {
      if (from <= pos && to > pos && value.spec.widget instanceof SlashCommandWidget) {
        rangeStart = from;
        rangeEnd = to;
        return false; // Stop iteration
      }
      return; // Continue iteration by returning void (undefined)
    });

    // Remove the decoration temporarily to show full text
    editorView.dispatch({
      effects: removeSlashCommandEffect.of({ from: rangeStart, to: rangeEnd })
    });

    // Focus the editor at this position
    editorView.focus();
    editorView.dispatch({
      selection: { anchor: rangeStart }
    });
  }
  let editorContainer: HTMLDivElement;
  let editorView: EditorView | null = null;

  // Reactive theme state
  let isDarkMode = $state(false);
  let mediaQuery: MediaQueryList | null = null;

  // Slash command autocomplete state
  let showAutocomplete = $state(false);
  let autocompleteQuery = $state('');
  let selectedCommandIndex = $state(0);
  let slashCommandStart = $state(0);
  let isInParameterMode = $state(false);

  function handleSubmit(): void {
    const text = inputText.trim();
    if (text) {
      onSend(text);
      inputText = '';
      // Clear the editor content
      if (editorView) {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: '' }
        });
      }
    }
  }

  function handleWikilinkClick(
    noteId: string,
    title: string,
    shouldCreate?: boolean
  ): void {
    // For message input, use stub implementation that doesn't navigate
    wikilinkService.handleWikilinkClickStub(noteId, title, shouldCreate);
    // Keep focus on the editor
    editorView?.focus();
  }

  function detectSlashCommand(text: string, cursorPos: number): void {
    // Don't detect slash commands if we're in parameter input mode
    if (isInParameterMode) {
      return;
    }

    // Find the last slash before the cursor
    const beforeCursor = text.substring(0, cursorPos);
    const lastSlashIndex = beforeCursor.lastIndexOf('/');

    if (lastSlashIndex === -1) {
      hideAutocomplete();
      return;
    }

    // Check if there's a word boundary before the slash (start of line or whitespace)
    const charBeforeSlash = lastSlashIndex > 0 ? beforeCursor[lastSlashIndex - 1] : null;
    if (charBeforeSlash !== null && charBeforeSlash !== ' ' && charBeforeSlash !== '\n') {
      hideAutocomplete();
      return;
    }

    // Get text after slash up to cursor
    const afterSlash = beforeCursor.substring(lastSlashIndex + 1);

    // Check if there are any spaces after the slash (which would end the command)
    if (afterSlash.includes(' ') || afterSlash.includes('\n')) {
      hideAutocomplete();
      return;
    }

    // Show autocomplete with the query
    slashCommandStart = lastSlashIndex;
    autocompleteQuery = afterSlash;
    showAutocomplete = true;
    selectedCommandIndex = 0;
  }

  function hideAutocomplete(): void {
    showAutocomplete = false;
    autocompleteQuery = '';
    selectedCommandIndex = 0;
    slashCommandStart = 0;
    isInParameterMode = false;
  }

  function handleParameterModeEnter(command: SlashCommand): void {
    if (!editorView) return;

    const cursorPos = editorView.state.selection.main.head;
    const text = editorView.state.doc.toString();

    // Replace /command with chip immediately when entering parameter mode
    const beforeSlash = text.substring(0, slashCommandStart);
    const afterCursor = text.substring(cursorPos);
    const chipText = command.instruction; // Use full instruction initially
    const newText = beforeSlash + chipText + afterCursor;

    const chipStart = beforeSlash.length;
    const chipEnd = beforeSlash.length + chipText.length;

    // Enter parameter mode to prevent slash command detection from hiding autocomplete
    isInParameterMode = true;

    editorView.dispatch({
      changes: { from: 0, to: text.length, insert: newText },
      selection: { anchor: chipEnd },
      effects: [
        addSlashCommandEffect.of({
          from: chipStart,
          to: chipEnd,
          commandName: command.name
        })
      ]
    });

    // Keep autocomplete open - it will show parameter input interface
  }

  function handleCommandSelect(
    command: SlashCommand,
    parameterValues?: Record<string, string>
  ): void {
    if (!editorView) return;

    // If this is a parameterized command completion, update the existing chip
    if (parameterValues) {
      const text = editorView.state.doc.toString();
      const instructionText = slashCommandsStore.expandCommandWithParameters(
        command,
        parameterValues
      );

      // Find and replace the chip content with expanded instruction
      const decorations = editorView.state.field(slashCommandField);
      let chipStart = 0;
      let chipEnd = text.length;

      // Find the current chip range
      decorations.between(0, text.length, (from, to, value) => {
        if (value.spec.widget instanceof SlashCommandWidget) {
          chipStart = from;
          chipEnd = to;
          return false; // Stop iteration
        }
        return; // Continue iteration by returning void (undefined)
      });

      // Create chip name that includes parameter info
      let chipName = command.name;
      const filledParams = Object.entries(parameterValues)
        .filter(([_, value]) => value && value.trim())
        .map(
          ([key, value]) =>
            `${key}: ${value.length > 10 ? value.substring(0, 10) + '...' : value}`
        )
        .join(', ');
      if (filledParams) {
        chipName += ` (${filledParams})`;
      }

      // Replace chip content with expanded instruction and update chip name
      const beforeChip = text.substring(0, chipStart);
      const afterChip = text.substring(chipEnd);
      const newText = beforeChip + instructionText + afterChip;

      const newChipEnd = chipStart + instructionText.length;

      editorView.dispatch({
        changes: { from: 0, to: text.length, insert: newText },
        selection: { anchor: newChipEnd },
        effects: [
          removeSlashCommandEffect.of({ from: chipStart, to: chipEnd }),
          addSlashCommandEffect.of({
            from: chipStart,
            to: newChipEnd,
            commandName: chipName
          })
        ]
      });
    } else {
      // Non-parameterized command - handle as before
      const cursorPos = editorView.state.selection.main.head;
      const text = editorView.state.doc.toString();
      const instructionText = command.instruction;

      const beforeSlash = text.substring(0, slashCommandStart);
      const afterCursor = text.substring(cursorPos);
      const newText = beforeSlash + instructionText + afterCursor;

      const instructionStart = beforeSlash.length;
      const instructionEnd = beforeSlash.length + instructionText.length;

      editorView.dispatch({
        changes: { from: 0, to: text.length, insert: newText },
        selection: { anchor: instructionEnd },
        effects: [
          addSlashCommandEffect.of({
            from: instructionStart,
            to: instructionEnd,
            commandName: command.name
          })
        ]
      });
    }

    // Hide autocomplete when:
    // 1. We're completing a parameterized command (parameterValues provided)
    // 2. The command has no parameters (immediate completion)
    if (parameterValues || !command.parameters || command.parameters.length === 0) {
      hideAutocomplete();
    }

    editorView.focus();
  }

  function handleAutocompleteCancel(): void {
    hideAutocomplete();
    editorView?.focus();
  }

  function handleAutocompleteKeyDown(event: KeyboardEvent): boolean {
    if (!showAutocomplete) return false;

    // If we're in parameter mode, don't handle keys here - let the autocomplete component handle them
    if (isInParameterMode) return false;

    const filteredCommands = autocompleteQuery
      ? slashCommandsStore.searchCommands(autocompleteQuery)
      : slashCommandsStore.allCommands.slice(0, 5);

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        selectedCommandIndex =
          selectedCommandIndex > 0
            ? selectedCommandIndex - 1
            : filteredCommands.length - 1;
        return true;

      case 'ArrowDown':
        event.preventDefault();
        selectedCommandIndex =
          selectedCommandIndex < filteredCommands.length - 1
            ? selectedCommandIndex + 1
            : 0;
        return true;

      case 'Enter':
      case 'Tab':
        event.preventDefault();
        if (autocompleteComponent && autocompleteComponent.handleKeyboardSelect) {
          autocompleteComponent.handleKeyboardSelect();
        } else {
          // Fallback to original behavior
          const filteredCommands = autocompleteQuery
            ? slashCommandsStore.searchCommands(autocompleteQuery)
            : slashCommandsStore.allCommands.slice(0, 5);
          if (filteredCommands[selectedCommandIndex]) {
            handleCommandSelect(filteredCommands[selectedCommandIndex]);
          }
        }
        return true;

      case 'Escape':
        event.preventDefault();
        hideAutocomplete();
        return true;

      default:
        return false;
    }
  }

  function handleThemeChange(e: MediaQueryListEvent): void {
    isDarkMode = e.matches;
    updateEditorTheme();
  }

  function createExtensions(): Extension {
    const githubTheme = isDarkMode ? githubDark : githubLight;

    return [
      // Put the custom keymap FIRST to ensure it takes precedence over default keymaps
      keymap.of([
        {
          key: 'Enter',
          run: (view) => {
            // Check if autocomplete is showing and should handle this
            if (showAutocomplete) {
              return handleAutocompleteKeyDown(
                new KeyboardEvent('keydown', { key: 'Enter' })
              );
            }

            const text = view.state.doc.toString().trim();
            if (text) {
              handleSubmit();
              return true;
            }
            return false;
          }
        },
        {
          key: 'Shift-Enter',
          run: (view) => {
            // Allow line breaks with Shift+Enter
            view.dispatch(view.state.replaceSelection('\n'));
            return true;
          }
        },
        {
          key: 'Escape',
          run: (_view) => {
            if (showAutocomplete) {
              hideAutocomplete();
              return true;
            }
            return false;
          }
        },
        {
          key: 'ArrowUp',
          run: (_view) => {
            return handleAutocompleteKeyDown(
              new KeyboardEvent('keydown', { key: 'ArrowUp' })
            );
          }
        },
        {
          key: 'ArrowDown',
          run: (_view) => {
            return handleAutocompleteKeyDown(
              new KeyboardEvent('keydown', { key: 'ArrowDown' })
            );
          }
        },
        {
          key: 'Tab',
          run: (_view) => {
            return handleAutocompleteKeyDown(
              new KeyboardEvent('keydown', { key: 'Tab' })
            );
          }
        }
      ]),
      // Essential editor features
      highlightSpecialChars(),
      history(),
      drawSelection(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSelectionMatches(),
      // Now add default keymaps AFTER our custom ones
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      placeholder('Ask Flint anything...use [[ to link notes'),
      // GitHub theme
      githubTheme,
      // Custom styling theme
      EditorView.theme({
        '&': {
          fontSize: '0.875rem',
          fontFamily: 'inherit'
        },
        '&.cm-editor': {
          backgroundColor: 'var(--bg-primary)'
        },
        '.cm-editor': {
          borderRadius: '1rem',
          background: 'transparent'
        },
        '.cm-focused': {
          outline: 'none'
        },
        '.cm-content': {
          padding: '6px 0',
          minHeight: '1.25rem',
          maxHeight: '120px',
          caretColor: 'var(--text-secondary)',
          fontFamily:
            "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
        },
        '.cm-tooltip': {
          fontFamily:
            "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
        },
        '.cm-tooltip-autocomplete': {
          fontFamily:
            "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
        },
        '.cm-completionLabel': {
          fontFamily:
            "'iA Writer Quattro', 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace !important"
        },
        '.cm-line': {
          lineHeight: '1.4'
        }
      }),
      wikilinksExtension(handleWikilinkClick),
      slashCommandField,
      // Add atomic ranges for proper cursor movement over slash commands
      EditorView.atomicRanges.of((view) => {
        const decorations = view.state.field(slashCommandField, false);
        if (!decorations) {
          return RangeSet.empty;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ranges: Range<any>[] = [];

        try {
          decorations.between(0, view.state.doc.length, (from, to, value) => {
            if (value.spec.widget instanceof SlashCommandWidget) {
              ranges.push({ from, to, value: true });
            }
          });

          // Sort ranges by position before creating RangeSet
          ranges.sort((a, b) => a.from - b.from);

          return ranges.length > 0 ? RangeSet.of(ranges) : RangeSet.empty;
        } catch (e) {
          console.warn('Error creating slash command atomic ranges:', e);
          return RangeSet.empty;
        }
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged || update.selectionSet) {
          const newText = update.state.doc.toString();
          inputText = newText;

          // Detect slash commands on text change or cursor movement
          const cursorPos = update.state.selection.main.head;
          detectSlashCommand(newText, cursorPos);
        }
      }),
      EditorView.lineWrapping
    ];
  }

  function updateEditorTheme(): void {
    if (!editorView) return;

    editorView.dispatch({
      effects: StateEffect.reconfigure.of(createExtensions())
    });
  }

  onMount(() => {
    if (!editorContainer) return;

    // Initialize dark mode state
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    isDarkMode = mediaQuery.matches;

    // Listen for theme changes
    mediaQuery.addEventListener('change', handleThemeChange);

    const startState = EditorState.create({
      doc: '',
      extensions: createExtensions()
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainer
    });

    // Focus the editor
    editorView.focus();

    return () => {
      editorView?.destroy();
    };
  });

  // Cleanup function
  onDestroy(() => {
    if (mediaQuery) {
      mediaQuery.removeEventListener('change', handleThemeChange);
    }
  });
</script>

<div class="message-input">
  <div class="input-container">
    <div bind:this={editorContainer} class="editor-field editor-font"></div>
    {#if showAutocomplete}
      <SlashCommandAutocomplete
        bind:this={autocompleteComponent}
        query={autocompleteQuery}
        onSelect={handleCommandSelect}
        onCancel={handleAutocompleteCancel}
        selectedIndex={selectedCommandIndex}
        onParameterModeEnter={handleParameterModeEnter}
      />
    {/if}
  </div>
  <div class="controls-row">
    <div class="model-selector-wrapper">
      <ModelSelector />
    </div>
    <ContextUsageWidget {contextUsage} onWarningClick={onStartNewThread} />
    {#if isLoading}
      <button onclick={onCancel} class="send-button cancel-button"> cancel </button>
    {:else}
      <button onclick={handleSubmit} disabled={!inputText.trim()} class="send-button">
        submit ↵
      </button>
    {/if}
  </div>
</div>

<style>
  .message-input {
    padding: 0.25rem;
    padding-bottom: 0.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .input-container {
    position: relative;
    background: var(--bg-primary);
    /*border: 1px solid var(--border-light);*/
    /*border-radius: 1.5rem;*/
    padding: 0.5rem 0;
    transition: all 0.2s ease;
  }

  .controls-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .model-selector-wrapper {
    flex: 1;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .editor-field {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    min-height: 1.25rem;
    max-height: 120px;
    overflow: hidden;
  }

  /* CodeMirror placeholder styling */
  .editor-field :global(.cm-placeholder) {
    color: var(--text-placeholder);
    transition: color 0.2s ease;
  }

  .send-button {
    padding: 0.375rem 0.75rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .send-button:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .send-button:disabled {
    background: var(--border-medium);
    cursor: not-allowed;
    transform: none;
  }

  .send-button:active:not(:disabled) {
    transform: translateY(0);
  }

  .cancel-button {
    background: var(--bg-tertiary);
  }

  .cancel-button:hover {
    background: var(--bg-secondary);
    transform: translateY(-1px);
  }

  .cancel-button:active {
    transform: translateY(0);
  }

  /* Slash command chip styling */
  :global(.slash-command-chip) {
    display: inline-flex;
    align-items: center;
    background: var(--accent-primary);
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    cursor: pointer;
    transition: all 0.2s ease;
    user-select: none;
    vertical-align: baseline;
  }

  :global(.slash-command-chip:hover) {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  :global(.slash-command-chip.editing) {
    background: var(--border-medium);
    color: var(--text-secondary);
  }
</style>
