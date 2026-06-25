import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { respond, getAvailableModels } from '../../core/index.js';
import type { FmModel, RespondOptions } from '../../core/index.js';

export const openaiRoutes = new Hono();

// --- GET /v1/models ---

openaiRoutes.get('/v1/models', async (c) => {
  try {
    const models = await getAvailableModels();
    return c.json({
      object: 'list',
      data: models.map((m) => ({
        id: m.model,
        object: 'model',
        owned_by: 'apple',
      })),
    });
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 500);
  }
});

// --- POST /v1/chat/completions ---

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

openaiRoutes.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json();
  const { model, messages, stream, temperature } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return c.json({ error: { message: 'messages is required and must be non-empty' } }, 400);
  }

  // Extract system instructions
  const systemMessages = (messages as ChatMessage[]).filter((m) => m.role === 'system');
  const userMessages = (messages as ChatMessage[]).filter((m) => m.role !== 'system');
  const lastUserMessage = userMessages[userMessages.length - 1];

  if (!lastUserMessage) {
    return c.json({ error: { message: 'At least one non-system message is required' } }, 400);
  }

  const instructions = systemMessages.map((m) => m.content).join('\n') || undefined;
  const requestId = `fm-${uuidv4().slice(0, 8)}`;

  const options: RespondOptions = {
    model: model as FmModel | undefined,
    instructions,
    greedy: temperature === 0 ? true : undefined,
    stream: stream ? true : undefined,
  };

  try {
    if (stream) {
      return new Response(
        new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of respond(lastUserMessage.content, { ...options, stream: true })) {
              const sseData = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: model || 'pcc',
                choices: [{
                  index: 0,
                  delta: { content: chunk.text },
                  finish_reason: null,
                }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`));
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
    }

    // Non-streaming
    const result = await respond(lastUserMessage.content, options);
    return c.json({
      id: requestId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'pcc',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: result.text },
        finish_reason: 'stop',
      }],
      usage: null,
    });
  } catch (err: any) {
    return c.json({ error: { message: err.message } }, 500);
  }
});
