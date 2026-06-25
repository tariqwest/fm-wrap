import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('../../core/index.js', () => ({
  respond: vi.fn(),
  createChatSession: vi.fn(),
  getAvailableModels: vi.fn(),
}));

import { respond, createChatSession, getAvailableModels } from '../../core/index.js';
import { openaiRoutes } from './openai.js';

const mockRespond = vi.mocked(respond);
const mockCreateChatSession = vi.mocked(createChatSession);
const mockGetAvailableModels = vi.mocked(getAvailableModels);

function createApp() {
  const app = new Hono();
  app.route('/', openaiRoutes);
  return app;
}

async function json(res: Response) {
  return res.json();
}

describe('OpenAI-Compatible Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /v1/models', () => {
    it('returns models in OpenAI format', async () => {
      mockGetAvailableModels.mockResolvedValue([
        { model: 'system', available: true },
        { model: 'pcc', available: true },
      ]);

      const res = await createApp().request('/v1/models');
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.object).toBe('list');
      expect(body.data).toEqual([
        { id: 'system', object: 'model', owned_by: 'apple' },
        { id: 'pcc', object: 'model', owned_by: 'apple' },
      ]);
    });
  });

  describe('POST /v1/chat/completions', () => {
    it('handles single user message (non-streaming)', async () => {
      mockRespond.mockResolvedValue({ text: 'Swift is a programming language.' });

      const res = await createApp().request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'pcc',
          messages: [
            { role: 'user', content: 'What is Swift?' },
          ],
          stream: false,
        }),
      });

      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.object).toBe('chat.completion');
      expect(body.model).toBe('pcc');
      expect(body.choices[0].message.role).toBe('assistant');
      expect(body.choices[0].message.content).toBe('Swift is a programming language.');
      expect(body.choices[0].finish_reason).toBe('stop');
    });

    it('extracts system message as instructions', async () => {
      mockRespond.mockResolvedValue({ text: 'Sure.' });

      await createApp().request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'pcc',
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' },
          ],
        }),
      });

      expect(mockRespond).toHaveBeenCalledWith('Hello', expect.objectContaining({
        model: 'pcc',
        instructions: 'You are a helpful assistant',
      }));
    });

    it('maps temperature 0 to greedy', async () => {
      mockRespond.mockResolvedValue({ text: 'Deterministic.' });

      await createApp().request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'system',
          messages: [{ role: 'user', content: 'Hi' }],
          temperature: 0,
        }),
      });

      expect(mockRespond).toHaveBeenCalledWith('Hi', expect.objectContaining({
        greedy: true,
      }));
    });

    it('returns 400 when messages are missing', async () => {
      const res = await createApp().request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'pcc' }),
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 when messages is empty', async () => {
      const res = await createApp().request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'pcc', messages: [] }),
      });
      expect(res.status).toBe(400);
    });

    it('handles streaming response', async () => {
      const mockStream = (async function* () {
        yield { text: 'Hello' };
        yield { text: ' world' };
      })();
      mockRespond.mockReturnValue(mockStream as any);

      const res = await createApp().request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'pcc',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: true,
        }),
      });

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/event-stream');
      const text = await res.text();
      expect(text).toContain('data: ');
      expect(text).toContain('"delta"');
      expect(text).toContain('data: [DONE]');
    });

    it('returns 500 on core error', async () => {
      mockRespond.mockRejectedValue(new Error('Model error'));

      const res = await createApp().request('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'pcc',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      expect(res.status).toBe(500);
      expect((await json(res)).error.message).toBe('Model error');
    });
  });
});
