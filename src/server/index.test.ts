import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('../core/index.js', () => ({
  respond: vi.fn(),
  createChatSession: vi.fn(),
  closeChatSession: vi.fn(),
  getAvailableModels: vi.fn().mockResolvedValue([
    { model: 'system', available: true },
    { model: 'pcc', available: true },
  ]),
  getQuotaUsage: vi.fn().mockResolvedValue([]),
  countTokens: vi.fn(),
}));

import { createApp } from './index.js';

describe('createApp', () => {
  it('returns a Hono app instance', () => {
    const app = createApp();
    expect(app).toBeInstanceOf(Hono);
  });

  it('responds to GET /health', async () => {
    const app = createApp();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('responds to GET /v1/models', async () => {
    const app = createApp();
    const res = await app.request('/v1/models');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
  });
});
