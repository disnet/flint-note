interface SearchOverlayState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

function createSearchOverlayState(): SearchOverlayState {
  let isOpen = $state(false);

  return {
    get isOpen() {
      return isOpen;
    },
    open() {
      isOpen = true;
    },
    close() {
      isOpen = false;
    },
    toggle() {
      isOpen = !isOpen;
    }
  };
}

export const searchOverlayState = createSearchOverlayState();
