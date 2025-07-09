<script lang="ts">
  import Chat from './components/Chat.svelte';
  import Header from './components/Header.svelte';
</script>

<div class="app">
  <Header />
  <main class="main-content">
    <Chat />
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
    :global(body) {
      background-color: #1a1a1a;
      color: #f0f0f0;
    }
  }
</style>
