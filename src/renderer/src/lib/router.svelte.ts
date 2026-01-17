/**
 * URL Router for Flint Web App
 * Syncs browser URL with app state bidirectionally (web mode only)
 */

import { SvelteURL, SvelteURLSearchParams } from 'svelte/reactivity';
import { isWeb } from './platform.svelte';
import {
  getActiveItem,
  setActiveItem,
  getActiveSystemView,
  setActiveSystemView,
  getNotes,
  type SystemView
} from './automerge';
import { sidebarState } from '../stores/sidebarState.svelte';

// Route types
type RouteType = 'root' | 'note' | 'system';

interface ParsedRoute {
  type: RouteType;
  noteId?: string;
  systemView?: SystemView;
  sidebar?: 'open' | 'closed';
  panel?: 'chat' | 'shelf';
}

// System views that have URL routes
const SYSTEM_VIEW_ROUTES: Record<string, SystemView> = {
  inbox: 'inbox',
  daily: 'daily',
  review: 'review',
  settings: 'settings',
  types: 'types',
  routines: 'routines',
  search: 'expanded-search'
};

// Flags to prevent circular updates
let isUpdatingFromUrl = false;
let isUpdatingUrl = false;

/**
 * Parse URL into route data
 */
function parseUrl(url: URL): ParsedRoute {
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  const result: ParsedRoute = { type: 'root' };

  // Parse sidebar state from query params
  const sidebarParam = searchParams.get('sidebar');
  if (sidebarParam === 'open' || sidebarParam === 'closed') {
    result.sidebar = sidebarParam;
  }

  const panelParam = searchParams.get('panel');
  if (panelParam === 'chat' || panelParam === 'shelf') {
    result.panel = panelParam;
  }

  // Parse pathname
  if (pathname === '/' || pathname === '') {
    result.type = 'root';
    return result;
  }

  // Check for note route: /note/:id (note IDs are n-xxxxxxxx format)
  const noteMatch = pathname.match(/^\/note\/(n-[a-f0-9]+)$/);
  if (noteMatch) {
    result.type = 'note';
    result.noteId = noteMatch[1];
    return result;
  }

  // Check for system view routes
  const pathWithoutSlash = pathname.slice(1);
  if (pathWithoutSlash in SYSTEM_VIEW_ROUTES) {
    result.type = 'system';
    result.systemView = SYSTEM_VIEW_ROUTES[pathWithoutSlash];
    return result;
  }

  // Unknown route - treat as root
  return result;
}

/**
 * Build URL from current state
 */
function buildUrl(): string {
  const activeItem = getActiveItem();
  const systemView = getActiveSystemView();

  let pathname = '/';

  if (systemView) {
    pathname = `/${systemView}`;
  } else if (activeItem?.type === 'note') {
    pathname = `/note/${activeItem.id}`;
  }
  // Conversations don't have URL routes

  // Build query params
  const params = new SvelteURLSearchParams();

  // Sidebar state - only serialize if closed (open is default)
  if (!sidebarState.leftSidebar.visible) {
    params.set('sidebar', 'closed');
  }

  // Panel state - only include if panel is open
  if (sidebarState.rightSidebar.panelOpen) {
    params.set('panel', sidebarState.rightSidebar.activePanel);
  }

  const queryString = params.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}

/**
 * Apply parsed route to app state
 */
async function applyRoute(route: ParsedRoute): Promise<void> {
  isUpdatingFromUrl = true;

  try {
    // Apply sidebar state
    if (route.sidebar === 'closed' && sidebarState.leftSidebar.visible) {
      await sidebarState.toggleLeftSidebar();
    } else if (route.sidebar === 'open' && !sidebarState.leftSidebar.visible) {
      await sidebarState.toggleLeftSidebar();
    }

    // Apply panel state
    if (route.panel) {
      await sidebarState.openPanel(route.panel);
    } else if (sidebarState.rightSidebar.panelOpen) {
      await sidebarState.closePanel();
    }

    // Apply main state
    switch (route.type) {
      case 'note':
        if (route.noteId) {
          // Validate note exists and isn't archived
          const notes = getNotes();
          const note = notes.find((n) => n.id === route.noteId && !n.archived);
          if (note) {
            setActiveItem({ type: 'note', id: route.noteId });
            setActiveSystemView(null);
          } else {
            // Invalid note - redirect to root
            window.history.replaceState({ flint: true }, '', '/');
          }
        }
        break;

      case 'system':
        if (route.systemView) {
          setActiveSystemView(route.systemView);
          setActiveItem(null);
        }
        break;

      case 'root':
      default:
        // Keep current state (restored from storage)
        break;
    }
  } finally {
    isUpdatingFromUrl = false;
  }
}

/**
 * Update URL to reflect current state
 */
function updateUrl(replace: boolean = false): void {
  if (!isWeb() || isUpdatingFromUrl || isUpdatingUrl) return;

  isUpdatingUrl = true;

  try {
    const newUrl = buildUrl();
    const currentUrl = window.location.pathname + window.location.search;

    if (newUrl !== currentUrl) {
      if (replace) {
        window.history.replaceState({ flint: true }, '', newUrl);
      } else {
        window.history.pushState({ flint: true }, '', newUrl);
      }
    }
  } finally {
    isUpdatingUrl = false;
  }
}

/**
 * Handle popstate event (back/forward navigation)
 */
function handlePopState(): void {
  const route = parseUrl(new SvelteURL(window.location.href));
  applyRoute(route);
}

/**
 * Initialize router - call once after state initialization
 * Returns cleanup function
 */
export function initializeRouter(): () => void {
  if (!isWeb()) {
    return () => {}; // No-op for Electron
  }

  // Handle initial URL
  const initialRoute = parseUrl(new SvelteURL(window.location.href));

  // If URL has a specific route, apply it (overrides storage)
  // If URL is root with no params, keep storage-restored state
  if (initialRoute.type !== 'root' || initialRoute.sidebar || initialRoute.panel) {
    applyRoute(initialRoute);
  } else {
    // Replace current URL with one reflecting restored state
    updateUrl(true);
  }

  // Mark initial history entry
  window.history.replaceState({ flint: true }, '', window.location.href);

  // Listen for back/forward
  window.addEventListener('popstate', handlePopState);

  return () => {
    window.removeEventListener('popstate', handlePopState);
  };
}

/**
 * Sync current state to URL
 * @param replace - If true, use replaceState (for UI state changes)
 */
export function syncUrlFromState(replace: boolean = false): void {
  updateUrl(replace);
}

/**
 * Check if we're currently updating from URL (to prevent circular updates)
 */
export function isNavigatingFromUrl(): boolean {
  return isUpdatingFromUrl;
}
