<script lang="ts">
  import ChatView from './components/ChatView.svelte';
  import MessageInput from './components/MessageInput.svelte';
  import type { Message } from './services/types';
  import { getChatService } from './services/chatService';

  let messages = $state<Message[]>([
    {
      id: '1',
      text: "Hi there! I'm Flint, your AI assistant. How can I help you today?",
      sender: 'agent',
      timestamp: new Date(Date.now())
    }
  ]);

  let isLoadingResponse = $state(false);

  async function handleSendMessage(text: string): Promise<void> {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date()
    };
    messages.push(newMessage);

    isLoadingResponse = true;

    try {
      const chatService = getChatService();
      const response = await chatService.sendMessage(text);

      // If response has tool calls, show both initial and follow-up responses
      if (response.hasToolCalls && response.followUpResponse) {
        // First message: Initial response with tool calls
        const initialResponse: Message = {
          id: (Date.now() + 1).toString(),
          text: response.text,
          sender: 'agent',
          timestamp: new Date(),
          toolCalls: response.toolCalls
        };
        messages.push(initialResponse);

        // Second message: Follow-up response after tool execution
        const followUpResponse: Message = {
          id: (Date.now() + 2).toString(),
          text: response.followUpResponse.text,
          sender: 'agent',
          timestamp: new Date()
        };
        messages.push(followUpResponse);
      } else {
        // Regular response without tool calls
        const agentResponse: Message = {
          id: (Date.now() + 1).toString(),
          text: response.text,
          sender: 'agent',
          timestamp: new Date(),
          toolCalls: response.toolCalls
        };
        messages.push(agentResponse);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Sorry, I encountered an error while processing your message.',
        sender: 'agent',
        timestamp: new Date()
      };
      messages.push(errorResponse);
    } finally {
      isLoadingResponse = false;
    }
  }
</script>

<div class="app">
  <header class="header">
    <h1>Flint</h1>
  </header>

  <main class="main">
    <ChatView {messages} isLoading={isLoadingResponse} />
  </main>

  <footer class="footer">
    <MessageInput onSend={handleSendMessage} />
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition:
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .header {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--border-light);
    background: var(--bg-primary);
    box-shadow: 0 1px 3px 0 var(--shadow-light);
    transition: all 0.2s ease;
  }

  .header h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-secondary);
    letter-spacing: -0.025em;
    transition: color 0.2s ease;
  }

  .main {
    flex: 1;
    overflow: hidden;
    background: var(--bg-secondary);
    transition: background-color 0.2s ease;
  }

  .footer {
    border-top: 1px solid var(--border-light);
    background: var(--bg-primary);
    box-shadow: 0 -1px 3px 0 var(--shadow-light);
    transition: all 0.2s ease;
  }
</style>
