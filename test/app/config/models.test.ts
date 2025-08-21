import { describe, it, expect } from 'vitest';
import {
  getModelById,
  getModelsByProvider,
  SUPPORTED_MODELS,
  DEFAULT_MODEL
} from '../../../src/renderer/src/config/models';

describe('models config', () => {
  describe('getModelById', () => {
    it('should return correct model for valid ID', () => {
      const model = getModelById('anthropic/claude-sonnet-4');

      expect(model).toBeDefined();
      expect(model?.id).toBe('anthropic/claude-sonnet-4');
      expect(model?.name).toBe('Claude 4 Sonnet');
      expect(model?.provider).toBe('Anthropic');
    });

    it('should return undefined for invalid ID', () => {
      const model = getModelById('invalid/model');
      expect(model).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      const model = getModelById('');
      expect(model).toBeUndefined();
    });

    it('should be case sensitive', () => {
      const model = getModelById('ANTHROPIC/CLAUDE-SONNET-4');
      expect(model).toBeUndefined();
    });
  });

  describe('getModelsByProvider', () => {
    it('should group models by provider', () => {
      const modelsByProvider = getModelsByProvider();

      expect(modelsByProvider).toHaveProperty('Anthropic');
      expect(Array.isArray(modelsByProvider.Anthropic)).toBe(true);
    });

    it('should contain all models correctly grouped', () => {
      const modelsByProvider = getModelsByProvider();
      const allModels = Object.values(modelsByProvider).flat();

      expect(allModels.length).toBeGreaterThan(0);
      expect(allModels.every((model) => typeof model.provider === 'string')).toBe(true);
    });

    it('should contain all Anthropic models', () => {
      const modelsByProvider = getModelsByProvider();
      const anthropicModels = modelsByProvider.Anthropic;

      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels.every((model) => model.provider === 'Anthropic')).toBe(true);
    });

    it('should maintain model integrity', () => {
      const modelsByProvider = getModelsByProvider();
      const allGroupedModels = Object.values(modelsByProvider).flat();

      expect(allGroupedModels.length).toBe(SUPPORTED_MODELS.length);

      // Check that all models have required properties
      allGroupedModels.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('icon');
        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
        expect(typeof model.provider).toBe('string');
        expect(typeof model.icon).toBe('string');
      });
    });
  });

  describe('SUPPORTED_MODELS', () => {
    it('should contain at least one model', () => {
      expect(SUPPORTED_MODELS.length).toBeGreaterThan(0);
    });

    it('should have unique model IDs', () => {
      const ids = SUPPORTED_MODELS.map((model) => model.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have all required properties', () => {
      SUPPORTED_MODELS.forEach((model) => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('icon');

        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
        expect(typeof model.provider).toBe('string');
        expect(typeof model.icon).toBe('string');

        expect(model.id.length).toBeGreaterThan(0);
        expect(model.name.length).toBeGreaterThan(0);
        expect(model.provider.length).toBeGreaterThan(0);
        expect(model.icon.length).toBeGreaterThan(0);
      });
    });

    it('should have valid cost information when provided', () => {
      SUPPORTED_MODELS.forEach((model) => {
        if (model.costPerMTokens) {
          expect(typeof model.costPerMTokens.input).toBe('number');
          expect(typeof model.costPerMTokens.output).toBe('number');
          expect(model.costPerMTokens.input).toBeGreaterThan(0);
          expect(model.costPerMTokens.output).toBeGreaterThan(0);

          if (model.costPerMTokens.cached !== undefined) {
            expect(typeof model.costPerMTokens.cached).toBe('number');
            expect(model.costPerMTokens.cached).toBeGreaterThanOrEqual(0);
          }
        }
      });
    });

    it('should have valid context lengths when provided', () => {
      SUPPORTED_MODELS.forEach((model) => {
        if (model.contextLength !== undefined) {
          expect(typeof model.contextLength).toBe('number');
          expect(model.contextLength).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('DEFAULT_MODEL', () => {
    it('should be a valid model ID', () => {
      const defaultModel = getModelById(DEFAULT_MODEL);
      expect(defaultModel).toBeDefined();
      expect(defaultModel?.id).toBe(DEFAULT_MODEL);
    });

    it('should be a string', () => {
      expect(typeof DEFAULT_MODEL).toBe('string');
      expect(DEFAULT_MODEL.length).toBeGreaterThan(0);
    });
  });

  describe('model data integrity', () => {
    it('should follow consistent ID format', () => {
      SUPPORTED_MODELS.forEach((model) => {
        expect(model.id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
      });
    });

    it('should have consistent provider names', () => {
      const providers = [...new Set(SUPPORTED_MODELS.map((model) => model.provider))];

      providers.forEach((provider) => {
        // Provider names should be properly capitalized
        expect(provider).toMatch(/^[A-Z][a-zA-Z]*$/);
      });
    });

    it('should have reasonable cost relationships', () => {
      SUPPORTED_MODELS.forEach((model) => {
        if (model.costPerMTokens) {
          // Output tokens should generally cost more than input tokens
          expect(model.costPerMTokens.output).toBeGreaterThanOrEqual(
            model.costPerMTokens.input
          );

          // Cached tokens should cost less than or equal to input tokens
          if (model.costPerMTokens.cached !== undefined) {
            expect(model.costPerMTokens.cached).toBeLessThanOrEqual(
              model.costPerMTokens.input
            );
          }
        }
      });
    });
  });
});
