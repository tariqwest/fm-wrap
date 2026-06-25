import { Hono } from 'hono';
import {
  respond,
  createChatSession,
  closeChatSession,
  getAvailableModels,
  getQuotaUsage,
  countTokens,
} from '../../core/index.js';
import type { FmModel } from '../../core/index.js';

export const nativeRoutes = new Hono();

// --- Health ---

nativeRoutes.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

// --- Respond ---

nativeRoutes.post('/fm/respond', async (c) => {
  const { prompt, ...options } = await c.req.json();
  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  try {
    if (options.stream) {
      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of respond(prompt, { ...options, stream: true })) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        }
      );
    } else {
      const result = await respond(prompt, options);
      return c.json(result);
    }
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- Chat ---

nativeRoutes.post('/fm/chat', async (c) => {
  const { prompt, session_id, model, instructions, resume } = await c.req.json();
  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  try {
    const session = await createChatSession({ model, instructions, resume });
    const response = await session.send(prompt);
    return c.json({ session_id: session.id, response });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

nativeRoutes.delete('/fm/chat/:session_id', (c) => {
  const sessionId = c.req.param('session_id');
  const closed = closeChatSession(sessionId);
  if (closed) {
    return c.json({ status: 'closed' });
  } else {
    return c.json({ error: 'Session not found' }, 404);
  }
});

// --- Models ---

nativeRoutes.get('/fm/models/available', async (c) => {
  try {
    const model = c.req.query('model') as FmModel | undefined;
    const result = await getAvailableModels(model);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- Quota ---

nativeRoutes.get('/fm/quota', async (c) => {
  try {
    const model = c.req.query('model') as FmModel | undefined;
    const result = await getQuotaUsage(model);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// --- Token Count ---

nativeRoutes.post('/fm/token-count', async (c) => {
  const { prompt, instructions, image, transcript } = await c.req.json();
  if (!prompt) {
    return c.json({ error: 'Prompt is required' }, 400);
  }

  try {
    const options: Record<string, string> = {};
    if (instructions) options.instructions = instructions;
    if (image) options.image = image;
    if (transcript) options.transcript = transcript;
    const result = await countTokens(prompt, options);
    return c.json(result);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
