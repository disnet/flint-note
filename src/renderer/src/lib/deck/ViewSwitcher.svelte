<script lang="ts">
  import type { DeckView } from './types';

  interface Props {
    /** All views in the deck */
    views: DeckView[];
    /** Index of currently active view */
    activeViewIndex: number;
    /** Called when active view changes */
    onViewChange: (index: number) => void;
    /** Called when a view is renamed */
    onViewRename: (index: number, newName: string) => void;
    /** Called when a new view is created */
    onViewCreate: (name: string) => void;
    /** Called when a view is deleted */
    onViewDelete: (index: number) => void;
    /** Called when views are reordered */
    onViewReorder: (fromIndex: number, toIndex: number) => void;
    /** Called when a view is duplicated */
    onViewDuplicate: (index: number) => void;
  }

  let {
    views,
    activeViewIndex,
    onViewChange,
    onViewRename,
    onViewCreate,
    onViewDelete,
    onViewReorder,
    onViewDuplicate
  }: Props = $props();

  let isOpen = $state(false);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let dropdownRef = $state<HTMLDivElement | null>(null);
  let editingIndex = $state<number | null>(null);
  let editingName = $state('');
  let menuOpenIndex = $state<number | null>(null);
  let isCreatingNew = $state(false);
  let newViewName = $state('');
  let nameInputRef = $state<HTMLInputElement | null>(null);
  let newViewInputRef = $state<HTMLInputElement | null>(null);

  const activeView = $derived(views[activeViewIndex] || views[0]);

  // Close dropdown when clicking outside
  function handleMouseDownOutside(event: MouseEvent): void {
    if (
      dropdownRef &&
      !dropdownRef.contains(event.target as Node) &&
      buttonRef &&
      !buttonRef.contains(event.target as Node)
    ) {
      closeDropdown();
    }
  }

  $effect(() => {
    if (isOpen) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleMouseDownOutside, true);
      }, 10);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleMouseDownOutside, true);
      };
    }
    return undefined;
  });

  // Focus input when editing starts
  $effect(() => {
    if (editingIndex !== null && nameInputRef) {
      nameInputRef.focus();
      nameInputRef.select();
    }
  });

  // Focus new view input
  $effect(() => {
    if (isCreatingNew && newViewInputRef) {
      newViewInputRef.focus();
    }
  });

  function toggleDropdown(): void {
    if (isOpen) {
      closeDropdown();
    } else {
      isOpen = true;
    }
  }

  function closeDropdown(): void {
    isOpen = false;
    editingIndex = null;
    menuOpenIndex = null;
    isCreatingNew = false;
    newViewName = '';
  }

  function handleViewClick(index: number): void {
    if (editingIndex === index) return;
    onViewChange(index);
    closeDropdown();
  }

  function startEditing(index: number, event: MouseEvent): void {
    event.stopPropagation();
    editingIndex = index;
    editingName = views[index].name;
    menuOpenIndex = null;
  }

  function saveEdit(): void {
    if (editingIndex !== null && editingName.trim()) {
      onViewRename(editingIndex, editingName.trim());
    }
    editingIndex = null;
    editingName = '';
  }

  function cancelEdit(): void {
    editingIndex = null;
    editingName = '';
  }

  function handleEditKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      saveEdit();
    } else if (event.key === 'Escape') {
      cancelEdit();
    }
  }

  function toggleMenu(index: number, event: MouseEvent): void {
    event.stopPropagation();
    if (menuOpenIndex === index) {
      menuOpenIndex = null;
    } else {
      menuOpenIndex = index;
    }
  }

  function handleDuplicate(index: number, event: MouseEvent): void {
    event.stopPropagation();
    onViewDuplicate(index);
    menuOpenIndex = null;
  }

  function handleDelete(index: number, event: MouseEvent): void {
    event.stopPropagation();
    if (views.length > 1) {
      onViewDelete(index);
    }
    menuOpenIndex = null;
  }

  function handleMoveUp(index: number, event: MouseEvent): void {
    event.stopPropagation();
    if (index > 0) {
      onViewReorder(index, index - 1);
    }
    menuOpenIndex = null;
  }

  function handleMoveDown(index: number, event: MouseEvent): void {
    event.stopPropagation();
    if (index < views.length - 1) {
      onViewReorder(index, index + 1);
    }
    menuOpenIndex = null;
  }

  function startCreatingNew(): void {
    isCreatingNew = true;
    newViewName = '';
    menuOpenIndex = null;
  }

  function createNewView(): void {
    const name = newViewName.trim() || 'New View';
    onViewCreate(name);
    isCreatingNew = false;
    newViewName = '';
    closeDropdown();
  }

  function cancelCreate(): void {
    isCreatingNew = false;
    newViewName = '';
  }

  function handleCreateKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      createNewView();
    } else if (event.key === 'Escape') {
      cancelCreate();
    }
  }

  function handleDropdownKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      closeDropdown();
      event.preventDefault();
      event.stopPropagation();
    }
  }
