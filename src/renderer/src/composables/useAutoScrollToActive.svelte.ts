interface AutoScrollOptions {
  activeId: string | null | undefined;
  selector: string;
  isReady: boolean;
  isCollapsed?: boolean;
  behavior?: ScrollBehavior;
  delay?: number;
}

/**
 * Auto-scroll to the active item when it changes
 * Uses $effect to watch for changes to activeId and scroll the element into view
 */
export function useAutoScrollToActive(options: AutoScrollOptions): void {
  const {
    activeId,
    selector,
    isReady,
    isCollapsed = false,
    behavior = 'smooth',
    delay = 50
  } = options;

  $effect(() => {
    if (activeId && isReady && !isCollapsed) {
      setTimeout(() => {
        const activeElement = document.querySelector(
          `${selector}[data-id="${activeId}"]`
        ) as HTMLElement;

        if (activeElement) {
          activeElement.scrollIntoView({
            behavior,
            block: 'nearest'
          });
        }
      }, delay);
    }
  });
}
