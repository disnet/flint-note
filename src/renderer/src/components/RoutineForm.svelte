<script lang="ts">
  /**
   * Automerge Routine Form Component
   *
   * Create/edit form for routines with scheduling UI.
   */
  import { createRoutine, updateRoutine } from '../lib/automerge';
  import type { AgentRoutine, RecurringSpec } from '../lib/automerge/types';

  interface Props {
    routine?: AgentRoutine | null;
    onSubmit?: (routineId: string) => void;
    onCancel?: () => void;
  }

  let { routine = null, onSubmit, onCancel }: Props = $props();

  // Form state
  let name = $state(routine?.name || '');
  let purpose = $state(routine?.purpose || '');
  let description = $state(routine?.description || '');
  let type = $state<'routine' | 'backlog'>(routine?.type || 'routine');
  let status = $state(routine?.status || 'active');

  // Scheduling
  let scheduleType = $state<'none' | 'one-time' | 'recurring'>(
    routine?.recurringSpec ? 'recurring' : routine?.dueDate ? 'one-time' : 'none'
  );
  let frequency = $state<'daily' | 'weekly' | 'monthly'>(
    routine?.recurringSpec?.frequency || 'weekly'
  );
  let dayOfWeek = $state<number>(routine?.recurringSpec?.dayOfWeek ?? 1);
  let dayOfMonth = $state<number>(routine?.recurringSpec?.dayOfMonth ?? 1);
  let time = $state(routine?.recurringSpec?.time || '');
  let dueDate = $state(routine?.dueDate?.slice(0, 16) || ''); // datetime-local format

  // Validation
  let error = $state<string | null>(null);
  let submitting = $state(false);

  const isEdit = $derived(!!routine);
  const nameValid = $derived(name.length >= 1 && name.length <= 20);
  const purposeValid = $derived(purpose.length >= 1 && purpose.length <= 100);
  const descriptionValid = $derived(description.length >= 1);
  const formValid = $derived(nameValid && purposeValid && descriptionValid);

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
  ];

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!formValid || submitting) return;

    error = null;
    submitting = true;

    try {
      // Build recurring spec if applicable
      let recurringSpec: RecurringSpec | undefined = undefined;
      let dueDateValue: string | undefined = undefined;

      if (scheduleType === 'recurring') {
        recurringSpec = { frequency };
        if (frequency === 'weekly') {
          recurringSpec.dayOfWeek = dayOfWeek;
        } else if (frequency === 'monthly') {
          recurringSpec.dayOfMonth = dayOfMonth;
        }
        if (time) {
          recurringSpec.time = time;
        }
      } else if (scheduleType === 'one-time' && dueDate) {
        dueDateValue = new Date(dueDate).toISOString();
      }

      if (isEdit && routine) {
        // Update existing routine
        updateRoutine({
          routineId: routine.id,
          name,
          purpose,
          description,
          type,
          status,
          recurringSpec: scheduleType === 'recurring' ? recurringSpec : null,
          dueDate: scheduleType === 'one-time' ? dueDateValue : null
        });
        onSubmit?.(routine.id);
      } else {
        // Create new routine
        const routineId = createRoutine({
          name,
          purpose,
          description,
          type,
          status,
          recurringSpec,
          dueDate: dueDateValue
        });
        onSubmit?.(routineId);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save routine';
    } finally {
      submitting = false;
    }
  }
</script>

