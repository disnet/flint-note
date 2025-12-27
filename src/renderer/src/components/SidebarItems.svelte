<script lang="ts">
  /**
   * Unified sidebar items component
   * Shows pinned and recent items (notes and conversations) in a single list with a separator
   * Dragging items above/below the separator pins/unpins them
   */
  import { tick } from 'svelte';
  import {
    getPinnedItems,
    getRecentItems,
    removeItemFromWorkspace,
    pinItem,
    unpinItem,
    archiveNote,
    archiveConversation,
    getActiveItem,
    reorderPinnedItems,
    reorderRecentItems,
    getReviewData,
    enableReview,
    disableReview,
    getNote,
    EPUB_NOTE_TYPE_ID,
    PDF_NOTE_TYPE_ID,
    WEBPAGE_NOTE_TYPE_ID,
    DECK_NOTE_TYPE_ID,
    DAILY_NOTE_TYPE_ID,
    type SidebarItem,
    type SidebarItemRef
  } from '../lib/automerge';
  import { resolveWikilinks } from './WikilinkText.svelte';

  interface Props {
    onItemSelect: (item: SidebarItem) => void;
  }

  let { onItemSelect }: Props = $props();

  // Reactive state
  const pinnedItems = $derived(getPinnedItems());
  const recentItems = $derived(getRecentItems());
  const activeItem = $derived(getActiveItem());

  // Build unified list: pinned items + separator + recent items
  type ListItem =
    | {
        type: 'item';
        item: SidebarItem;
        section: 'pinned' | 'recent';
        sectionIndex: number;
      }
    | { type: 'separator' };

  const unifiedList = $derived.by(() => {
    const items: ListItem[] = [];

    // Add pinned items
    pinnedItems.forEach((item, index) => {
      items.push({ type: 'item', item, section: 'pinned', sectionIndex: index });
    });

    // Add separator (always present)
    items.push({ type: 'separator' });

    // Add recent items
    recentItems.forEach((item, index) => {
      items.push({ type: 'item', item, section: 'recent', sectionIndex: index });
    });

    return items;
  });

  // The index in unified list where the separator is
  const separatorIndex = $derived(pinnedItems.length);

  // Drag state
  let draggedIndex = $state<number | null>(null);
  let draggedItemId = $state<string | null>(null);
  let draggedItemType = $state<'note' | 'conversation' | null>(null);
  let dropTargetIndex = $state<number | null>(null);
  let dragOffsetY = $state(0);
  let dragStartY = $state(0);
  let itemHeight = $state(0);
  let isAnimating = $state(false);

  const ANIMATION_DURATION = 200;

  // List element ref
  let listElement: HTMLDivElement | undefined = $state();

  // Pre-create transparent drag image
  const emptyDragImage = new Image();
  emptyDragImage.src =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // Context menu state
  let contextMenuOpen = $state(false);
  let contextMenuItemId = $state<string | null>(null);
  let contextMenuItemType = $state<'note' | 'conversation' | null>(null);
  let contextMenuSection = $state<'pinned' | 'recent' | null>(null);
  let contextMenuPosition = $state({ x: 0, y: 0 });

  function handleItemClick(item: SidebarItem): void {
    onItemSelect(item);
  }

  function handleCloseTab(item: SidebarItem, event: Event): void {
    event.stopPropagation();
    removeItemFromWorkspace({ type: item.type, id: item.id });
  }

  function handleClearAll(): void {
    for (const item of recentItems) {
      removeItemFromWorkspace({ type: item.type, id: item.id });
    }
  }

  // Check if the item is active
  function isItemActive(item: SidebarItem): boolean {
    return activeItem?.type === item.type && activeItem?.id === item.id;
  }

  // Drag handlers
  function handleDragStart(e: DragEvent, index: number, item: SidebarItem): void {
    draggedIndex = index;
    draggedItemId = item.id;
    draggedItemType = item.type;
    dropTargetIndex = index;
    dragOffsetY = 0;

    const el = (e.target as HTMLElement).closest('[data-sidebar-item]') as HTMLElement;
    if (el) {
      itemHeight = el.offsetHeight;
    }

    dragStartY = e.clientY;

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `${item.type}:${item.id}`);
      e.dataTransfer.setDragImage(emptyDragImage, 0, 0);
    }

    // Add document-level drag listener to track mouse even outside list area
    document.addEventListener('drag', handleDocumentDrag);
  }

  // Track drag position globally so item follows cursor even outside list area
  function handleDocumentDrag(e: DragEvent): void {
    if (draggedIndex === null) return;

    // During drag, e.clientY can be 0 when outside valid drop targets
    // Only update if we have valid coordinates
    if (e.clientY !== 0) {
      dragOffsetY = e.clientY - dragStartY;
      updateDropTarget();
    }
  }

  // Extracted drop target calculation so it can be called from both handlers
  function updateDropTarget(): void {
    if (draggedIndex === null || !listElement) return;

    const threshold = itemHeight * 0.2;
    const draggedItemCenter = (draggedIndex + 0.5) * itemHeight + dragOffsetY;
    let newTargetIndex: number;

    if (dragOffsetY > 0) {
      const draggedItemBottom = draggedItemCenter + itemHeight / 2;
      newTargetIndex = Math.floor((draggedItemBottom - threshold) / itemHeight);
    } else if (dragOffsetY < 0) {
      const draggedItemTop = draggedItemCenter - itemHeight / 2;
      newTargetIndex = Math.floor((draggedItemTop + threshold) / itemHeight);
    } else {
      newTargetIndex = draggedIndex;
    }

    newTargetIndex = Math.max(0, Math.min(unifiedList.length - 1, newTargetIndex));

    // Handle empty pinned area first
    if (separatorIndex === 0 && draggedIndex > separatorIndex) {
      const draggedItemTop =
        (draggedIndex + 0.5) * itemHeight + dragOffsetY - itemHeight / 2;
      if (draggedItemTop < separatorIndex * itemHeight + itemHeight * 0.8) {
        dropTargetIndex = 0;
        return;
      }
    }

    // Handle separator
    if (newTargetIndex === separatorIndex) {
      // Both directions: separator position is valid as "end of pinned" or "start of recent"
    }

    // Cross-section: recent to pinned
    if (draggedIndex > separatorIndex && newTargetIndex <= separatorIndex) {
      const draggedItemTop =
        (draggedIndex + 0.5) * itemHeight + dragOffsetY - itemHeight / 2;
      const visualSlot = Math.floor((draggedItemCenter + threshold) / itemHeight);

      if (visualSlot < 0) {
        newTargetIndex = 0;
      } else if (visualSlot >= separatorIndex) {
        newTargetIndex = separatorIndex;
      } else {
        newTargetIndex = visualSlot;
      }

      if (draggedItemTop >= (separatorIndex + 0.8) * itemHeight) {
        newTargetIndex = separatorIndex + 1;
      }
    }

    // Cross-section: pinned to recent
    if (draggedIndex < separatorIndex && newTargetIndex >= separatorIndex) {
      const draggedItemBottom =
        (draggedIndex + 0.5) * itemHeight + dragOffsetY + itemHeight / 2;
      const visualSlot = Math.floor((draggedItemCenter - threshold) / itemHeight);

      if (visualSlot <= separatorIndex) {
        newTargetIndex = separatorIndex;
      } else if (visualSlot >= unifiedList.length) {
        newTargetIndex = unifiedList.length - 1;
      } else {
        newTargetIndex = visualSlot;
      }

      if (draggedItemBottom <= (separatorIndex + 0.2) * itemHeight) {
        newTargetIndex = separatorIndex - 1;
      }
    }

    // Handle edge cases
    if (newTargetIndex < 0) newTargetIndex = 0;
    if (newTargetIndex > unifiedList.length - 1) newTargetIndex = unifiedList.length - 1;

    dropTargetIndex = newTargetIndex;
  }

  function handleDragOver(e: DragEvent): void {
    e.preventDefault();
    if (draggedIndex === null || !listElement) return;

    // Update offset and recalculate drop target
    dragOffsetY = e.clientY - dragStartY;
    updateDropTarget();
  }

  function handleDragEnd(e: DragEvent): void {
    // If drag was cancelled (e.g., Escape key, or dropEffect is 'none')
    // just reset without trying to complete the move
    if (e.dataTransfer?.dropEffect === 'none') {
      isAnimating = false;
      resetDragState();
      return;
    }
    finishDrag();
  }

  function handleDrop(e: DragEvent): void {
    e.preventDefault();
    finishDrag();
  }

  async function finishDrag(): Promise<void> {
    if (
      draggedIndex === null ||
      dropTargetIndex === null ||
      draggedItemId === null ||
      draggedItemType === null
    ) {
      resetDragState();
      return;
    }

    const fromIndex = draggedIndex;
    const toIndex = dropTargetIndex;
    const itemId = draggedItemId;
    const itemType = draggedItemType;
    const itemRef: SidebarItemRef = { type: itemType, id: itemId };

    if (fromIndex === toIndex) {
      resetDragState();
      return;
    }

    // Determine source and target sections based on separator position
    const fromPinned = fromIndex < separatorIndex;
    // toPinned is true if:
    // - toIndex is before the separator, OR
    // - toIndex equals separator AND we're coming from recent (meaning "end of pinned")
    const toPinned =
      toIndex < separatorIndex ||
      (toIndex === separatorIndex && fromIndex > separatorIndex);

    // Save current visual positions for FLIP animation
    const draggedItemOffset = dragOffsetY;

    // Build a map of where each item visually appears right now
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Map used only for local computation, not reactive state
    const visualPositions = new Map<string, number>();
    for (let i = 0; i < unifiedList.length; i++) {
      const listItem = unifiedList[i];
      if (listItem.type === 'separator') continue;

      let visualIndex = i;
      if (i === fromIndex) {
        visualIndex = toIndex;
      } else if (fromIndex < toIndex && i > fromIndex && i <= toIndex) {
        visualIndex = i - 1;
      } else if (fromIndex > toIndex && i >= toIndex && i < fromIndex) {
        visualIndex = i + 1;
      }
      // Use composite key for uniqueness across types
      visualPositions.set(`${listItem.item.type}:${listItem.item.id}`, visualIndex);
    }

    // Enter animating state
    isAnimating = true;

    // Safety timeout - reset everything if animation gets stuck
    const safetyTimeout = setTimeout(() => {
      isAnimating = false;
      resetDragState();
    }, ANIMATION_DURATION + 500);

    // Reset drag state
    resetDragState();

    // Handle the move
    if (fromPinned && toPinned) {
      // Reorder within pinned
      reorderPinnedItems(fromIndex, toIndex);
    } else if (!fromPinned && !toPinned) {
      // Reorder within recent
      const fromSectionIndex = fromIndex - separatorIndex - 1;
      const toSectionIndex = toIndex - separatorIndex - 1;
      reorderRecentItems(fromSectionIndex, toSectionIndex);
    } else if (fromPinned && !toPinned) {
      // Moving from pinned to recent (unpin)
      // Calculate target position in recent section
      // After unpin, separator moves up by 1, so we need to account for that
      // toIndex was calculated with old separator position
      // New separator will be at (separatorIndex - 1)
      // Target in recent = toIndex - newSeparator - 1 = toIndex - (separatorIndex - 1) - 1 = toIndex - separatorIndex
      const targetRecentIndex = toIndex - separatorIndex;
      unpinItem(itemRef);
      // After unpin, item is added at index 0 of recent
      if (targetRecentIndex > 0) {
        await tick();
        // Bounds check
        const currentRecentLength = getRecentItems().length;
        if (targetRecentIndex < currentRecentLength) {
          reorderRecentItems(0, targetRecentIndex);
        }
      }
    } else {
      // Moving from recent to pinned (pin)
      // toIndex is the target position in the unified list (which will be in pinned section)
      const targetPinnedIndex = toIndex;
      pinItem(itemRef);
      // After pin, item is added at end of pinned
      await tick();
      const newPinnedLength = getPinnedItems().length;
      // The item is now at index (newPinnedLength - 1), move it to targetPinnedIndex if needed
      if (targetPinnedIndex < newPinnedLength - 1) {
        reorderPinnedItems(newPinnedLength - 1, targetPinnedIndex);
      }
    }

    // Wait for DOM update
    await tick();

    if (!listElement) {
      isAnimating = false;
      return;
    }

    // Query fresh element references
    const freshElements =
      listElement.querySelectorAll<HTMLElement>('[data-sidebar-item]');

    // Apply FLIP: position elements at their OLD visual position, then animate to new
    freshElements.forEach((el) => {
      const elId = el.dataset.itemId;
      const elType = el.dataset.itemType;
      if (!elId || !elType) return;

      const compositeKey = `${elType}:${elId}`;

      // Find this element's new index
      const newIndex = Array.from(freshElements).indexOf(el);
      // Account for separator in the index
      const adjustedNewIndex = newIndex >= separatorIndex ? newIndex + 1 : newIndex;

      let deltaY: number;

      if (elId === itemId && elType === itemType) {
        // The dragged item: calculate from its pixel position
        deltaY = (fromIndex - adjustedNewIndex) * itemHeight + draggedItemOffset;
      } else {
        const oldVisualIndex = visualPositions.get(compositeKey);
        if (oldVisualIndex === undefined) return;
        deltaY = (oldVisualIndex - adjustedNewIndex) * itemHeight;
      }

      // Apply inverse transform immediately (no transition)
      el.style.transition = 'none';
      el.style.transform = deltaY !== 0 ? `translateY(${deltaY}px)` : '';
    });

    // Force reflow
    void listElement.offsetHeight;

    // Disable pointer events during animation
    listElement.style.pointerEvents = 'none';

    // Animate to final position
    freshElements.forEach((el) => {
      el.style.transition = `transform ${ANIMATION_DURATION}ms cubic-bezier(0.2, 0, 0, 1)`;
      el.style.transform = '';
    });

    // Clean up after animation
    setTimeout(() => {
      clearTimeout(safetyTimeout);
      freshElements.forEach((el) => {
        el.style.transition = '';
      });
      if (listElement) {
        listElement.style.pointerEvents = '';
      }
      isAnimating = false;
    }, ANIMATION_DURATION);
  }

  function resetDragState(): void {
    draggedIndex = null;
    draggedItemId = null;
    draggedItemType = null;
    dropTargetIndex = null;
    dragOffsetY = 0;

    // Remove document-level drag listener
    document.removeEventListener('drag', handleDocumentDrag);

    // Clear any stuck transforms on sidebar items
    if (listElement) {
      const sidebarItems =
        listElement.querySelectorAll<HTMLElement>('[data-sidebar-item]');
      sidebarItems.forEach((el) => {
        el.style.transform = '';
        el.style.transition = '';
      });
      // Also clear any stuck separator transforms
      const separatorRow = listElement.querySelector<HTMLElement>('.separator-row');
      if (separatorRow) {
        separatorRow.style.transform = '';
        separatorRow.style.transition = '';
      }
      listElement.style.pointerEvents = '';
    }
  }

  function getItemTransform(index: number): string | undefined {
    // During FLIP animation, transforms are controlled directly via el.style
    if (isAnimating) return undefined;

    if (draggedIndex === null || dropTargetIndex === null) return undefined;

    // The dragged item follows the cursor
    if (index === draggedIndex) {
      return `translateY(${dragOffsetY}px)`;
    }

    // Calculate shifts for other items (including separator)
    if (draggedIndex < dropTargetIndex) {
      // Dragging down: items between drag and target shift up
      if (index > draggedIndex && index <= dropTargetIndex) {
        return `translateY(-${itemHeight}px)`;
      }
    } else {
      // Dragging up: items between target and drag shift down
      if (index >= dropTargetIndex && index < draggedIndex) {
        return `translateY(${itemHeight}px)`;
      }
    }

    return undefined;
  }

  function isDragging(index: number): boolean {
    return draggedIndex === index;
  }

  // Check if we're dragging across the separator
  const isDraggingAcrossSeparator = $derived(
    draggedIndex !== null &&
      dropTargetIndex !== null &&
      // Pinned to recent (dropTargetIndex > separatorIndex)
      ((draggedIndex < separatorIndex && dropTargetIndex > separatorIndex) ||
        // Pinned to start of recent (dropTargetIndex === separatorIndex means "start of recent")
        (draggedIndex < separatorIndex && dropTargetIndex === separatorIndex) ||
        // Recent to pinned (dropTargetIndex < separatorIndex)
        (draggedIndex > separatorIndex && dropTargetIndex < separatorIndex) ||
        // Recent to end of pinned (dropTargetIndex === separatorIndex means "end of pinned")
        (draggedIndex > separatorIndex && dropTargetIndex === separatorIndex))
  );

  // Context menu handlers
  function handleContextMenu(
    event: MouseEvent,
    item: SidebarItem,
    section: 'pinned' | 'recent'
  ): void {
    event.preventDefault();
    contextMenuItemId = item.id;
    contextMenuItemType = item.type;
    contextMenuSection = section;

    const menuWidth = 160;
    const menuHeight = 120;
    const padding = 8;

    let x = event.clientX;
    let y = event.clientY;

    if (x + menuWidth + padding > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }
    if (y + menuHeight + padding > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    x = Math.max(padding, x);
    y = Math.max(padding, y);

    contextMenuPosition = { x, y };
    contextMenuOpen = true;
  }

  function closeContextMenu(): void {
    contextMenuOpen = false;
    contextMenuItemId = null;
    contextMenuItemType = null;
    contextMenuSection = null;
  }

  function handleGlobalClick(event: MouseEvent): void {
    if (contextMenuOpen) {
      const target = event.target as Element;
      if (!target.closest('.context-menu')) {
        closeContextMenu();
      }
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && contextMenuOpen) {
      closeContextMenu();
    }
  }

  function handlePinUnpin(): void {
    if (!contextMenuItemId || !contextMenuItemType) return;
    const itemRef: SidebarItemRef = { type: contextMenuItemType, id: contextMenuItemId };
    if (contextMenuSection === 'pinned') {
      unpinItem(itemRef);
    } else {
      pinItem(itemRef);
    }
    closeContextMenu();
  }

  function handleArchive(): void {
    if (!contextMenuItemId || !contextMenuItemType) return;
    if (contextMenuItemType === 'note') {
      archiveNote(contextMenuItemId);
    } else if (contextMenuItemType === 'conversation') {
      archiveConversation(contextMenuItemId);
    }
    closeContextMenu();
  }

  function handleClose(): void {
    if (!contextMenuItemId || !contextMenuItemType) return;
    const itemRef: SidebarItemRef = { type: contextMenuItemType, id: contextMenuItemId };
    if (contextMenuSection === 'pinned') {
      unpinItem(itemRef);
    } else {
      removeItemFromWorkspace(itemRef);
    }
    closeContextMenu();
  }

  // Check if the context menu item is a reviewable note
  const contextMenuNoteReviewable = $derived.by(() => {
    if (!contextMenuItemId || contextMenuItemType !== 'note') return false;
    const note = getNote(contextMenuItemId);
    if (!note) return false;
    // Exclude special note types from review
    const excludedTypes = [
      EPUB_NOTE_TYPE_ID,
      PDF_NOTE_TYPE_ID,
      WEBPAGE_NOTE_TYPE_ID,
      DECK_NOTE_TYPE_ID,
      DAILY_NOTE_TYPE_ID
    ];
    return !excludedTypes.includes(note.type);
  });

  // Check if review is enabled for context menu item
  const contextMenuReviewEnabled = $derived.by(() => {
    if (!contextMenuItemId || contextMenuItemType !== 'note') return false;
    const reviewData = getReviewData(contextMenuItemId);
    return reviewData?.enabled ?? false;
  });

  function handleToggleReview(): void {
    if (!contextMenuItemId || contextMenuItemType !== 'note') return;
    if (contextMenuReviewEnabled) {
      disableReview(contextMenuItemId);
    } else {
      enableReview(contextMenuItemId);
    }
    closeContextMenu();
  }
</script>

<svelte:window onclick={handleGlobalClick} onkeydown={handleKeydown} />

<div class="sidebar-items">
  <div class="section-label">Pinned</div>
  <div
    class="items-list"
    class:is-dragging={draggedIndex !== null}
    bind:this={listElement}
    ondragover={handleDragOver}
    ondrop={handleDrop}
    role="list"
  >
    {#if pinnedItems.length === 0}
      <div
        class="empty-pinned-area always-visible"
        class:highlight={isDraggingAcrossSeparator}
      >
        <span class="empty-pinned-text">Drag items here to pin</span>
      </div>
    {/if}
    {#each unifiedList as listItem, index (listItem.type === 'separator' ? 'separator' : `${listItem.item.type}:${listItem.item.id}`)}
      {#if listItem.type === 'separator'}
        <div class="separator-row" style:transform={getItemTransform(index)}>
          <div class="separator-line"></div>
          {#if recentItems.length > 0}
            <button class="clear-all" onclick={handleClearAll}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="down-arrow"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="7,14 12,19 17,14"></polyline>
              </svg>
              close all
            </button>
          {/if}
        </div>
      {:else}
        <div
          class="sidebar-item"
          class:active={isItemActive(listItem.item)}
          class:dragging={isDragging(index)}
          class:pinned={listItem.section === 'pinned'}
          style:transform={getItemTransform(index)}
          onclick={() => handleItemClick(listItem.item)}
          oncontextmenu={(e) => handleContextMenu(e, listItem.item, listItem.section)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && handleItemClick(listItem.item)}
          draggable="true"
          ondragstart={(e) => handleDragStart(e, index, listItem.item)}
          ondragend={handleDragEnd}
          data-sidebar-item
          data-item-id={listItem.item.id}
          data-item-type={listItem.item.type}
        >
          <div class="item-content">
            <div class="item-icon">
              {#if listItem.item.type === 'conversation'}
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
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                  ></path>
                </svg>
              {:else}
                <span class="emoji-icon">{listItem.item.icon}</span>
              {/if}
            </div>
            <span
              class="item-title"
              class:untitled-text={listItem.item.metadata?.isPreview}
            >
              {resolveWikilinks(listItem.item.title)}
            </span>
          </div>
          {#if listItem.section === 'recent'}
            <button
              class="close-item"
              onclick={(e) => handleCloseTab(listItem.item, e)}
              aria-label="Remove from recent"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          {/if}
        </div>
      {/if}
    {/each}
  </div>
</div>

<!-- Context menu -->
{#if contextMenuOpen}
  <div
    class="context-menu"
    style="left: {contextMenuPosition.x}px; top: {contextMenuPosition.y}px;"
    role="menu"
  >
    <button class="context-menu-item" onclick={handlePinUnpin} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M12 17v5"></path>
        <path
          d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        ></path>
        {#if contextMenuSection === 'pinned'}
          <line x1="2" y1="2" x2="22" y2="22"></line>
        {/if}
      </svg>
      <span class="menu-item-label"
        >{contextMenuSection === 'pinned' ? 'Unpin' : 'Pin'}</span
      >
    </button>
    <button class="context-menu-item" onclick={handleClose} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
      <span class="menu-item-label">Close</span>
    </button>
    <button class="context-menu-item" onclick={handleArchive} role="menuitem">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <polyline points="21 8 21 21 3 21 3 8"></polyline>
        <rect x="1" y="3" width="22" height="5"></rect>
        <line x1="10" y1="12" x2="14" y2="12"></line>
      </svg>
      Archive
    </button>
    {#if contextMenuNoteReviewable}
      <div class="context-menu-divider"></div>
      <button class="context-menu-item" onclick={handleToggleReview} role="menuitem">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
        </svg>
        <span class="menu-item-label">
          {contextMenuReviewEnabled ? 'Disable Review' : 'Enable Review'}
        </span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .sidebar-items {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding-bottom: 0.5rem;
  }

  .section-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.5rem 0.75rem 0.25rem;
  }

  .items-list {
    display: flex;
    flex-direction: column;
    padding: 0 0.75rem;
  }

  .separator-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    padding: 0.5rem 0;
    /* Transform controlled programmatically during drag */
  }

  .empty-pinned-area {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 1.25rem;
    margin-bottom: 0.25rem;
    border: 2px dashed var(--border-light);
    border-radius: 0.75rem;
    background: transparent;
    min-height: 4rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .empty-pinned-area.highlight {
    background: var(--accent-light);
    border-color: var(--accent-primary);
    box-shadow: 0 2px 12px rgba(0, 123, 255, 0.15);
  }

  .empty-pinned-text {
    font-size: 0.75rem;
    color: var(--text-muted);
    transition: all 0.3s ease;
  }

  .empty-pinned-area.highlight .empty-pinned-text {
    color: var(--accent-primary);
  }

  .separator-line {
    height: 1px;
    background: repeating-linear-gradient(
      to right,
      var(--border-light) 0,
      var(--border-light) 4px,
      transparent 4px,
      transparent 8px
    );
    flex: 1;
  }

  .clear-all {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.2s ease;
    text-decoration: underline;
    text-underline-offset: 2px;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .clear-all:hover {
    color: var(--text-secondary);
  }

  .down-arrow {
    flex-shrink: 0;
  }

  .sidebar-item {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.4rem;
    border-radius: 0.4rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.875rem;
    cursor: pointer;
    text-align: left;
    position: relative;
    z-index: 1;
    /* Transform transitions are controlled programmatically for FLIP animations */
  }

  .sidebar-item:hover {
    background: var(--bg-hover);
  }

  /* Disable hover effects during drag operations */
  .items-list.is-dragging .sidebar-item:hover {
    background: transparent;
  }

  .items-list.is-dragging .sidebar-item.active:hover {
    background: var(--accent-light);
  }

  .sidebar-item.active {
    background: var(--accent-light);
  }

  .sidebar-item.dragging {
    opacity: 0.9;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    background: var(--bg-secondary);
    transition:
      opacity 0.15s,
      box-shadow 0.15s;
  }

  .item-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 0.4rem;
    flex: 1;
    min-width: 0;
  }

  .item-icon {
    display: flex;
    align-items: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .emoji-icon {
    font-size: 12px;
    line-height: 1;
  }

  .item-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .untitled-text {
    color: var(--text-placeholder);
    font-style: italic;
  }

  .close-item {
    display: none;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    border-radius: 0.25rem;
    flex-shrink: 0;
  }

  .sidebar-item:hover .close-item {
    display: flex;
  }

  .close-item:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  /* Context menu styles */
  .context-menu {
    position: fixed;
    z-index: 1000;
    background: var(--bg-primary);
    border: 1px solid var(--border-medium);
    border-radius: 0.375rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    min-width: 160px;
    padding: 0.25rem;
  }

  .context-menu-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 0.25rem;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .context-menu-item:hover {
    background: var(--bg-secondary);
  }

  .context-menu-item svg {
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .context-menu-divider {
    height: 1px;
    background: var(--border-light);
    margin: 0.25rem 0;
  }

  .menu-item-label {
    flex: 1;
  }
</style>