</script>

<div class="view-switcher">
  <button
    bind:this={buttonRef}
    class="view-button"
    type="button"
    onclick={toggleDropdown}
    title="Switch view"
  >
    <span class="view-name">{activeView?.name || 'Default'}</span>
    <svg
      class="chevron"
      class:open={isOpen}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>

  {#if isOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={dropdownRef} class="dropdown" onkeydown={handleDropdownKeyDown}>
      <div class="view-list">
        {#each views as view, index (index)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="view-item"
            class:active={index === activeViewIndex}
            onclick={() => handleViewClick(index)}
          >
            {#if editingIndex === index}
              <input
                bind:this={nameInputRef}
                type="text"
                class="view-name-input"
                bind:value={editingName}
                onblur={saveEdit}
                onkeydown={handleEditKeyDown}
                onclick={(e) => e.stopPropagation()}
              />
            {:else}
              <span class="view-item-name">{view.name}</span>
              {#if index === activeViewIndex}
                <svg
                  class="check-icon"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {/if}
            {/if}

            <button
              class="menu-button"
              type="button"
              onclick={(e) => toggleMenu(index, e)}
              title="View options"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>

            {#if menuOpenIndex === index}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="context-menu" onclick={(e) => e.stopPropagation()}>
                <button
                  class="context-item"
                  type="button"
                  onclick={(e) => startEditing(index, e)}
                >
                  Rename
                </button>
                <button
                  class="context-item"
                  type="button"
                  onclick={(e) => handleDuplicate(index, e)}
                >
                  Duplicate
                </button>
                {#if index > 0}
                  <button
                    class="context-item"
                    type="button"
                    onclick={(e) => handleMoveUp(index, e)}
                  >
                    Move Up
                  </button>
                {/if}
                {#if index < views.length - 1}
                  <button
                    class="context-item"
                    type="button"
                    onclick={(e) => handleMoveDown(index, e)}
                  >
                    Move Down
                  </button>
                {/if}
                {#if views.length > 1}
                  <div class="context-divider"></div>
                  <button
                    class="context-item danger"
                    type="button"
                    onclick={(e) => handleDelete(index, e)}
                  >
                    Delete
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="dropdown-divider"></div>

      {#if isCreatingNew}
        <div class="new-view-form">
          <input
            bind:this={newViewInputRef}
            type="text"
            class="new-view-input"
            placeholder="View name..."
            bind:value={newViewName}
            onblur={createNewView}
            onkeydown={handleCreateKeyDown}
          />
        </div>
      {:else}
        <button class="new-view-button" type="button" onclick={startCreatingNew}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>New View</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .view-switcher {
    position: relative;
    display: inline-flex;
  }

  .view-button {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--border-light);
    border-radius: 0.375rem;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .view-button:hover {
    background: var(--bg-tertiary);
    border-color: var(--border-medium);
    color: var(--text-primary);
  }

  .view-name {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    transition: transform 0.15s ease;
    flex-shrink: 0;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.25rem;
    min-width: 180px;
    max-width: 250px;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.5rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    animation: slideDown 0.15s ease-out;
    overflow: hidden;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .view-list {
    max-height: 200px;
    overflow-y: auto;
    padding: 0.25rem;
  }

  .view-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    position: relative;
    transition: background 0.15s ease;
  }

  .view-item:hover {
    background: var(--bg-secondary);
  }

  .view-item.active {
    background: var(--bg-tertiary);
  }

  .view-item-name {
    flex: 1;
    font-size: 0.8rem;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .view-name-input {
    flex: 1;
    padding: 0.125rem 0.25rem;
    border: 1px solid var(--accent-primary);
    border-radius: 0.25rem;
    font-size: 0.8rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .check-icon {
    flex-shrink: 0;
    color: var(--accent-primary);
  }

  .menu-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-tertiary);
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .view-item:hover .menu-button {
    opacity: 1;
  }

  .menu-button:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .context-menu {
    position: absolute;
    top: 0;
    right: 0;
    transform: translateX(100%);
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10001;
    min-width: 100px;
    padding: 0.25rem;
  }

  .context-item {
    display: block;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: none;
    border-radius: 0.25rem;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.75rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .context-item:hover {
    background: var(--bg-secondary);
  }

  .context-item.danger {
    color: var(--accent-error, #ef4444);
  }

  .context-item.danger:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .context-divider {
    height: 1px;
    background: var(--border-light);
    margin: 0.25rem 0;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--border-light);
    margin: 0;
  }

  .new-view-button {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    padding: 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .new-view-button:hover {
    background: var(--bg-secondary);
    color: var(--text-primary);
  }

  .new-view-form {
    padding: 0.375rem;
  }

  .new-view-input {
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: 1px solid var(--accent-primary);
    border-radius: 0.25rem;
    font-size: 0.8rem;
    background: var(--bg-primary);
    color: var(--text-primary);
    outline: none;
  }

  .new-view-input::placeholder {
    color: var(--text-tertiary);
  }
</style>
