/**
 * Emoji data loader and search index using MiniSearch
 *
 * Features:
 * - Lazy loading of emojibase data on first use
 * - Full-text fuzzy search with MiniSearch
 * - Category-based emoji browsing
 */

import MiniSearch from 'minisearch';
import type { EmojiItem, EmojiCategory, EmojiSearchResult } from './types';
import { EMOJI_GROUPS, EMOJI_GROUP_ORDER } from './types';

interface IndexedEmoji {
  id: string;
  emoji: string;
  label: string;
  tags: string;
  shortcodes: string;
  group: number;
}

interface RawEmojiData {
  hexcode: string;
  emoji: string;
  label: string;
  tags?: string[];
  group?: number;
  subgroup?: number;
}

class EmojiDataManager {
  private miniSearch: MiniSearch<IndexedEmoji>;
  private emojis: EmojiItem[] = [];
  private emojiByHexcode: Record<string, EmojiItem> = {};
  private categorizedEmojis: EmojiCategory[] = [];
  private _isLoaded = $state(false);
  private _isLoading = $state(false);
  private loadPromise: Promise<void> | null = null;

  constructor() {
    this.miniSearch = new MiniSearch<IndexedEmoji>({
      fields: ['label', 'tags', 'shortcodes'],
      storeFields: ['id', 'emoji', 'label'],
      searchOptions: {
        boost: { label: 2, shortcodes: 1.5, tags: 1 },
        fuzzy: 0.2,
        prefix: true
      }
    });
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  /**
   * Load emoji data and build search index
   * Safe to call multiple times - will only load once
   */
  async load(): Promise<void> {
    if (this._isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this._isLoading = true;

    this.loadPromise = this.loadData();
    try {
      await this.loadPromise;
    } finally {
      this._isLoading = false;
    }
  }

  private async loadData(): Promise<void> {
    // Dynamic imports for code splitting
    const [dataModule, shortcodesModule] = await Promise.all([
      import('emojibase-data/en/data.json'),
      import('emojibase-data/en/shortcodes/github.json')
    ]);

    const rawData: RawEmojiData[] = dataModule.default;
    const shortcodes: Record<string, string | string[]> = shortcodesModule.default;

    // Process and index emojis
    const indexItems: IndexedEmoji[] = [];

    for (const raw of rawData) {
      // Skip emojis without a group (regional indicators, etc) or component emojis (group 2)
      if (raw.group === undefined || raw.group === 2) continue;

      // Get shortcodes for this emoji
      const emojiShortcodes = shortcodes[raw.hexcode];
      const shortcodeArray = emojiShortcodes
        ? Array.isArray(emojiShortcodes)
          ? emojiShortcodes
          : [emojiShortcodes]
        : [];

      const item: EmojiItem = {
        hexcode: raw.hexcode,
        emoji: raw.emoji,
        label: raw.label,
        tags: raw.tags || [],
        group: raw.group,
        subgroup: raw.subgroup ?? 0,
        shortcodes: shortcodeArray
      };

      this.emojis.push(item);
      this.emojiByHexcode[raw.hexcode] = item;

      // Add to search index
      indexItems.push({
        id: raw.hexcode,
        emoji: raw.emoji,
        label: raw.label,
        tags: (raw.tags || []).join(' '),
        shortcodes: shortcodeArray.join(' '),
        group: raw.group
      });
    }

    // Bulk add to index for efficiency
    this.miniSearch.addAll(indexItems);

    // Build categorized list
    this.buildCategories();

    this._isLoaded = true;
  }

  private buildCategories(): void {
    const categoryMap: Record<number, EmojiItem[]> = {};

    // Group emojis by category
    for (const emoji of this.emojis) {
      if (!categoryMap[emoji.group]) {
        categoryMap[emoji.group] = [];
      }
      categoryMap[emoji.group].push(emoji);
    }

    // Build ordered category list
    this.categorizedEmojis = EMOJI_GROUP_ORDER.filter(
      (groupId) => categoryMap[groupId] !== undefined
    ).map((groupId) => ({
      id: groupId,
      name: EMOJI_GROUPS[groupId]?.name || `Group ${groupId}`,
      icon: EMOJI_GROUPS[groupId]?.icon || '❓',
      emojis: categoryMap[groupId] || []
    }));
  }

  /**
   * Search for emojis
   */
  search(query: string, limit = 50): EmojiSearchResult[] {
    if (!query.trim() || !this._isLoaded) return [];

    const results = this.miniSearch.search(query, {
      fuzzy: 0.2,
      prefix: true
    });

    const searchResults: EmojiSearchResult[] = [];
    for (const r of results) {
      // Look up emoji from our data by hexcode (the id)
      const emojiItem = this.emojiByHexcode[r.id];
      if (emojiItem) {
        searchResults.push({
          emoji: emojiItem.emoji,
          label: emojiItem.label,
          score: r.score
        });
      }
      if (searchResults.length >= limit) break;
    }
    return searchResults;
  }

  /**
   * Get all emojis organized by category
   */
  getCategories(): EmojiCategory[] {
    return this.categorizedEmojis;
  }

  /**
   * Get emojis for a specific category
   */
  getCategoryEmojis(groupId: number): EmojiItem[] {
    return this.emojis.filter((e) => e.group === groupId);
  }
}

// Singleton instance
export const emojiData = new EmojiDataManager();
