<script lang="ts">
  import {
    slashCommandsStore,
    type SlashCommand,
    type SlashCommandParameter
  } from '../stores/slashCommandsStore.svelte';
  import TemplateParameterInput from './TemplateParameterInput.svelte';
  import { validateTemplate } from '../lib/templateParameters.svelte';
  import { notesStore } from '../services/noteStore.svelte';

  let editingCommand = $state<SlashCommand | null>(null);
  let isCreatingNew = $state(false);
  let newCommandName = $state('');
  let newCommandInstruction = $state('');
  let newCommandParameters = $state<SlashCommandParameter[]>([]);
  let editCommandName = $state('');
  let editCommandInstruction = $state('');
  let editCommandParameters = $state<SlashCommandParameter[]>([]);

  function startCreating(): void {
    isCreatingNew = true;
    newCommandName = '';
    newCommandInstruction = '';
    newCommandParameters = [];
  }

  function cancelCreating(): void {
    isCreatingNew = false;
    newCommandName = '';
    newCommandInstruction = '';
    newCommandParameters = [];
  }

  function saveNewCommand(): void {
    if (newCommandName.trim() && newCommandInstruction.trim()) {
      slashCommandsStore.addCommand(
        newCommandName,
        newCommandInstruction,
        newCommandParameters
      );
      cancelCreating();
    }
  }

  function startEditing(command: SlashCommand): void {
    editingCommand = command;
    editCommandName = command.name;
    editCommandInstruction = command.instruction;
    editCommandParameters = command.parameters ? [...command.parameters] : [];
  }

  function cancelEditing(): void {
    editingCommand = null;
    editCommandName = '';
    editCommandInstruction = '';
    editCommandParameters = [];
  }

  function saveEditedCommand(): void {
    if (editingCommand && editCommandName.trim() && editCommandInstruction.trim()) {
      slashCommandsStore.updateCommand(
        editingCommand.id,
        editCommandName,
        editCommandInstruction,
        editCommandParameters
      );
      cancelEditing();
    }
  }

  function deleteCommand(id: string): void {
    if (confirm('Are you sure you want to delete this slash command?')) {
      slashCommandsStore.deleteCommand(id);
    }
  }

  function addParameter(parametersList: SlashCommandParameter[]): void {
    const newParameter: SlashCommandParameter = {
      id: crypto.randomUUID(),
      name: '',
      type: 'text',
      required: false,
      defaultValue: '',
      description: ''
    };
    parametersList.push(newParameter);
  }

  function removeParameter(parametersList: SlashCommandParameter[], index: number): void {
    parametersList.splice(index, 1);
  }

  function updateParameter(
    parametersList: SlashCommandParameter[],
    index: number,
    field: keyof SlashCommandParameter,
    value: string | boolean
  ): void {
    if (parametersList[index]) {
      parametersList[index] = { ...parametersList[index], [field]: value };
    }
  }

  function handleParameterSuggestion(
    parametersList: SlashCommandParameter[],
    parameterName: string,
    suggestedType: string
  ): void {
    const newParameter: SlashCommandParameter = {
      id: crypto.randomUUID(),
      name: parameterName,
      type: suggestedType as 'text' | 'number' | 'selection' | 'textblock',
      required: false,
      defaultValue: '',
      description: ''
    };
    parametersList.push(newParameter);
  }

  // Reactive validation for both forms
  let newCommandValidation = $derived(
    validateTemplate(newCommandInstruction, newCommandParameters)
  );
  let editCommandValidation = $derived(
    validateTemplate(editCommandInstruction, editCommandParameters)
  );

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
</script>

