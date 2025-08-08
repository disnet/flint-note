<script lang="ts">
  import {
    slashCommandsStore,
    type SlashCommand
  } from '../stores/slashCommandsStore.svelte';

  let editingCommand = $state<SlashCommand | null>(null);
  let isCreatingNew = $state(false);
  let newCommandName = $state('');
  let newCommandInstruction = $state('');
  let editCommandName = $state('');
  let editCommandInstruction = $state('');

  function startCreating(): void {
    isCreatingNew = true;
    newCommandName = '';
    newCommandInstruction = '';
  }

  function cancelCreating(): void {
    isCreatingNew = false;
    newCommandName = '';
    newCommandInstruction = '';
  }

  function saveNewCommand(): void {
    if (newCommandName.trim() && newCommandInstruction.trim()) {
      slashCommandsStore.addCommand(newCommandName, newCommandInstruction);
      cancelCreating();
    }
  }

  function startEditing(command: SlashCommand): void {
    editingCommand = command;
    editCommandName = command.name;
    editCommandInstruction = command.instruction;
  }

  function cancelEditing(): void {
    editingCommand = null;
    editCommandName = '';
    editCommandInstruction = '';
  }

  function saveEditedCommand(): void {
    if (editingCommand && editCommandName.trim() && editCommandInstruction.trim()) {
      slashCommandsStore.updateCommand(
        editingCommand.id,
        editCommandName,
        editCommandInstruction
      );
      cancelEditing();
    }
  }

  function deleteCommand(id: string): void {
    if (confirm('Are you sure you want to delete this slash command?')) {
      slashCommandsStore.deleteCommand(id);
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
          <textarea
            id="new-instruction"
            bind:value={newCommandInstruction}
            placeholder="Enter the prompt/instruction for this command..."
            rows="3"
          ></textarea>
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
              <textarea id="edit-instruction" bind:value={editCommandInstruction} rows="3"
              ></textarea>
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

  .form-group input,
  .form-group textarea {
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

  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--accent);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
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
</style>
