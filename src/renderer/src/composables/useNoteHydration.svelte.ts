import type { NoteMetadata } from '../services/noteStore.svelte';

interface HydrationSource {
  id: string;
  [key: string]: unknown;
}

interface HydrationOptions<T extends HydrationSource> {
  sources: T[];
  notes: NoteMetadata[];
  getSourceId: (source: T) => string;
  isLoading: boolean;
  isReady: boolean;
  onMissing?: (source: T) => void;
}

interface HydratedItem<T> extends HydrationSource {
  note?: NoteMetadata;
  title: string;
  type?: string;
}

/**
 * Hydrate note IDs with metadata from notesStore
 * Returns items with note metadata attached
 */
export function useNoteHydration<T extends HydrationSource>(
  options: HydrationOptions<T>
): HydratedItem<T>[] {
  const { sources, notes, getSourceId, isLoading, isReady, onMissing } = options;

  return $derived(
    sources.map((source) => {
      const noteId = getSourceId(source);
      const note = notes.find((n) => n.id === noteId);

      if (!note && !isLoading && isReady && onMissing) {
        onMissing(source);
      }

      return {
        ...source,
        note,
        title: note?.title || '',
        type: note?.type
      } as HydratedItem<T>;
    })
  );
}
