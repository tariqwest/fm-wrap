import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Mock the core module
vi.mock('../../core/index.js', () => ({
  respond: vi.fn(),
  createChatSession: vi.fn(),
  closeChatSession: vi.fn(),
  getAvailableModels: vi.fn(),
  getQuotaUsage: vi.fn(),
  countTokens: vi.fn(),
}));

import {
  respond,
  createChatSession,
  closeChatSession,
  getAvailableModels,
  getQuotaUsage,
  countTokens,
} from '../../core/index.js';
import { nativeRoutes } from './native.js';

const mockRespond = vi.mocked(respond);
const mockCreateChatSession = vi.mocked(createChatSession);
const mockCloseChatSession = vi.mocked(closeChatSession);
const mockGetAvailableModels = vi.mocked(getAvailableModels);
const mockGetQuotaUsage = vi.mocked(getQuotaUsage);
const mockCountTokens = vi.mocked(countTokens);

function createApp() {
  const app = new Hono();
  app.route('/', nativeRoutes);
  return app;
}

async function json(res: Response) {
  return res.json();
}

describe('Native Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await createApp().request('/health');
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ status: 'ok' });
    });
  });

  describe('POST /fm/respond', () => {
    it('returns response from core respond()', async () => {
      mockRespond.mockResolvedValue({ text: 'Swift is a language' });
      const res = await createApp().request('/fm/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'What is Swift?' }),
      });

      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ text: 'Swift is a language' });
      expect(mockRespond).toHaveBeenCalledWith('What is Swift?', expect.objectContaining({}));
    });

    it('passes options through', async () => {
      mockRespond.mockResolvedValue({ text: 'Response' });
      await createApp().request('/fm/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hi', model: 'pcc', instructions: 'Be brief', greedy: true }),
      });

      expect(mockRespond).toHaveBeenCalledWith('Hi', expect.objectContaining({
        model: 'pcc',
        instructions: 'Be brief',
        greedy: true,
      }));
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await createApp().request('/fm/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBeDefined();
    });

    it('returns 500 on core error', async () => {
      mockRespond.mockRejectedValue(new Error('Model unavailable'));
      const res = await createApp().request('/fm/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hello' }),
      });
      expect(res.status).toBe(500);
      expect((await json(res)).error).toBe('Model unavailable');
    });
  });

  describe('POST /fm/chat', () => {
    it('creates a new session and returns response', async () => {
      const mockSession = {
        id: 'session-123',
        send: vi.fn().mockResolvedValue('Hi there!'),
        close: vi.fn(),
      };
      mockCreateChatSession.mockResolvedValue(mockSession);

      const res = await createApp().request('/fm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hello' }),
      });

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.session_id).toBe('session-123');
      expect(body.response).toBe('Hi there!');
    });

    it('passes session options', async () => {
      const mockSession = {
        id: 'session-456',
        send: vi.fn().mockResolvedValue('Response'),
        close: vi.fn(),
      };
      mockCreateChatSession.mockResolvedValue(mockSession);

      await createApp().request('/fm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hello', model: 'system', instructions: 'Be concise' }),
      });

      expect(mockCreateChatSession).toHaveBeenCalledWith(expect.objectContaining({
        model: 'system',
        instructions: 'Be concise',
      }));
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await createApp().request('/fm/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /fm/chat/:session_id', () => {
    it('closes an existing session', async () => {
      mockCloseChatSession.mockReturnValue(true);
      const res = await createApp().request('/fm/chat/session-123', {
        method: 'DELETE',
      });

      expect(res.status).toBe(200);
      expect((await json(res)).status).toBe('closed');
      expect(mockCloseChatSession).toHaveBeenCalledWith('session-123');
    });

    it('returns 404 for unknown session', async () => {
      mockCloseChatSession.mockReturnValue(false);
      const res = await createApp().request('/fm/chat/nonexistent', {
        method: 'DELETE',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /fm/models/available', () => {
    it('returns model availability', async () => {
      mockGetAvailableModels.mockResolvedValue([
        { model: 'system', available: true },
        { model: 'pcc', available: true },
      ]);

      const res = await createApp().request('/fm/models/available');
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual([
        { model: 'system', available: true },
        { model: 'pcc', available: true },
      ]);
    });

    it('passes model query param', async () => {
      mockGetAvailableModels.mockResolvedValue([{ model: 'pcc', available: true }]);
      await createApp().request('/fm/models/available?model=pcc');
      expect(mockGetAvailableModels).toHaveBeenCalledWith('pcc');
    });
  });

  describe('GET /fm/quota', () => {
    it('returns quota usage', async () => {
      mockGetQuotaUsage.mockResolvedValue([
        { model: 'pcc', usage: '50/500 requests used' },
      ]);

      const res = await createApp().request('/fm/quota');
      expect(res.status).toBe(200);
      expect(await json(res)).toEqual([{ model: 'pcc', usage: '50/500 requests used' }]);
    });

    it('passes model query param', async () => {
      mockGetQuotaUsage.mockResolvedValue([]);
      await createApp().request('/fm/quota?model=system');
      expect(mockGetQuotaUsage).toHaveBeenCalledWith('system');
    });
  });

  describe('POST /fm/token-count', () => {
    it('returns token count', async () => {
      mockCountTokens.mockResolvedValue({ count: 42 });
      const res = await createApp().request('/fm/token-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hello world' }),
      });

      expect(res.status).toBe(200);
      expect(await json(res)).toEqual({ count: 42 });
      expect(mockCountTokens).toHaveBeenCalledWith('Hello world', {});
    });

    it('passes options', async () => {
      mockCountTokens.mockResolvedValue({ count: 100 });
      await createApp().request('/fm/token-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'Hello', instructions: 'Be brief', image: '/img.png' }),
      });

      expect(mockCountTokens).toHaveBeenCalledWith('Hello', expect.objectContaining({
        instructions: 'Be brief',
        image: '/img.png',
      }));
    });

    it('returns 400 when prompt is missing', async () => {
      const res = await createApp().request('/fm/token-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });
});
