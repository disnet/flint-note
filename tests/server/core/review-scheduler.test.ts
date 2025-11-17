/**
 * Review Scheduler Tests
 *
 * Tests for the spaced repetition scheduling algorithm
 */

import { describe, it, expect } from 'vitest';
import {
  getNextReviewDate,
  appendToReviewHistory,
  parseReviewHistory,
  serializeReviewHistory
} from '../../../src/server/core/review-scheduler.js';

describe('Review Scheduler', () => {
  describe('getNextReviewDate', () => {
    it('should return 7 days from now when review passed', () => {
      const baseDate = new Date('2025-01-01T12:00:00Z');
      const nextReview = getNextReviewDate(true, baseDate);

      expect(nextReview).toBe('2025-01-08');
    });

    it('should return 1 day from now when review failed', () => {
      const baseDate = new Date('2025-01-01T12:00:00Z');
      const nextReview = getNextReviewDate(false, baseDate);

      expect(nextReview).toBe('2025-01-02');
    });

    it('should use current date when baseDate not provided', () => {
      const beforeCall = new Date();
      beforeCall.setHours(0, 0, 0, 0); // Normalize to start of day

      const nextReview = getNextReviewDate(true);

      const afterCall = new Date();
      afterCall.setHours(23, 59, 59, 999); // Normalize to end of day

      // Should be 7 days from today
      const expectedMin = new Date(beforeCall);
      expectedMin.setDate(expectedMin.getDate() + 7);
      const expectedMax = new Date(afterCall);
      expectedMax.setDate(expectedMax.getDate() + 7);

      const minDate = expectedMin.toISOString().split('T')[0];
      const maxDate = expectedMax.toISOString().split('T')[0];

      expect(nextReview >= minDate).toBe(true);
      expect(nextReview <= maxDate).toBe(true);
    });

    it('should return date in YYYY-MM-DD format', () => {
      const baseDate = new Date('2025-01-15T12:00:00Z');
      const nextReview = getNextReviewDate(true, baseDate);

      expect(nextReview).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(nextReview).toBe('2025-01-22');
    });

    it('should handle month boundaries correctly', () => {
      const baseDate = new Date('2025-01-31T12:00:00Z');
      const nextReview = getNextReviewDate(true, baseDate);

      expect(nextReview).toBe('2025-02-07');
    });

    it('should handle year boundaries correctly', () => {
      const baseDate = new Date('2024-12-30T12:00:00Z');
      const nextReview = getNextReviewDate(true, baseDate);

      expect(nextReview).toBe('2025-01-06');
    });

    it('should handle leap year correctly', () => {
      const baseDate = new Date('2024-02-28T12:00:00Z');
      const nextReview = getNextReviewDate(true, baseDate);

      expect(nextReview).toBe('2024-03-06');
    });
  });

  describe('review history management', () => {
    describe('parseReviewHistory', () => {
      it('should parse null as empty array', () => {
        const history = parseReviewHistory(null);
        expect(history).toEqual([]);
      });

      it('should parse empty string as empty array', () => {
        const history = parseReviewHistory('');
        expect(history).toEqual([]);
      });

      it('should parse valid JSON history', () => {
        const json = JSON.stringify([
          { timestamp: '2025-01-01T10:00:00Z', passed: true },
          {
            timestamp: '2025-01-08T10:00:00Z',
            passed: false,
            userResponse: 'Some response'
          }
        ]);

        const history = parseReviewHistory(json);

        expect(history.length).toBe(2);
        expect(history[0].passed).toBe(true);
        expect(history[1].passed).toBe(false);
        expect(history[1].userResponse).toBe('Some response');
      });

      it('should return empty array for invalid JSON', () => {
        const history = parseReviewHistory('invalid json');
        expect(history).toEqual([]);
      });

      it('should return empty array for non-array JSON', () => {
        const history = parseReviewHistory('{"not": "array"}');
        expect(history).toEqual([]);
      });
    });

    describe('serializeReviewHistory', () => {
      it('should format empty array as empty JSON array', () => {
        const formatted = serializeReviewHistory([]);
        expect(formatted).toBe('[]');
      });

      it('should format history entries as JSON string', () => {
        const history = [
          { date: '2025-01-01T10:00:00Z', passed: true },
          { date: '2025-01-08T10:00:00Z', passed: false }
        ];

        const formatted = serializeReviewHistory(history);
        expect(formatted).toBeTruthy();

        const parsed = JSON.parse(formatted);
        expect(parsed.length).toBe(2);
        expect(parsed[0].passed).toBe(true);
        expect(parsed[1].passed).toBe(false);
      });
    });

    describe('appendToReviewHistory', () => {
      it('should create new history from null', () => {
        const updated = appendToReviewHistory(null, true);

        const history = parseReviewHistory(updated);
        expect(history.length).toBe(1);
        expect(history[0].passed).toBe(true);
        expect(history[0].date).toBeDefined();
      });

      it('should append to existing history', () => {
        const existing = JSON.stringify([{ date: '2025-01-01T10:00:00Z', passed: true }]);

        const updated = appendToReviewHistory(existing, false, 'User response');

        const history = parseReviewHistory(updated);
        expect(history.length).toBe(2);
        expect(history[0].passed).toBe(true);
        expect(history[1].passed).toBe(false);
        expect(history[1].response).toBe('User response');
      });

      it('should include response when provided', () => {
        const updated = appendToReviewHistory(null, true, 'My thoughts on this note');

        const history = parseReviewHistory(updated);
        expect(history[0].response).toBe('My thoughts on this note');
      });

      it('should omit response when not provided', () => {
        const updated = appendToReviewHistory(null, false);

        const history = parseReviewHistory(updated);
        expect(history[0].response).toBeUndefined();
      });

      it('should add date timestamp to new entry', () => {
        const beforeTime = new Date().toISOString();
        const updated = appendToReviewHistory(null, true);
        const afterTime = new Date().toISOString();

        const history = parseReviewHistory(updated);
        expect(history[0].date).toBeDefined();
        expect(history[0].date >= beforeTime).toBe(true);
        expect(history[0].date <= afterTime).toBe(true);
      });

      it('should maintain chronological order', async () => {
        let history = appendToReviewHistory(null, true);

        // Wait a tiny bit to ensure different timestamps
        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        await wait(10);
        history = appendToReviewHistory(history, false);
        await wait(10);
        history = appendToReviewHistory(history, true);

        const parsed = parseReviewHistory(history);
        expect(parsed.length).toBe(3);
        expect(parsed[0].date < parsed[1].date).toBe(true);
        expect(parsed[1].date < parsed[2].date).toBe(true);
      });

      it('should handle invalid existing history gracefully', () => {
        const updated = appendToReviewHistory('invalid json', true);

        const history = parseReviewHistory(updated);
        expect(history.length).toBe(1);
        expect(history[0].passed).toBe(true);
      });

      it('should include prompt when provided', () => {
        const prompt = 'How does this concept relate to your current project?';
        const updated = appendToReviewHistory(null, true, 'My response', prompt);

        const history = parseReviewHistory(updated);
        expect(history[0].prompt).toBe(prompt);
      });

      it('should omit prompt when not provided', () => {
        const updated = appendToReviewHistory(null, false, 'My response');

        const history = parseReviewHistory(updated);
        expect(history[0].prompt).toBeUndefined();
      });

      it('should store both prompt and response', () => {
        const prompt = 'Explain this concept in your own words';
        const response = 'Here is my explanation...';
        const updated = appendToReviewHistory(null, true, response, prompt);

        const history = parseReviewHistory(updated);
        expect(history[0].prompt).toBe(prompt);
        expect(history[0].response).toBe(response);
        expect(history[0].passed).toBe(true);
      });

      it('should maintain prompts when appending multiple entries', async () => {
        let history = appendToReviewHistory(null, true, 'First response', 'First prompt');

        const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
        await wait(10);

        history = appendToReviewHistory(
          history,
          false,
          'Second response',
          'Second prompt'
        );

        const parsed = parseReviewHistory(history);
        expect(parsed.length).toBe(2);
        expect(parsed[0].prompt).toBe('First prompt');
        expect(parsed[1].prompt).toBe('Second prompt');
      });
    });
  });

  describe('binary scheduling algorithm', () => {
    it('should consistently schedule pass reviews at 7 days', () => {
      const baseDates = [
        new Date('2025-01-01'),
        new Date('2025-06-15'),
        new Date('2025-12-31')
      ];

      for (const base of baseDates) {
        const nextReview = getNextReviewDate(true, base);
        const expected = new Date(base);
        expected.setDate(expected.getDate() + 7);
        expect(nextReview).toBe(expected.toISOString().split('T')[0]);
      }
    });

    it('should consistently schedule fail reviews at 1 day', () => {
      const baseDates = [
        new Date('2025-01-01'),
        new Date('2025-06-15'),
        new Date('2025-12-31')
      ];

      for (const base of baseDates) {
        const nextReview = getNextReviewDate(false, base);
        const expected = new Date(base);
        expected.setDate(expected.getDate() + 1);
        expect(nextReview).toBe(expected.toISOString().split('T')[0]);
      }
    });

    it('should not consider review history (simple binary algorithm)', () => {
      // The algorithm doesn't use review history - it's purely binary
      // This test documents that behavior

      const base = new Date('2025-01-01');

      // Multiple passes still schedule 7 days out
      const pass1 = getNextReviewDate(true, base);
      const pass2 = getNextReviewDate(true, base);
      expect(pass1).toBe(pass2);

      // Multiple fails still schedule 1 day out
      const fail1 = getNextReviewDate(false, base);
      const fail2 = getNextReviewDate(false, base);
      expect(fail1).toBe(fail2);
    });
  });
});
