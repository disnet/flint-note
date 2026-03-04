<script lang="ts">
  import ChatPanel from './ChatPanel.svelte';

  interface Props {
    isOpen: boolean;
    isExpanded?: boolean;
    onClose: () => void;
    onToggleExpand?: () => void;
    onGoToSettings: () => void;
    initialMessage?: string;
    onInitialMessageConsumed?: () => void;
    onSwitchToShelf?: () => void;
  }

  let {
    isOpen,
    isExpanded = false,
    onClose,
    onToggleExpand,
    onGoToSettings,
    initialMessage,
    onInitialMessageConsumed,
    onSwitchToShelf
  }: Props = $props();
</script>

<ChatPanel
  {isOpen}
  {isExpanded}
  {onClose}
  {onToggleExpand}
  {onGoToSettings}
  {initialMessage}
  {onInitialMessageConsumed}
  {onSwitchToShelf}
/>
