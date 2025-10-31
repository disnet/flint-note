<script lang="ts">
  import { workflowStore } from '../stores/workflowStore.svelte';
  import type {
    Workflow,
    CreateWorkflowInput,
    UpdateWorkflowInput,
    WorkflowStatus,
    WorkflowType,
    RecurringSpec
  } from '../../../server/types/workflow';

  interface Props {
    workflow?: Workflow | null;
    onSubmit?: (workflow: Workflow) => void;
    onCancel?: () => void;
  }

  let { workflow = null, onSubmit, onCancel }: Props = $props();

  const isEdit = !!workflow;

  // Form state
  let name = $state(workflow?.name || '');
  let purpose = $state(workflow?.purpose || '');
  let description = $state(workflow?.description || '');
  let status = $state<WorkflowStatus>(workflow?.status || 'active');
  let type = $state<WorkflowType>(workflow?.type || 'workflow');

  // Scheduling state
  let isRecurring = $state(!!workflow?.recurringSpec);
  let hasDueDate = $state(!!workflow?.dueDate && !workflow?.recurringSpec);
  let frequency = $state<'daily' | 'weekly' | 'monthly'>(
    workflow?.recurringSpec?.frequency || 'weekly'
  );
  let dayOfWeek = $state<number>(workflow?.recurringSpec?.dayOfWeek || 0);
  let dayOfMonth = $state<number>(workflow?.recurringSpec?.dayOfMonth || 1);
  let time = $state(workflow?.recurringSpec?.time || '');
  let dueDate = $state(
    workflow?.dueDate ? new Date(workflow.dueDate).toISOString().split('T')[0] : ''
  );

  // Validation state
  let submitting = $state(false);
  let error = $state<string | null>(null);

  // Validation derived state
  const nameValid = $derived(name.length >= 1 && name.length <= 20);
  const purposeValid = $derived(purpose.length >= 1 && purpose.length <= 100);
  const descriptionValid = $derived(description.length >= 1);
  const formValid = $derived(nameValid && purposeValid && descriptionValid);

  async function handleSubmit(): Promise<void> {
    if (!formValid) {
      error = 'Please fill in all required fields correctly';
      return;
    }

    submitting = true;
    error = null;

    try {
      let result: Workflow;

      if (isEdit && workflow) {
        // Update existing workflow
        const input: UpdateWorkflowInput = {
          workflowId: workflow.id,
          name,
          purpose,
          description,
          status,
          type,
          recurringSpec: isRecurring
            ? {
                frequency,
                ...(frequency === 'weekly' && { dayOfWeek }),
                ...(frequency === 'monthly' && { dayOfMonth }),
                ...(time && { time })
              }
            : null,
          dueDate: hasDueDate && dueDate ? new Date(dueDate).toISOString() : null
        };

        result = await workflowStore.updateWorkflow(input);
      } else {
        // Create new workflow
        const input: CreateWorkflowInput = {
          name,
          purpose,
          description,
          status,
          type
        };

        if (isRecurring) {
          const recurringSpec: RecurringSpec = {
            frequency
          };

          if (frequency === 'weekly') {
            recurringSpec.dayOfWeek = dayOfWeek;
          } else if (frequency === 'monthly') {
            recurringSpec.dayOfMonth = dayOfMonth;
          }

          if (time) {
            recurringSpec.time = time;
          }

          input.recurringSpec = recurringSpec;
        } else if (hasDueDate && dueDate) {
          input.dueDate = new Date(dueDate).toISOString();
        }

        result = await workflowStore.createWorkflow(input);
      }

      onSubmit?.(result);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save workflow';
      console.error('Failed to save workflow:', err);
    } finally {
      submitting = false;
    }
  }

  function handleScheduleTypeChange(
    scheduleType: 'none' | 'recurring' | 'dueDate'
  ): void {
    isRecurring = scheduleType === 'recurring';
    hasDueDate = scheduleType === 'dueDate';
  }
</script>

