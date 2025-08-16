<script lang="ts">
  import {
    slashCommandsStore,
    type SlashCommand
  } from '../stores/slashCommandsStore.svelte';
  import TextBlockEditor from './TextBlockEditor.svelte';
  import WikilinkTextInput from './WikilinkTextInput.svelte';
  import { notesStore } from '../services/noteStore.svelte';

  interface Props {
    query: string;
    onSelect: (command: SlashCommand, parameterValues?: Record<string, string>) => void;
    onCancel: () => void;
    selectedIndex: number;
    onParameterModeEnter?: (command: SlashCommand) => void;
  }

  let { query, onSelect, selectedIndex, onParameterModeEnter }: Props = $props();

  let selectedCommand = $state<SlashCommand | null>(null);
  let parameterValues = $state<Record<string, string>>({});
  let currentParameterIndex = $state(0);
  let firstParameterInput: HTMLInputElement | HTMLSelectElement | null = null;
  let textBlockEditors = $state<Record<string, { focus: () => void }>>({});
  let wikilinkTextInputs = $state<Record<string, { focus: () => void }>>({});

  // Action to capture first parameter input for focus
  function focusFirstParameter(
    node: HTMLInputElement | HTMLSelectElement,
    isFirst: boolean
  ): void {
    if (isFirst) {
      firstParameterInput = node;
    }
  }

  function handleParameterKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Enter':
        // For Ctrl+Enter or Meta+Enter (from textblock), always confirm if possible
        if (event.ctrlKey || event.metaKey || !isTextBlockFocused()) {
          event.preventDefault();
          if (canConfirmParameters()) {
            handleParameterConfirm();
          } else {
            // Provide visual feedback - briefly highlight required fields that are empty
            const firstEmptyRequired = selectedCommand?.parameters?.find((param) => {
              if (param.required) {
                const value = parameterValues[param.name];
                return !value || value.trim().length === 0;
              }
              return false;
            });
            if (firstEmptyRequired) {
              // Find the input field and briefly highlight it
              // For now, just ensure it exists - could add visual feedback later
              console.log(`Please fill required parameter: ${firstEmptyRequired.name}`);
            }
          }
        }
        break;
      case 'Escape':
        event.preventDefault();
        handleParameterCancel();
        break;
      // Let Tab handle normal field navigation
    }
  }

  function handleTextBlockKeyDown(_parameterName: string, event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      handleParameterKeyDown(event);
    } else if (event.key === 'Escape') {
      handleParameterKeyDown(event);
    }
  }

  function isTextBlockFocused(): boolean {
    const activeElement = document.activeElement;
    return !!(activeElement && activeElement.closest('.textblock-editor'));
  }

  // Filter commands based on the query
  function getFilteredCommands(): SlashCommand[] {
    const allCommands = slashCommandsStore.allCommands;

    if (!query) {
      return allCommands.slice(0, 5); // Show first 5 if no query
    }

    return slashCommandsStore.searchCommands(query);
  }

  let filteredCommands = $derived(getFilteredCommands());

  function handleCommandClick(command: SlashCommand): void {
    if (command.parameters && command.parameters.length > 0) {
      // Notify parent to replace /command with chip immediately
      if (onParameterModeEnter) {
        onParameterModeEnter(command);
      }

      // Show parameter input interface
      selectedCommand = command;
      parameterValues = {};
      textBlockEditors = {};
      // Initialize with default values
      command.parameters.forEach((param) => {
        parameterValues[param.name] = param.defaultValue || '';
      });
      currentParameterIndex = 0;

      // Auto-focus first parameter in next tick
      setTimeout(() => {
        if (firstParameterInput) {
          firstParameterInput.focus();
        } else {
          // Try to focus first textblock editor
          const firstTextBlock = Object.values(textBlockEditors)[0];
          if (firstTextBlock && firstTextBlock.focus) {
            firstTextBlock.focus();
          } else {
            // Try to focus first wikilink text input
            const firstWikilinkInput = Object.values(wikilinkTextInputs)[0];
            if (firstWikilinkInput && firstWikilinkInput.focus) {
              firstWikilinkInput.focus();
            }
          }
        }
      }, 0);
    } else {
      // Command has no parameters, select immediately
      onSelect(command);
    }
  }

  function handleParameterConfirm(): void {
    if (selectedCommand) {
      onSelect(selectedCommand, parameterValues);
      selectedCommand = null;
      parameterValues = {};
      textBlockEditors = {};
      currentParameterIndex = 0;
    }
  }

  function handleParameterCancel(): void {
    selectedCommand = null;
    parameterValues = {};
    textBlockEditors = {};
    currentParameterIndex = 0;
  }

  function canConfirmParameters(): boolean {
    if (!selectedCommand?.parameters) return false;

    // Check that all required parameters have values
    return selectedCommand.parameters.every((param) => {
      if (param.required) {
        const value = parameterValues[param.name];
        return value && value.trim().length > 0;
      }
      return true;
    });
  }

  function getPreviewText(): string {
    if (!selectedCommand) return '';
    return slashCommandsStore.expandCommandWithParameters(
      selectedCommand,
      parameterValues
    );
  }

  function handleWikilinkClick(noteId: string, _title: string): void {
    // Find the note in the notes store
    const clickedNote = notesStore.notes.find((n) => n.id === noteId);
    if (clickedNote) {
      // Dispatch a custom event to navigate to the linked note
      const event = new CustomEvent('wikilink-navigate', {
        detail: { note: clickedNote },
        bubbles: true
      });
      document.dispatchEvent(event);
    }
  }

  export function handleKeyboardSelect(): void {
    const filteredCommands = getFilteredCommands();
    if (filteredCommands[selectedIndex]) {
      handleCommandClick(filteredCommands[selectedIndex]);
    }
  }

  function handleMouseEnter(_index: number): void {
    // We could emit an event to update selectedIndex if needed
    // For now, let parent handle keyboard navigation
  }
