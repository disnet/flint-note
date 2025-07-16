/// <reference types="svelte" />
/// <reference types="vite/client" />

// Svelte 5 runes
declare global {
  function $state<T>(initial: T): T;
  function $state<T>(): T | undefined;
  function $derived<T>(fn: () => T): T;
  function $effect(fn: () => void | (() => void)): void;
  function $props<T>(): T;
  function $bindable<T>(value: T): T;
  function $inspect(...values: unknown[]): void;

  namespace $state {
    function snapshot<T>(value: T): T;
  }

  namespace svelteHTML {
    interface HTMLAttributes<T> {
      onclick?: ((event: MouseEvent) => void) | null;
      onkeydown?: ((event: KeyboardEvent) => void) | null;
      oninput?: ((event: Event) => void) | null;
      onchange?: ((event: Event) => void) | null;
      onfocus?: ((event: FocusEvent) => void) | null;
      onblur?: ((event: FocusEvent) => void) | null;
      onsubmit?: ((event: SubmitEvent) => void) | null;
      role?: string;
      'aria-modal'?: boolean | 'true' | 'false';
      'aria-label'?: string;
      'aria-labelledby'?: string;
      tabindex?: number | string;
      title?: string;
      spellcheck?: boolean | 'true' | 'false';
      placeholder?: string;
    }
  }
}

export {};