<div class="workflow-form">
  <div class="form-header">
    <h2>{isEdit ? 'Edit Routine' : 'Create Routine'}</h2>
  </div>

  <form
    onsubmit={(e) => {
      e.preventDefault();
      handleSubmit();
    }}
  >
    <div class="form-content">
      <!-- Name -->
      <div class="form-group">
        <label for="name">
          Name <span class="required">*</span>
          <span class="char-count" class:error={!nameValid}>
            {name.length}/20
          </span>
        </label>
        <input
          id="name"
          type="text"
          bind:value={name}
          placeholder="e.g., Weekly Summary"
          maxlength="20"
          required
          class:invalid={name && !nameValid}
        />
        {#if name && !nameValid}
          <span class="field-error">Name must be 1-20 characters</span>
        {/if}
      </div>

      <!-- Purpose -->
      <div class="form-group">
        <label for="purpose">
          Purpose <span class="required">*</span>
          <span class="char-count" class:error={!purposeValid}>
            {purpose.length}/100
          </span>
        </label>
        <input
          id="purpose"
          type="text"
          bind:value={purpose}
          placeholder="One-sentence description of what this accomplishes"
          maxlength="100"
          required
          class:invalid={purpose && !purposeValid}
        />
        {#if purpose && !purposeValid}
          <span class="field-error">Purpose must be 1-100 characters</span>
        {/if}
      </div>

      <!-- Description -->
      <div class="form-group">
        <label for="description">
          Description <span class="required">*</span>
        </label>
        <textarea
          id="description"
          bind:value={description}
          placeholder="Detailed step-by-step instructions for executing this routine..."
          rows="8"
          required
          class:invalid={description && !descriptionValid}
        ></textarea>
        {#if description && !descriptionValid}
          <span class="field-error">Description is required</span>
        {/if}
        <span class="field-hint">Supports Markdown formatting</span>
      </div>

      <!-- Status -->
      <div class="form-group">
        <label for="status">Status</label>
        <select id="status" bind:value={status}>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <!-- Type -->
      <div class="form-group">
        <label for="type">Type</label>
        <select id="type" bind:value={type}>
          <option value="workflow">Workflow</option>
          <option value="backlog">Backlog</option>
        </select>
        <span class="field-hint">
          {type === 'workflow'
            ? 'Intentional, structured workflows'
            : 'Items discovered opportunistically'}
        </span>
      </div>

      <!-- Schedule Type -->
      <fieldset class="form-group">
        <legend>Schedule</legend>
        <div class="schedule-type-options">
          <label class="radio-option">
            <input
              type="radio"
              name="scheduleType"
              checked={!isRecurring && !hasDueDate}
              onchange={() => handleScheduleTypeChange('none')}
            />
            On-Demand
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="scheduleType"
              checked={isRecurring}
              onchange={() => handleScheduleTypeChange('recurring')}
            />
            Recurring
          </label>
          <label class="radio-option">
            <input
              type="radio"
              name="scheduleType"
              checked={hasDueDate}
              onchange={() => handleScheduleTypeChange('dueDate')}
            />
            One-Time Due Date
          </label>
        </div>
      </fieldset>

      <!-- Recurring Schedule -->
      {#if isRecurring}
        <div class="form-group schedule-details">
          <label for="frequency">Frequency</label>
          <select id="frequency" bind:value={frequency}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          {#if frequency === 'weekly'}
            <label for="dayOfWeek">Day of Week</label>
            <select id="dayOfWeek" bind:value={dayOfWeek}>
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
              <option value={2}>Tuesday</option>
              <option value={3}>Wednesday</option>
              <option value={4}>Thursday</option>
              <option value={5}>Friday</option>
              <option value={6}>Saturday</option>
            </select>
          {/if}

          {#if frequency === 'monthly'}
            <label for="dayOfMonth">Day of Month</label>
            <input
              id="dayOfMonth"
              type="number"
              bind:value={dayOfMonth}
              min="1"
              max="31"
            />
          {/if}

          <label for="time">Time (optional)</label>
          <input id="time" type="time" bind:value={time} placeholder="HH:MM" />
        </div>
      {/if}

      <!-- Due Date -->
      {#if hasDueDate}
        <div class="form-group">
          <label for="dueDate">Due Date</label>
          <input id="dueDate" type="date" bind:value={dueDate} />
        </div>
      {/if}

      {#if error}
        <div class="form-error">
          {error}
        </div>
      {/if}
    </div>

    <div class="form-actions">
      <button type="submit" class="btn-primary" disabled={!formValid || submitting}>
        {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Routine'}
      </button>
      {#if onCancel}
        <button
          type="button"
          class="btn-secondary"
          onclick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
      {/if}
    </div>
  </form>
</div>

<style>
  .workflow-form {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-primary);
  }

  .form-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-light);
  }

  .form-header h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  form {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }

  .form-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-group label,
  .form-group legend {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
    color: var(--text-primary);
  }

  fieldset.form-group {
    border: none;
    padding: 0;
    margin: 0 0 1.25rem 0;
  }

  .required {
    color: var(--error);
  }

  .char-count {
    float: right;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .char-count.error {
    color: var(--error);
  }

  input[type='text'],
  input[type='date'],
  input[type='time'],
  input[type='number'],
  select,
  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    font-size: 0.875rem;
    font-family: inherit;
    transition: border-color 0.2s;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  input.invalid,
  textarea.invalid {
    border-color: var(--error);
  }

  textarea {
    resize: vertical;
    min-height: 120px;
  }

  .field-error {
    display: block;
    font-size: 0.75rem;
    color: var(--error);
    margin-top: 0.25rem;
  }

  .field-hint {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
  }

  .schedule-type-options {
    display: flex;
    gap: 1rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: normal;
    cursor: pointer;
  }

  .radio-option input[type='radio'] {
    width: auto;
    cursor: pointer;
  }

  .schedule-details {
    padding: 1rem;
    background: var(--bg-tertiary);
    border-radius: 6px;
    border: 1px solid var(--border-light);
  }

  .schedule-details label {
    margin-top: 0.75rem;
  }

  .schedule-details label:first-of-type {
    margin-top: 0;
  }

  .form-error {
    padding: 0.75rem;
    background: rgba(239, 68, 68, 0.15);
    color: var(--error);
    border-radius: 4px;
    font-size: 0.875rem;
    margin-top: 1rem;
    border: 1px solid var(--error);
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid var(--border-light);
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--text-on-accent);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid var(--border-light);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--bg-tertiary);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