<form class="routine-form" onsubmit={handleSubmit}>
  {#if error}
    <div class="error-message">{error}</div>
  {/if}

  <div class="form-content">
    <div class="form-group">
      <label for="name">Name <span class="required">*</span></label>
      <input
        id="name"
        type="text"
        bind:value={name}
        maxlength="20"
        placeholder="Short name (1-20 chars)"
        class:invalid={name.length > 0 && !nameValid}
      />
      <span class="char-count">{name.length}/20</span>
    </div>

    <div class="form-group">
      <label for="purpose">Purpose <span class="required">*</span></label>
      <input
        id="purpose"
        type="text"
        bind:value={purpose}
        maxlength="100"
        placeholder="One-sentence description (1-100 chars)"
        class:invalid={purpose.length > 0 && !purposeValid}
      />
      <span class="char-count">{purpose.length}/100</span>
    </div>

    <div class="form-group">
      <label for="description">Instructions <span class="required">*</span></label>
      <textarea
        id="description"
        bind:value={description}
        rows="6"
        placeholder="Detailed instructions in markdown..."
        class:invalid={description.length > 0 && !descriptionValid}
      ></textarea>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label for="type">Type</label>
        <select id="type" bind:value={type}>
          <option value="routine">Routine</option>
          <option value="backlog">Backlog</option>
        </select>
      </div>

      {#if isEdit}
        <div class="form-group">
          <label for="status">Status</label>
          <select id="status" bind:value={status}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      {/if}
    </div>

    <fieldset class="form-group">
      <legend>Schedule</legend>
      <div class="radio-group">
        <label class="radio-option">
          <input type="radio" bind:group={scheduleType} value="none" />
          <span>On-demand (no schedule)</span>
        </label>
        <label class="radio-option">
          <input type="radio" bind:group={scheduleType} value="one-time" />
          <span>One-time due date</span>
        </label>
        <label class="radio-option">
          <input type="radio" bind:group={scheduleType} value="recurring" />
          <span>Recurring</span>
        </label>
      </div>
    </fieldset>

    {#if scheduleType === 'one-time'}
      <div class="form-group">
        <label for="dueDate">Due Date</label>
        <input id="dueDate" type="datetime-local" bind:value={dueDate} />
      </div>
    {/if}

    {#if scheduleType === 'recurring'}
      <div class="schedule-config">
        <div class="form-group">
          <label for="frequency">Frequency</label>
          <select id="frequency" bind:value={frequency}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {#if frequency === 'weekly'}
          <div class="form-group">
            <label for="dayOfWeek">Day of Week</label>
            <select id="dayOfWeek" bind:value={dayOfWeek}>
              {#each dayNames as day, index (index)}
                <option value={index}>{day}</option>
              {/each}
            </select>
          </div>
        {/if}

        {#if frequency === 'monthly'}
          <div class="form-group">
            <label for="dayOfMonth">Day of Month</label>
            <select id="dayOfMonth" bind:value={dayOfMonth}>
              {#each Array.from({ length: 31 }, (_, i) => i + 1) as day (day)}
                <option value={day}>{day}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div class="form-group">
          <label for="time">Time (optional)</label>
          <input id="time" type="time" bind:value={time} />
        </div>
      </div>
    {/if}
  </div>

  <div class="form-actions">
    {#if onCancel}
      <button type="button" class="btn btn-secondary" onclick={onCancel}>Cancel</button>
    {/if}
    <button type="submit" class="btn btn-primary" disabled={!formValid || submitting}>
      {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Routine'}
    </button>
  </div>
</form>

<style>
  .routine-form {
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }

  .error-message {
    padding: 0.75rem 1rem;
    background: rgba(239, 68, 68, 0.1);
    color: var(--error);
    border-bottom: 1px solid var(--error);
  }

  .form-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .form-group {
    margin-bottom: 1rem;
    position: relative;
  }

  fieldset.form-group {
    border: none;
    padding: 0;
    margin: 0 0 1rem 0;
  }

  fieldset.form-group legend {
    display: block;
    margin-bottom: 0.375rem;
    font-weight: 500;
    font-size: 0.875rem;
    padding: 0;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.375rem;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .required {
    color: var(--error);
  }

  input[type='text'],
  input[type='datetime-local'],
  input[type='time'],
  select,
  textarea {
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    border: 1px solid var(--border-medium);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
  }

  input.invalid,
  textarea.invalid {
    border-color: var(--error);
  }

  textarea {
    resize: vertical;
    min-height: 100px;
    font-family: var(--font-mono);
  }

  .char-count {
    position: absolute;
    right: 0.5rem;
    top: 0;
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .form-row {
    display: flex;
    gap: 1rem;
  }

  .form-row .form-group {
    flex: 1;
  }

  .radio-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .radio-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: normal;
  }

  .radio-option input {
    width: auto;
  }

  .schedule-config {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    margin-top: 0.5rem;
  }

  .schedule-config .form-group:last-child {
    margin-bottom: 0;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1rem;
    border-top: 1px solid var(--border-light);
  }

  .btn {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--text-on-accent);
    border: none;
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
    border: 1px solid var(--border-medium);
  }

  .btn-secondary:hover {
    background: var(--bg-tertiary);
  }
</style>