</script>

<div class="autocomplete-container">
  {#if selectedCommand}
    <!-- Parameter input interface -->
    <div class="autocomplete-dropdown parameter-input-mode">
      <div class="dropdown-header">
        <span class="dropdown-title">Configure /{selectedCommand.name}</span>
        <button
          class="cancel-button"
          onclick={handleParameterCancel}
          aria-label="Cancel parameter configuration"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div class="parameters-form">
        {#each selectedCommand.parameters || [] as parameter, index (parameter.id)}
          <div class="parameter-group">
            <label class="parameter-label" for="param-{parameter.id}">
              {parameter.name}
              {#if parameter.required}
                <span class="required-indicator">*</span>
              {/if}
              {#if parameter.description}
                <span class="parameter-description">- {parameter.description}</span>
              {/if}
            </label>

            {#if parameter.type === 'number'}
              <input
                id="param-{parameter.id}"
                type="number"
                class="parameter-input"
                class:focused={index === currentParameterIndex}
                bind:value={parameterValues[parameter.name]}
                placeholder={parameter.defaultValue || `Enter ${parameter.name}...`}
                use:focusFirstParameter={index === 0}
                onkeydown={handleParameterKeyDown}
              />
            {:else if parameter.type === 'selection'}
              <select
                id="param-{parameter.id}"
                class="parameter-input"
                class:focused={index === currentParameterIndex}
                bind:value={parameterValues[parameter.name]}
                use:focusFirstParameter={index === 0}
                onkeydown={handleParameterKeyDown}
              >
                <option value="">Select {parameter.name}...</option>
                <!-- TODO: Add selection options based on parameter configuration -->
              </select>
            {:else if parameter.type === 'textblock'}
              <TextBlockEditor
                bind:this={textBlockEditors[parameter.name]}
                value={parameterValues[parameter.name]}
                placeholder={parameter.description || `Enter ${parameter.name}...`}
                onValueChange={(value) => {
                  parameterValues[parameter.name] = value;
                }}
                onKeyDown={(event) => handleTextBlockKeyDown(parameter.name, event)}
                minHeight="120px"
                onWikilinkClick={handleWikilinkClick}
              />
            {:else if parameter.type === 'text'}
              <WikilinkTextInput
                bind:this={wikilinkTextInputs[parameter.name]}
                value={parameterValues[parameter.name]}
                placeholder={parameter.description || `Enter ${parameter.name}...`}
                onValueChange={(value) => {
                  parameterValues[parameter.name] = value;
                }}
                onKeyDown={handleParameterKeyDown}
                onWikilinkClick={handleWikilinkClick}
                class="parameter-input"
              />
            {:else}
              <input
                type="text"
                class="parameter-input"
                class:focused={index === currentParameterIndex}
                bind:value={parameterValues[parameter.name]}
                placeholder={parameter.defaultValue || `Enter ${parameter.name}...`}
                use:focusFirstParameter={index === 0}
                onkeydown={handleParameterKeyDown}
              />
            {/if}
          </div>
        {/each}
      </div>

      {#if getPreviewText()}
        <div class="preview-section">
          <div class="preview-label">Preview:</div>
          <div class="preview-text">{getPreviewText()}</div>
        </div>
      {/if}

      <div class="dropdown-footer">
        <div class="parameter-actions">
          <button
            class="confirm-button"
            onclick={handleParameterConfirm}
            disabled={!canConfirmParameters()}
          >
            Insert Command
          </button>
          <button class="cancel-text-button" onclick={handleParameterCancel}>
            Cancel
          </button>
        </div>
        <div class="dropdown-hint">
          Tab through fields • Enter to insert • Escape to cancel
        </div>
      </div>
    </div>
  {:else if slashCommandsStore.allCommands.length === 0}
    <div class="autocomplete-dropdown">
      <div class="no-results">
        <span class="no-results-text">No slash commands configured</span>
        <span class="no-results-hint"
          >Create your first command in Settings → Slash Commands</span
        >
      </div>
    </div>
  {:else if filteredCommands.length > 0}
    <div class="autocomplete-dropdown">
      <div class="dropdown-header">
        <span class="dropdown-title">Slash Commands</span>
        <span class="dropdown-count">{filteredCommands.length} available</span>
      </div>
      <div class="commands-list">
        {#each filteredCommands as command, index (command.id)}
          <button
            class="command-item"
            class:selected={index === selectedIndex}
            onclick={() => handleCommandClick(command)}
            onmouseenter={() => handleMouseEnter(index)}
          >
            <div class="command-info">
              <div class="command-name">
                /{command.name}
                {#if command.parameters && command.parameters.length > 0}
                  <span class="parameters-indicator"
                    >({command.parameters.length} params)</span
                  >
                {/if}
              </div>
              <div class="command-instruction">
                {command.instruction}
              </div>
            </div>
          </button>
        {/each}
      </div>
      <div class="dropdown-footer">
        <span class="dropdown-hint">↑↓ navigate • Enter to select • Escape to cancel</span
        >
      </div>
    </div>
  {:else if query}
    <div class="autocomplete-dropdown">
      <div class="no-results">
        <span class="no-results-text">No commands found for "{query}"</span>
        <span class="no-results-hint">Try a different search term</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .autocomplete-container {
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    z-index: 1000;
    margin-bottom: 0.5rem;
  }

  .autocomplete-dropdown {
    background: var(--bg-secondary);
    border: 1px solid var(--border-medium);
    border-radius: 0.75rem;
    box-shadow: var(--shadow-medium);
    overflow: hidden;
    max-height: 300px;
    display: flex;
    flex-direction: column;
  }

  .dropdown-header {
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-light);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-tertiary);
  }

  .dropdown-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-primary);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .dropdown-count {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .commands-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .command-item {
    width: 100%;
    padding: 0.75rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
    border-bottom: 1px solid var(--border-light);
  }

  .command-item:last-child {
    border-bottom: none;
  }

  .command-item:hover,
  .command-item.selected {
    background: var(--accent-light);
  }

  .command-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .command-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--accent-primary);
    font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
  }

  .command-instruction {
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .dropdown-footer {
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-tertiary);
  }

  .dropdown-hint {
    font-size: 0.6875rem;
    color: var(--text-muted);
    font-style: italic;
  }

  .no-results {
    padding: 1rem 0.75rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .no-results-text {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }

  .no-results-hint {
    font-size: 0.75rem;
    color: var(--text-muted);
    font-style: italic;
  }

  /* Scrollbar styling */
  .commands-list::-webkit-scrollbar {
    width: 6px;
  }

  .commands-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .commands-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .commands-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Parameter input interface styles */
  .parameter-input-mode {
    max-height: 600px;
  }

  .parameters-form {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .parameter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Special handling for textblock parameters */
  .parameter-group :global(.textblock-editor) {
    flex: 1;
  }

  .parameter-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .required-indicator {
    color: var(--error);
    font-weight: 600;
  }

  .parameter-description {
    color: var(--text-tertiary);
    font-weight: 400;
    font-style: italic;
  }

  .parameter-input {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
    transition: all 0.2s ease;
  }

  .parameter-input:focus,
  .parameter-input.focused {
    outline: none;
    border-color: var(--accent);
    background: var(--bg-secondary);
  }

  .parameters-indicator {
    font-size: 0.75rem;
    color: var(--text-tertiary);
    font-weight: 400;
    margin-left: 0.5rem;
  }

  .preview-section {
    padding: 1rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-quaternary);
  }

  .preview-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .preview-text {
    font-size: 0.8125rem;
    color: var(--text-primary);
    line-height: 1.4;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    white-space: pre-wrap;
  }

  .parameter-actions {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .confirm-button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    background: var(--accent-primary);
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .confirm-button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .confirm-button:disabled {
    background: var(--border-light);
    color: var(--text-tertiary);
    cursor: not-allowed;
  }

  .cancel-text-button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cancel-text-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .cancel-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .cancel-button:hover {
    background: var(--error-light);
    color: var(--error);
  }
</style>
