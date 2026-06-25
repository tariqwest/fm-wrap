import { describe, it, expect } from 'vitest';
import {
  FmModelSchema,
  RespondOptionsSchema,
  RespondResultSchema,
  ChatSessionOptionsSchema,
  ModelAvailabilitySchema,
  QuotaUsageSchema,
  TokenCountOptionsSchema,
  TokenCountResultSchema,
} from './types.js';

describe('Core Zod Schemas', () => {
  describe('FmModelSchema', () => {
    it('accepts valid models', () => {
      expect(FmModelSchema.parse('system')).toBe('system');
      expect(FmModelSchema.parse('pcc')).toBe('pcc');
    });

    it('rejects invalid models', () => {
      expect(() => FmModelSchema.parse('gpt-4')).toThrow();
      expect(() => FmModelSchema.parse('')).toThrow();
    });
  });

  describe('RespondOptionsSchema', () => {
    it('accepts empty options', () => {
      expect(RespondOptionsSchema.parse({})).toEqual({});
    });

    it('accepts full options', () => {
      const opts = {
        model: 'pcc',
        instructions: 'Be concise',
        stream: true,
        greedy: false,
        image: '/path/to/img.jpg',
        schema: { name: 'Person', properties: {} },
        transcript: '/path/to/transcript.json',
        saveTranscript: 'my-session',
        useCase: 'content-tagging',
        guardrails: 'permissive-content-transformations',
      };
      const result = RespondOptionsSchema.parse(opts);
      expect(result.model).toBe('pcc');
      expect(result.stream).toBe(true);
      expect(result.useCase).toBe('content-tagging');
    });

    it('accepts schema as string path', () => {
      const result = RespondOptionsSchema.parse({ schema: '/path/to/schema.json' });
      expect(result.schema).toBe('/path/to/schema.json');
    });

    it('rejects invalid model in options', () => {
      expect(() => RespondOptionsSchema.parse({ model: 'invalid' })).toThrow();
    });
  });

  describe('RespondResultSchema', () => {
    it('validates a result', () => {
      const result = RespondResultSchema.parse({ text: 'Hello world' });
      expect(result.text).toBe('Hello world');
    });

    it('rejects missing text', () => {
      expect(() => RespondResultSchema.parse({})).toThrow();
    });
  });

  describe('ChatSessionOptionsSchema', () => {
    it('accepts valid options', () => {
      const result = ChatSessionOptionsSchema.parse({
        model: 'system',
        instructions: 'You are helpful',
        resume: 'my-session',
      });
      expect(result.model).toBe('system');
      expect(result.resume).toBe('my-session');
    });
  });

  describe('ModelAvailabilitySchema', () => {
    it('validates availability', () => {
      const result = ModelAvailabilitySchema.parse({ model: 'pcc', available: true });
      expect(result.available).toBe(true);
    });

    it('rejects missing fields', () => {
      expect(() => ModelAvailabilitySchema.parse({ model: 'pcc' })).toThrow();
    });
  });

  describe('QuotaUsageSchema', () => {
    it('validates quota', () => {
      const result = QuotaUsageSchema.parse({ model: 'pcc', usage: '50/100 requests' });
      expect(result.usage).toBe('50/100 requests');
    });
  });

  describe('TokenCountOptionsSchema', () => {
    it('accepts empty options', () => {
      expect(TokenCountOptionsSchema.parse({})).toEqual({});
    });

    it('accepts full options', () => {
      const result = TokenCountOptionsSchema.parse({
        instructions: 'Be concise',
        image: '/img.png',
        transcript: '/transcript.json',
      });
      expect(result.instructions).toBe('Be concise');
    });
  });

  describe('TokenCountResultSchema', () => {
    it('validates count', () => {
      const result = TokenCountResultSchema.parse({ count: 42 });
      expect(result.count).toBe(42);
    });

    it('rejects negative count', () => {
      expect(() => TokenCountResultSchema.parse({ count: -1 })).toThrow();
    });

    it('rejects non-integer', () => {
      expect(() => TokenCountResultSchema.parse({ count: 3.5 })).toThrow();
    });
  });
});
