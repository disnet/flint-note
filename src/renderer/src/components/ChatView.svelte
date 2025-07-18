<script lang="ts">
  import MessageComponent from './MessageComponent.svelte';
  import LoadingMessage from './LoadingMessage.svelte';
  import type { Message } from '../services/types';

  interface Props {
    messages: Message[];
    isLoading?: boolean;
    onNoteClick?: (noteId: string) => void;
  }

  let { messages, isLoading = false, onNoteClick }: Props = $props();

  let chatContainer: HTMLDivElement;

  $effect(() => {
    if (chatContainer && (messages.length > 0 || isLoading)) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  });
</script>

<div class="chat-view" bind:this={chatContainer}>
  <div class="messages">
    {#each messages as message (message.id)}
      <MessageComponent {message} {onNoteClick} />
    {/each}
    {#if isLoading}
      <LoadingMessage />
    {/if}
  </div>
</div>

<style>
  .chat-view {
    height: 100%;
    overflow-y: auto;
    padding: 2rem 1.5rem;
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 700px;
    margin: 0 auto;
    padding-bottom: 1rem;
  }

  .chat-view::-webkit-scrollbar {
    width: 6px;
  }

  .chat-view::-webkit-scrollbar-track {
    background: transparent;
  }

  .chat-view::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
    transition: background-color 0.2s ease;
  }

  .chat-view::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }
</style>
