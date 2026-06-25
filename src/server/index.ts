import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { nativeRoutes } from './routes/native.js';
import { openaiRoutes } from './routes/openai.js';

export interface ServerOptions {
  port?: number;
}

export function createApp() {
  const app = new Hono();
  app.use('*', logger());
  app.route('/', nativeRoutes);
  app.route('/', openaiRoutes);
  return app;
}

export function createServer(options: ServerOptions = {}) {
  const port = options.port ?? 8000;
  const app = createApp();

  return {
    app,
    port,
    start() {
      return Bun.serve({
        fetch: app.fetch,
        port,
      });
    },
  };
}
