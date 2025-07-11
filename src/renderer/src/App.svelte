<script lang="ts">
  import Chat from './components/Chat.svelte';
  import Header from './components/Header.svelte';
  import ToolInspector from './components/ToolInspector.svelte';

  let activeTab = $state('chat');
</script>

<div class="app">
  <Header />
  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'chat'}
      onclick={() => (activeTab = 'chat')}
    >
      Chat
    </button>
    <button
      class="tab"
      class:active={activeTab === 'tools'}
      onclick={() => (activeTab = 'tools')}
    >
      Tool Inspector
    </button>
  </div>
  <main class="main-content">
    {#if activeTab === 'chat'}
      <Chat />
    {:else if activeTab === 'tools'}
      <ToolInspector />
    {/if}
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu',
      'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .tabs {
    display: flex;
    background-color: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
    padding: 0 1rem;
  }

  .tab {
    background: none;
    border: none;
    padding: 0.75rem 1rem;
    cursor: pointer;
    font-size: 0.9rem;
    color: #6c757d;
    border-bottom: 2px solid transparent;
    transition: all 0.2s;
  }

  .tab:hover {
    color: #495057;
    background-color: #e9ecef;
  }

  .tab.active {
    color: #007bff;
    border-bottom-color: #007bff;
  }

  .main-content {
    flex: 1;
    overflow: hidden;
  }

  /* Global styles */
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background-color: #ffffff;
    color: #333333;
  }

  :global(button) {
    font-family: inherit;
  }

  :global(input, textarea) {
    font-family: inherit;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .tabs {
      background-color: #343a40;
      border-color: #495057;
    }

    .tab {
      color: #adb5bd;
    }

    .tab:hover {
      color: #f8f9fa;
      background-color: #495057;
    }

    .tab.active {
      color: #66b2ff;
    }

    :global(body) {
      background-color: #1a1a1a;
      color: #f0f0f0;
    }
  }
</style>
