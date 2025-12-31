/**
 * Types for emoji data and search
 */

export interface EmojiItem {
  hexcode: string;
  emoji: string;
  label: string;
  tags: string[];
  group: number;
  subgroup: number;
  shortcodes: string[];
}

export interface EmojiCategory {
  id: number;
  name: string;
  icon: string;
  emojis: EmojiItem[];
}

export interface EmojiSearchResult {
  emoji: string;
  label: string;
  score: number;
}

/**
 * Category info from emojibase groups
 * Group 2 (components/skin tones) is excluded
 */
export const EMOJI_GROUPS: Record<number, { name: string; icon: string }> = {
  0: { name: 'Smileys & Emotion', icon: '😀' },
  1: { name: 'People & Body', icon: '👋' },
  // 2: components (skin tones) - skipped
  3: { name: 'Animals & Nature', icon: '🐵' },
  4: { name: 'Food & Drink', icon: '🍇' },
  5: { name: 'Travel & Places', icon: '🌍' },
  6: { name: 'Activities', icon: '🎃' },
  7: { name: 'Objects', icon: '👓' },
  8: { name: 'Symbols', icon: '🔣' },
  9: { name: 'Flags', icon: '🏁' }
};

/** Ordered list of group IDs to display (excludes components) */
export const EMOJI_GROUP_ORDER = [0, 1, 3, 4, 5, 6, 7, 8, 9];
