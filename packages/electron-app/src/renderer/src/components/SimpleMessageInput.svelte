<script lang="ts">
  let { onSend }: { onSend: (text: string) => void } = $props();

  let inputText = $state('');

  function handleSubmit(): void {
    const text = inputText.trim();
    if (text) {
      onSend(text);
      inputText = '';
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  }
</script>

<div class="simple-message-input">
  <textarea
    bind:value={inputText}
    onkeydown={handleKeydown}
    placeholder="Type your message..."
    rows="1"
  ></textarea>
  <button onclick={handleSubmit} disabled={!inputText.trim()}>Send</button>
</div>

<style>
  .simple-message-input {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 8px;
    border: 1px solid #ccc;
    border-radius: 8px;
  }

  textarea {
    flex: 1;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    resize: vertical;
    min-height: 40px;
    font-family: inherit;
    font-size: 14px;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  button {
    padding: 8px 16px;
    border: none;
    background: #007bff;
    color: white;
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
</style>