<div class="slash-commands">
  <div class="section-header">
    <h2>Slash Commands</h2>
    <button class="add-button" onclick={startCreating}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      Add Command
    </button>
  </div>

  <div class="commands-list">
    {#if isCreatingNew}
      <div class="command-form">
        <div class="form-group">
          <label for="new-name">Command Name</label>
          <input
            id="new-name"
            type="text"
            bind:value={newCommandName}
            placeholder="e.g., summarize"
            maxlength="50"
          />
        </div>
        <div class="form-group">
          <label for="new-instruction">Instruction</label>
          <TemplateParameterInput
            bind:value={newCommandInstruction}
            parameters={newCommandParameters}
            placeholder="Enter the prompt/instruction for this command... Use {'{parameterName}'} for parameters."
            rows={3}
            onValueChange={(value) => (newCommandInstruction = value)}
            onParameterSuggestion={(name, type) =>
              handleParameterSuggestion(newCommandParameters, name, type)}
            onWikilinkClick={handleWikilinkClick}
          />
        </div>

        <div class="form-group">
          <div class="parameters-header">
            <h4>Parameters</h4>
            <button
              type="button"
              class="add-parameter-button"
              onclick={() => addParameter(newCommandParameters)}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Parameter
            </button>
          </div>

          {#each newCommandParameters as parameter, index (parameter.id)}
            <div
              class="parameter-config"
              class:unused={!newCommandValidation.usedParameters.includes(parameter.name)}
            >
              <div class="parameter-usage-indicator">
                {#if newCommandValidation.usedParameters.includes(parameter.name)}
                  <span class="used-indicator">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="20,6 9,17 4,12"></polyline>
                    </svg>
                    Used in template
                  </span>
                {:else}
                  <span class="unused-indicator">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="15" y1="9" x2="9" y2="15"></line>
                      <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    Not used in template
                  </span>
                {/if}
              </div>
              <div class="parameter-row">
                <input
                  type="text"
                  placeholder="Parameter name"
                  value={parameter.name}
                  oninput={(e) =>
                    updateParameter(
                      newCommandParameters,
                      index,
                      'name',
                      (e.target as HTMLInputElement)?.value
                    )}
                />
                <select
                  value={parameter.type}
                  onchange={(e) =>
                    updateParameter(
                      newCommandParameters,
                      index,
                      'type',
                      (e.target as HTMLSelectElement).value
                    )}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="selection">Selection</option>
                  <option value="textblock">Text Block</option>
                </select>
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    checked={parameter.required}
                    onchange={(e) =>
                      updateParameter(
                        newCommandParameters,
                        index,
                        'required',
                        (e.target as HTMLInputElement).checked
                      )}
                  />
                  Required
                </label>
                <button
                  type="button"
                  class="remove-parameter-button"
                  onclick={() => removeParameter(newCommandParameters, index)}
                  title="Remove parameter"
                  aria-label="Remove parameter"
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

              {#if !parameter.required}
                <input
                  type="text"
                  placeholder="Default value (optional)"
                  value={parameter.defaultValue || ''}
                  oninput={(e) =>
                    updateParameter(
                      newCommandParameters,
                      index,
                      'defaultValue',
                      (e.target as HTMLInputElement).value
                    )}
                  class="parameter-default"
                />
              {/if}

              <input
                type="text"
                placeholder="Description (optional)"
                value={parameter.description || ''}
                oninput={(e) =>
                  updateParameter(
                    newCommandParameters,
                    index,
                    'description',
                    (e.target as HTMLInputElement).value
                  )}
                class="parameter-description"
              />
            </div>
          {/each}
        </div>
        <div class="form-actions">
          <button
            class="save-button"
            onclick={saveNewCommand}
            disabled={!newCommandName.trim() || !newCommandInstruction.trim()}
          >
            Save
          </button>
          <button class="cancel-button" onclick={cancelCreating}> Cancel </button>
        </div>
      </div>
    {/if}

    {#each slashCommandsStore.allCommands as command (command.id)}
      <div class="command-item">
        {#if editingCommand?.id === command.id}
          <div class="command-form">
            <div class="form-group">
              <label for="edit-name">Command Name</label>
              <input
                id="edit-name"
                type="text"
                bind:value={editCommandName}
                maxlength="50"
              />
            </div>
            <div class="form-group">
              <label for="edit-instruction">Instruction</label>
              <TemplateParameterInput
                bind:value={editCommandInstruction}
                parameters={editCommandParameters}
                placeholder="Use {'{parameterName}'} for parameters."
                rows={3}
                onValueChange={(value) => (editCommandInstruction = value)}
                onParameterSuggestion={(name, type) =>
                  handleParameterSuggestion(editCommandParameters, name, type)}
                onWikilinkClick={handleWikilinkClick}
              />
            </div>

            <div class="form-group">
              <div class="parameters-header">
                <h4>Parameters</h4>
                <button
                  type="button"
                  class="add-parameter-button"
                  onclick={() => addParameter(editCommandParameters)}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Parameter
                </button>
              </div>

              {#each editCommandParameters as parameter, index (parameter.id)}
                <div
                  class="parameter-config"
                  class:unused={!editCommandValidation.usedParameters.includes(
                    parameter.name
                  )}
                >
                  <div class="parameter-usage-indicator">
                    {#if editCommandValidation.usedParameters.includes(parameter.name)}
                      <span class="used-indicator">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <polyline points="20,6 9,17 4,12"></polyline>
                        </svg>
                        Used in template
                      </span>
                    {:else}
                      <span class="unused-indicator">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <line x1="15" y1="9" x2="9" y2="15"></line>
                          <line x1="9" y1="9" x2="15" y2="15"></line>
                        </svg>
                        Not used in template
                      </span>
                    {/if}
                  </div>
                  <div class="parameter-row">
                    <input
                      type="text"
                      placeholder="Parameter name"
                      value={parameter.name}
                      oninput={(e) =>
                        updateParameter(
                          editCommandParameters,
                          index,
                          'name',
                          (e.target as HTMLInputElement).value
                        )}
                    />
                    <select
                      value={parameter.type}
                      onchange={(e) =>
                        updateParameter(
                          editCommandParameters,
                          index,
                          'type',
                          (e.target as HTMLSelectElement).value
                        )}
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="selection">Selection</option>
                      <option value="textblock">Text Block</option>
                    </select>
                    <label class="checkbox-label">
                      <input
                        type="checkbox"
                        checked={parameter.required}
                        onchange={(e) =>
                          updateParameter(
                            editCommandParameters,
                            index,
                            'required',
                            (e.target as HTMLInputElement).checked
                          )}
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      class="remove-parameter-button"
                      onclick={() => removeParameter(editCommandParameters, index)}
                      title="Remove parameter"
                      aria-label="Remove parameter"
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

                  {#if !parameter.required}
                    <input
                      type="text"
                      placeholder="Default value (optional)"
                      value={parameter.defaultValue || ''}
                      oninput={(e) =>
                        updateParameter(
                          editCommandParameters,
                          index,
                          'defaultValue',
                          (e.target as HTMLInputElement).value
                        )}
                      class="parameter-default"
                    />
                  {/if}

                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={parameter.description || ''}
                    oninput={(e) =>
                      updateParameter(
                        editCommandParameters,
                        index,
                        'description',
                        (e.target as HTMLInputElement).value
                      )}
                    class="parameter-description"
                  />
                </div>
              {/each}
            </div>
            <div class="form-actions">
              <button
                class="save-button"
                onclick={saveEditedCommand}
                disabled={!editCommandName.trim() || !editCommandInstruction.trim()}
              >
                Save
              </button>
              <button class="cancel-button" onclick={cancelEditing}> Cancel </button>
            </div>
          </div>
        {:else}
          <div class="command-header">
            <div class="command-name">/{command.name}</div>
            <div class="command-actions">
              <button
                class="edit-button"
                onclick={() => startEditing(command)}
                title="Edit command"
                aria-label="Edit command"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="m18 2 3 3-9 9-9 0 0-3z"></path>
                  <path d="m9 11 6-6"></path>
                </svg>
              </button>
              <button
                class="delete-button"
                onclick={() => deleteCommand(command.id)}
                title="Delete command"
                aria-label="Delete command"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <polyline points="3,6 5,6 21,6"></polyline>
                  <path
                    d="m19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2"
                  ></path>
                </svg>
              </button>
            </div>
          </div>
          <div class="command-instruction">{command.instruction}</div>
          {#if command.parameters && command.parameters.length > 0}
            <div class="command-parameters">
              <div class="parameters-label">Parameters:</div>
              <div class="parameters-list">
                {#each command.parameters as parameter (parameter.id)}
                  <div class="parameter-item">
                    <span class="parameter-name">{parameter.name}</span>
                    <span class="parameter-type">({parameter.type})</span>
                    {#if parameter.required}
                      <span class="parameter-required">required</span>
                    {:else}
                      <span class="parameter-optional">optional</span>
                    {/if}
                    {#if parameter.defaultValue}
                      <span class="parameter-default"
                        >default: "{parameter.defaultValue}"</span
                      >
                    {/if}
                    {#if parameter.description}
                      <span class="parameter-description">- {parameter.description}</span>
                    {/if}
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/each}

    {#if slashCommandsStore.allCommands.length === 0 && !isCreatingNew}
      <div class="empty-state">
        <p>No slash commands yet.</p>
        <p>Create your first command to get started!</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .slash-commands {
    padding: 1.25rem;
    height: 100%;
    overflow-y: auto;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
  }

  .section-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .add-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .commands-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .command-item {
    border: 1px solid var(--border-light);
    border-radius: 0.5rem;
    background: var(--bg-secondary);
    overflow: hidden;
  }

  .command-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--bg-tertiary);
  }

  .command-name {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-weight: 600;
    color: var(--accent);
    font-size: 0.875rem;
  }

  .command-actions {
    display: flex;
    gap: 0.25rem;
  }

  .edit-button,
  .delete-button {
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

  .edit-button:hover {
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .delete-button:hover {
    background: var(--error-light);
    color: var(--error);
  }

  .command-instruction {
    padding: 1rem;
    color: var(--text-secondary);
    font-size: 0.875rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .command-form {
    padding: 1rem;
    background: var(--bg-secondary);
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group:last-of-type {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-primary);
  }

  .form-group input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
    transition: border-color 0.2s ease;
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
  }

  .save-button,
  .cancel-button {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: none;
  }

  .save-button {
    background: var(--accent-primary);
    color: white;
  }

  .save-button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .save-button:disabled {
    background: var(--border-light);
    color: var(--text-tertiary);
    cursor: not-allowed;
  }

  .cancel-button {
    background: var(--bg-tertiary);
    color: var(--text-secondary);
  }

  .cancel-button:hover {
    background: var(--bg-quaternary);
    color: var(--text-primary);
  }

  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: var(--text-tertiary);
  }

  .empty-state p {
    margin: 0.5rem 0;
    font-size: 0.875rem;
  }

  .empty-state p:first-child {
    font-weight: 500;
    color: var(--text-secondary);
  }

  /* Parameter configuration styles */
  .parameters-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .add-parameter-button {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .add-parameter-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .parameter-config {
    margin-bottom: 0.75rem;
    padding: 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-tertiary);
  }

  .parameter-config.unused {
    border-color: var(--warning);
    background: var(--warning-light);
  }

  .parameter-usage-indicator {
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
  }

  .used-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--success);
    font-weight: 500;
  }

  .unused-indicator {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--warning);
    font-weight: 500;
  }

  .used-indicator svg,
  .unused-indicator svg {
    flex-shrink: 0;
  }

  .parameter-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .parameter-row input,
  .parameter-row select {
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .parameter-row input:focus,
  .parameter-row select:focus {
    outline: none;
    border-color: var(--accent);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
  }

  .checkbox-label input[type='checkbox'] {
    margin: 0;
    width: auto;
    padding: 0;
  }

  .remove-parameter-button {
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

  .remove-parameter-button:hover {
    background: var(--error-light);
    color: var(--error);
  }

  .parameter-default,
  .parameter-description {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.25rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 0.875rem;
    margin-bottom: 0.25rem;
  }

  .parameter-default:focus,
  .parameter-description:focus {
    outline: none;
    border-color: var(--accent);
  }

  /* Parameter display styles */
  .command-parameters {
    padding: 0.75rem 1rem 1rem;
    border-top: 1px solid var(--border-light);
    background: var(--bg-quaternary);
  }

  .parameters-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .parameters-list {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .parameter-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    line-height: 1.3;
  }

  .parameter-name {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-weight: 600;
    color: var(--accent);
  }

  .parameter-type {
    color: var(--text-tertiary);
    font-style: italic;
  }

  .parameter-required {
    background: var(--error-light);
    color: var(--error);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .parameter-optional {
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.625rem;
    font-weight: 500;
    text-transform: uppercase;
  }

  .parameter-default {
    color: var(--text-tertiary);
    font-style: italic;
  }

  .parameter-description {
    color: var(--text-secondary);
  }
</style>
