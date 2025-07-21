<script lang="ts">
  import ModelSelector from './ModelSelector.svelte';

  let { onSend }: { onSend: (text: string) => void } = $props();

  let inputText = $state('');
  let inputElement: HTMLInputElement;

  function handleSubmit(): void {
    const text = inputText.trim();
    if (text) {
      onSend(text);
      inputText = '';
      inputElement?.focus();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="message-input">
  <div class="input-container">
    <div class="model-selector-wrapper">
      <ModelSelector />
    </div>
    <input
      bind:this={inputElement}
      bind:value={inputText}
      onkeydown={handleKeydown}
      placeholder="Type your message..."
      class="input-field"
    />
    <button onclick={handleSubmit} disabled={!inputText.trim()} class="send-button">
      Send
    </button>
  </div>
</div>

<style>
  .message-input {
    padding: 1.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .input-container {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    background: var(--bg-primary);
    border: 1px solid var(--border-light);
    border-radius: 1.5rem;
    padding: 0.5rem;
    box-shadow: 0 1px 3px 0 var(--shadow-medium);
    transition: all 0.2s ease;
  }

  .model-selector-wrapper {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .input-container:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px var(--accent-light);
  }

  .input-field {
    flex: 1;
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 1rem;
    font-size: 0.875rem;
    outline: none;
    background: transparent;
    color: var(--text-secondary);
    font-family: inherit;
    resize: none;
    min-height: 1.25rem;
    max-height: 120px;
    transition: color 0.2s ease;
  }

  .input-field::placeholder {
    color: var(--text-placeholder);
    transition: color 0.2s ease;
  }

  .send-button {
    padding: 0.75rem 1rem;
    background: var(--accent-primary);
    color: white;
    border: none;
    border-radius: 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 60px;
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
</style>
