<script lang="ts">
  import { isWeb } from '../lib/platform.svelte';
  import ReviewView from './ReviewView.svelte';
  import ComingSoon from './ComingSoon.svelte';
</script>

{#if isWeb()}
  <div class="review-view-web">
    <ComingSoon
      title="Review Mode"
      description="Use spaced repetition to remember what you learn with AI-generated prompts."
      icon="review"
    />
  </div>
{:else}
  <ReviewView />
{/if}

<style>
  .review-view-web {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
