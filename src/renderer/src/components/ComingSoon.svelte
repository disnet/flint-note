<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    icon?: 'chat' | 'review' | 'webpage';
  }

  let { title, description, icon = 'chat' }: Props = $props();
</script>

<div class="coming-soon">
  <div class="coming-soon-icon">
    {#if icon === 'chat'}
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <path
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
        ></path>
      </svg>
    {:else if icon === 'review'}
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
    {:else if icon === 'webpage'}
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path
          d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        ></path>
      </svg>
    {/if}
  </div>
  <h3 class="coming-soon-title">{title}</h3>
  {#if description}
    <p class="coming-soon-description">{description}</p>
  {/if}
  <span class="coming-soon-badge">Coming Soon</span>
  <p class="coming-soon-cta">
    Download the <a href="/#download" target="_blank">desktop app</a> to use this feature.
  </p>
</div>

<style>
  .coming-soon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 2rem;
    text-align: center;
    height: 100%;
    min-height: 400px;
  }

  .coming-soon-icon {
    color: var(--text-tertiary);
    margin-bottom: 1.5rem;
    opacity: 0.6;
  }

  .coming-soon-title {
    margin: 0 0 0.5rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .coming-soon-description {
    margin: 0 0 1rem;
    font-size: 0.9375rem;
    color: var(--text-secondary);
    max-width: 300px;
  }

  .coming-soon-badge {
    display: inline-block;
    padding: 0.375rem 0.75rem;
    background: var(--accent-light, rgba(59, 130, 246, 0.1));
    color: var(--accent-primary);
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .coming-soon-cta {
    margin-top: 1.5rem;
    font-size: 0.875rem;
    color: var(--text-tertiary);
  }

  .coming-soon-cta a {
    color: var(--accent-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .coming-soon-cta a:hover {
    opacity: 0.8;
  }
</style>
