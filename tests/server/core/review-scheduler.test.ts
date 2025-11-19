/**
 * Review Scheduler Tests
 *
 * Tests for the session-based spaced engagement scheduling algorithm
 */

import { describe, it, expect } from 'vitest';
import {
  calculateNextSession,
  estimateSessionDate,
  getNextReviewDate,
  createReviewHistoryEntry,
  parseReviewHistory,
  serializeReviewHistory,
  DEFAULT_SCHEDULING_CONFIG,
  RATING_MULTIPLIERS
} from '../../../src/server/core/review-scheduler.js';

describe('Review Scheduler', () => {
  describe('calculateNextSession', () => {
    it('should schedule closer with rating 1 (Need more time)', () => {
      const result = calculateNextSession(10, 4, 1);

      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        // 4 * 0.5 = 2
        expect(result.interval).toBe(2);
        expect(result.nextSession).toBe(12);
      }
    });

    it('should schedule further with rating 2 (Productive)', () => {
      const result = calculateNextSession(10, 4, 2);

      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        // 4 * 1.5 = 6
        expect(result.interval).toBe(6);
        expect(result.nextSession).toBe(16);
      }
    });

    it('should schedule much further with rating 3 (Already familiar)', () => {
      const result = calculateNextSession(10, 4, 3);

      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        // 4 * 2.5 = 10
        expect(result.interval).toBe(10);
        expect(result.nextSession).toBe(20);
      }
    });

    it('should retire note with rating 4 (Fully processed)', () => {
      const result = calculateNextSession(10, 4, 4);
      expect(result).toBe('retired');
    });

    it('should respect minimum interval of 1', () => {
      // With interval 1 and rating 1 (0.5x), should get at least 1
      const result = calculateNextSession(10, 1, 1);

      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        expect(result.interval).toBe(1);
        expect(result.nextSession).toBe(11);
      }
    });

    it('should cap interval at maxIntervalSessions', () => {
      const config = { ...DEFAULT_SCHEDULING_CONFIG, maxIntervalSessions: 10 };
      const result = calculateNextSession(10, 20, 3, config);

      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        // 20 * 2.5 = 50, but capped at 10
        expect(result.interval).toBe(10);
        expect(result.nextSession).toBe(20);
      }
    });

    it('should use default config when not provided', () => {
      const result = calculateNextSession(1, 1, 2);
      expect(result).not.toBe('retired');
    });
  });

  describe('estimateSessionDate', () => {
    it('should estimate date based on sessions per week', () => {
      const baseDate = new Date('2025-01-01T12:00:00Z');
      // 7 sessions away with 7 sessions per week = 1 week = 7 days
      const date = estimateSessionDate(8, 1, 7, baseDate);

      expect(date.toISOString().split('T')[0]).toBe('2025-01-08');
    });

    it('should handle fractional weeks', () => {
      const baseDate = new Date('2025-01-01T12:00:00Z');
      // 3 sessions away with 7 sessions per week = ~3 days
      const date = estimateSessionDate(4, 1, 7, baseDate);

      expect(date.toISOString().split('T')[0]).toBe('2025-01-04');
    });

    it('should use current date when baseDate not provided', () => {
      const date = estimateSessionDate(8, 1, 7);
      expect(date).toBeInstanceOf(Date);
      expect(date.getTime()).toBeGreaterThan(Date.now() - 1000);
    });
  });

  describe('getNextReviewDate', () => {
    it('should return date string for ratings 1-3', () => {
      const baseDate = new Date('2025-01-01T12:00:00Z');
      const date = getNextReviewDate(2, 4, 10, DEFAULT_SCHEDULING_CONFIG, baseDate);

      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return far future date for retired items', () => {
      const baseDate = new Date('2025-01-01T12:00:00Z');
      const date = getNextReviewDate(4, 4, 10, DEFAULT_SCHEDULING_CONFIG, baseDate);

      expect(date).toBe('9999-12-31');
    });
  });

  describe('createReviewHistoryEntry', () => {
    it('should create entry with rating', () => {
      const entry = createReviewHistoryEntry(5, 2, 'My response', 'The prompt');

      expect(entry.sessionNumber).toBe(5);
      expect(entry.rating).toBe(2);
      expect(entry.response).toBe('My response');
      expect(entry.prompt).toBe('The prompt');
      expect(entry.date).toBeDefined();
    });

    it('should include feedback when provided', () => {
      const entry = createReviewHistoryEntry(5, 3, 'Response', 'Prompt', 'AI feedback');
      expect(entry.feedback).toBe('AI feedback');
    });

    it('should omit optional fields when not provided', () => {
      const entry = createReviewHistoryEntry(5, 1);

      expect(entry.response).toBeUndefined();
      expect(entry.prompt).toBeUndefined();
      expect(entry.feedback).toBeUndefined();
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

      it('should parse valid JSON history with ratings', () => {
        const json = JSON.stringify([
          { date: '2025-01-01T10:00:00Z', rating: 2, sessionNumber: 1 },
          {
            date: '2025-01-08T10:00:00Z',
            rating: 1,
            sessionNumber: 2,
            response: 'Some response'
          }
        ]);

        const history = parseReviewHistory(json);

        expect(history.length).toBe(2);
        expect(history[0].rating).toBe(2);
        expect(history[1].rating).toBe(1);
        expect(history[1].response).toBe('Some response');
      });

      it('should handle legacy passed/failed format', () => {
        const json = JSON.stringify([
          { date: '2025-01-01T10:00:00Z', passed: true },
          { date: '2025-01-08T10:00:00Z', passed: false }
        ]);

        const history = parseReviewHistory(json);

        // Should convert passed to rating
        expect(history.length).toBe(2);
        expect(history[0].rating).toBe(2); // passed -> 2
        expect(history[1].rating).toBe(1); // failed -> 1
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
          { date: '2025-01-01T10:00:00Z', rating: 2 as const, sessionNumber: 1 },
          { date: '2025-01-08T10:00:00Z', rating: 1 as const, sessionNumber: 2 }
        ];

        const formatted = serializeReviewHistory(history);
        expect(formatted).toBeTruthy();

        const parsed = JSON.parse(formatted);
        expect(parsed.length).toBe(2);
        expect(parsed[0].rating).toBe(2);
        expect(parsed[1].rating).toBe(1);
      });
    });
  });

  describe('rating multipliers', () => {
    it('should have correct multiplier values', () => {
      expect(RATING_MULTIPLIERS[1]).toBe(0.5);
      expect(RATING_MULTIPLIERS[2]).toBe(1.5);
      expect(RATING_MULTIPLIERS[3]).toBe(2.5);
    });

    it('should apply multipliers correctly to intervals', () => {
      const baseInterval = 4;

      // Rating 1: closer review
      const result1 = calculateNextSession(10, baseInterval, 1);
      expect(result1).not.toBe('retired');
      if (result1 !== 'retired') {
        expect(result1.interval).toBe(Math.round(baseInterval * 0.5));
      }

      // Rating 2: standard progression
      const result2 = calculateNextSession(10, baseInterval, 2);
      expect(result2).not.toBe('retired');
      if (result2 !== 'retired') {
        expect(result2.interval).toBe(Math.round(baseInterval * 1.5));
      }

      // Rating 3: faster progression
      const result3 = calculateNextSession(10, baseInterval, 3);
      expect(result3).not.toBe('retired');
      if (result3 !== 'retired') {
        expect(result3.interval).toBe(Math.round(baseInterval * 2.5));
      }
    });
  });

  describe('scheduling edge cases', () => {
    it('should handle session 0 correctly', () => {
      const result = calculateNextSession(0, 1, 2);
      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        expect(result.nextSession).toBe(2); // 0 + round(1 * 1.5) = 2
      }
    });

    it('should round intervals to whole numbers', () => {
      // 3 * 1.5 = 4.5 -> 5
      const result = calculateNextSession(10, 3, 2);
      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        expect(result.interval).toBe(5);
      }
    });

    it('should handle large intervals without overflow', () => {
      const config = { ...DEFAULT_SCHEDULING_CONFIG, maxIntervalSessions: 1000 };
      const result = calculateNextSession(10, 100, 3, config);
      expect(result).not.toBe('retired');
      if (result !== 'retired') {
        expect(result.interval).toBe(250); // 100 * 2.5
      }
    });
  });
});
