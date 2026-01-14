/**
 * Svelte action that teleports an element to document.body
 *
 * Useful for rendering fixed-position elements (popovers, menus, etc.)
 * outside of transformed containers that would otherwise create
 * a new containing block for position:fixed descendants.
 *
 * Usage: <div use:portal>...</div>
 */
export function portal(node: HTMLElement): { destroy: () => void } {
  // Move the node to body
  document.body.appendChild(node);

  return {
    destroy() {
      // Move back or remove when component is destroyed
      if (node.parentNode === document.body) {
        document.body.removeChild(node);
      }
    }
  };
}
