/**
 * Tests for WikilinkParser
 */

import { describe, it, expect } from 'vitest';
import { WikilinkParser } from '../../../src/server/core/wikilink-parser.js';

describe('WikilinkParser', () => {
  describe('isNoteId', () => {
    it('should return true for valid note IDs', () => {
      expect(WikilinkParser.isNoteId('n-12345678')).toBe(true);
      expect(WikilinkParser.isNoteId('n-abcdef12')).toBe(true);
      expect(WikilinkParser.isNoteId('n-00000000')).toBe(true);
      expect(WikilinkParser.isNoteId('n-ffffffff')).toBe(true);
    });

    it('should return false for invalid note IDs', () => {
      // Wrong prefix
      expect(WikilinkParser.isNoteId('m-12345678')).toBe(false);
      expect(WikilinkParser.isNoteId('note-12345678')).toBe(false);

      // Wrong length
      expect(WikilinkParser.isNoteId('n-1234567')).toBe(false); // Too short
      expect(WikilinkParser.isNoteId('n-123456789')).toBe(false); // Too long

      // Invalid characters
      expect(WikilinkParser.isNoteId('n-1234567g')).toBe(false); // 'g' not hex
      expect(WikilinkParser.isNoteId('n-ABCDEF12')).toBe(false); // Uppercase

      // No prefix
      expect(WikilinkParser.isNoteId('12345678')).toBe(false);

      // Missing dash
      expect(WikilinkParser.isNoteId('n12345678')).toBe(false);

      // Empty or invalid
      expect(WikilinkParser.isNoteId('')).toBe(false);
      expect(WikilinkParser.isNoteId('n-')).toBe(false);
    });
  });

  describe('createIdWikilink', () => {
    it('should create ID-based wikilink without display text', () => {
      expect(WikilinkParser.createIdWikilink('n-12345678')).toBe('[[n-12345678]]');
      expect(WikilinkParser.createIdWikilink('n-abcdef00')).toBe('[[n-abcdef00]]');
    });

    it('should create ID-based wikilink with display text', () => {
      expect(WikilinkParser.createIdWikilink('n-12345678', 'My Note')).toBe(
        '[[n-12345678|My Note]]'
      );
      expect(WikilinkParser.createIdWikilink('n-abcdef00', 'Daily Note')).toBe(
        '[[n-abcdef00|Daily Note]]'
      );
    });

    it('should handle empty display text', () => {
      expect(WikilinkParser.createIdWikilink('n-12345678', '')).toBe('[[n-12345678]]');
    });

    it('should throw error for invalid note ID', () => {
      expect(() => WikilinkParser.createIdWikilink('invalid-id')).toThrow(
        'Invalid note ID format'
      );
      expect(() => WikilinkParser.createIdWikilink('n-123')).toThrow(
        'Invalid note ID format'
      );
      expect(() => WikilinkParser.createIdWikilink('N-12345678')).toThrow(
        'Invalid note ID format'
      );
    });
  });

  describe('parseWikilinks - ID-based links', () => {
    it('should parse ID-based wikilink without display text', () => {
      const content = 'See [[n-12345678]] for details.';
      const result = WikilinkParser.parseWikilinks(content);

      expect(result.wikilinks).toHaveLength(1);
      expect(result.wikilinks[0]).toMatchObject({
        target: 'n-12345678',
        display: 'n-12345678',
        noteId: 'n-12345678',
        raw: '[[n-12345678]]'
      });
    });

    it('should parse ID-based wikilink with display text', () => {
      const content = 'See [[n-12345678|My Note Title]] for details.';
      const result = WikilinkParser.parseWikilinks(content);

      expect(result.wikilinks).toHaveLength(1);
      expect(result.wikilinks[0]).toMatchObject({
        target: 'n-12345678',
        display: 'My Note Title',
        noteId: 'n-12345678',
        raw: '[[n-12345678|My Note Title]]'
      });
    });

    it('should parse multiple ID-based wikilinks', () => {
      const content = 'See [[n-12345678|First]] and [[n-abcdef00|Second]] notes.';
      const result = WikilinkParser.parseWikilinks(content);

      expect(result.wikilinks).toHaveLength(2);
      expect(result.wikilinks[0]).toMatchObject({
        noteId: 'n-12345678',
        display: 'First'
      });
      expect(result.wikilinks[1]).toMatchObject({
        noteId: 'n-abcdef00',
        display: 'Second'
      });
    });

    it('should parse mix of ID-based and type/filename links', () => {
      const content = 'See [[n-12345678|ID Link]] and [[meeting/standup|Type Link]].';
      const result = WikilinkParser.parseWikilinks(content);

      expect(result.wikilinks).toHaveLength(2);

      // ID-based link
      expect(result.wikilinks[0]).toMatchObject({
        target: 'n-12345678',
        display: 'ID Link',
        noteId: 'n-12345678'
      });

      // Type/filename link
      expect(result.wikilinks[1]).toMatchObject({
        target: 'meeting/standup',
        display: 'Type Link',
        type: 'meeting',
        filename: 'standup'
      });
      expect(result.wikilinks[1].noteId).toBeUndefined();
    });

    it('should handle ID-based links with special characters in display', () => {
      const content = '[[n-12345678|Note: Meeting (2024-01-01)]]';
      const result = WikilinkParser.parseWikilinks(content);

      expect(result.wikilinks).toHaveLength(1);
      expect(result.wikilinks[0]).toMatchObject({
        noteId: 'n-12345678',
        display: 'Note: Meeting (2024-01-01)'
      });
    });
  });

  describe('replaceWikilinks - ID-based links', () => {
    it('should replace title-based link with ID-based link', () => {
      const content = 'See [[My Note]] for details.';
      const replacements = new Map([['My Note', '[[n-12345678|My Note]]']]);

      const result = WikilinkParser.replaceWikilinks(content, replacements);
      expect(result).toBe('See [[n-12345678|My Note]] for details.');
    });

    it('should replace multiple links', () => {
      const content = 'See [[First Note]] and [[Second Note]].';
      const replacements = new Map([
        ['First Note', '[[n-11111111|First Note]]'],
        ['Second Note', '[[n-22222222|Second Note]]']
      ]);

      const result = WikilinkParser.replaceWikilinks(content, replacements);
      expect(result).toBe(
        'See [[n-11111111|First Note]] and [[n-22222222|Second Note]].'
      );
    });

    it('should handle type/filename to ID-based conversion', () => {
      const content = 'See [[meeting/standup]] for details.';
      const replacements = new Map([
        ['meeting/standup', '[[n-12345678|meeting/standup]]']
      ]);

      const result = WikilinkParser.replaceWikilinks(content, replacements);
      expect(result).toBe('See [[n-12345678|meeting/standup]] for details.');
    });

    it('should preserve links not in replacement map', () => {
      const content = 'See [[Link A]] and [[Link B]].';
      const replacements = new Map([['Link A', '[[n-11111111|Link A]]']]);

      const result = WikilinkParser.replaceWikilinks(content, replacements);
      expect(result).toBe('See [[n-11111111|Link A]] and [[Link B]].');
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', () => {
      const result = WikilinkParser.parseWikilinks('');
      expect(result.wikilinks).toHaveLength(0);
      expect(result.content).toBe('');
    });

    it('should handle content without links', () => {
      const content = 'This is plain text without any links.';
      const result = WikilinkParser.parseWikilinks(content);
      expect(result.wikilinks).toHaveLength(0);
      expect(result.content).toBe(content);
    });

    it('should handle malformed ID-based links', () => {
      // These should not be parsed as ID-based links
      const content = '[[n-123]] [[n-XXXXXXXX]] [[note-12345678]]';
      const result = WikilinkParser.parseWikilinks(content);

      // They might be parsed as regular links, but not as ID-based
      for (const link of result.wikilinks) {
        expect(link.noteId).toBeUndefined();
      }
    });
  });
});
