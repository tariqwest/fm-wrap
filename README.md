# fm-wrap

A TypeScript library and server that wraps Apple's macOS `fm` CLI (Foundation Models) as a programmatic API. Provides access to both on-device (`system`) and Private Cloud Compute (`pcc`) models — unlike `fm serve`, which is limited to on-device only.

## Install

```bash
bun add fm-wrap
```

Or from GitHub Releases:

```bash
bun add ./fm-wrap-0.1.0.tgz
```

## Requirements

- macOS 27+ with `fm` CLI available at `/usr/bin/fm`
- Bun >= 1.0.0

## Usage as a Library

Import directly — no server needed:

```typescript
import { respond, createChatSession, getAvailableModels, countTokens } from 'fm-wrap';

// Single-turn generation
const result = await respond('What is Swift?', { model: 'pcc' });
console.log(result.text);

// Streaming
for await (const chunk of respond('Explain async/await', { stream: true })) {
  process.stdout.write(chunk.text);
}

// Multi-turn chat
const chat = await createChatSession({ model: 'pcc', instructions: 'Be concise' });
const reply = await chat.send('Hello');
await chat.close();

// Structured output (JSON schema)
const json = await respond('Extract the person', {
  schema: { name: 'Person', properties: { name: 'string', age: 'integer' } }
});

// Utilities
const models = await getAvailableModels();
const { count } = await countTokens('Hello world');
```

## Usage as a Server

```typescript
import { createServer } from 'fm-wrap/server';

const server = createServer({ port: 8000 });
server.start();
```

Or run directly:

```bash
bun run start
```

### Native API (`/fm/*`)

```
POST   /fm/respond              Single-turn generation
POST   /fm/chat                 Multi-turn chat (creates session)
DELETE /fm/chat/:session_id     Close a chat session
GET    /fm/models/available     Model availability
GET    /fm/quota                Quota usage
POST   /fm/token-count          Token counting (system model only)
GET    /health                  Health check
```

### OpenAI-Compatible API (`/v1/*`)

Drop-in replacement for clients expecting the Chat Completions format:

```
GET    /v1/models               List models
POST   /v1/chat/completions     Chat completions (streaming & non-streaming)
```

Example request:

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "pcc",
    "messages": [{"role": "user", "content": "What is Swift?"}],
    "stream": false
  }'
```

## Development

```bash
bun install
bun run test        # run tests
bun run typecheck   # type check
bun run build       # compile to dist/
```

## Releasing

```bash
bun run release     # or: ./scripts/release.sh [patch|minor|major]
```

Publishes to npm and creates a GitHub Release with the tarball attached.

## Architecture

```
src/
├── core/           # Library layer (no HTTP dependency)
│   ├── respond.ts  # fm respond wrapper (buffered + streaming)
│   ├── chat.ts     # fm chat PTY session manager
│   ├── models.ts   # fm available / quota-usage
│   ├── tokens.ts   # fm token-count
│   ├── types.ts    # Zod schemas + inferred types
│   └── index.ts    # Barrel export
├── server/         # Hono HTTP adapter
│   ├── routes/
│   │   ├── native.ts   # /fm/* endpoints
│   │   └── openai.ts   # /v1/* endpoints (OpenAI-compatible)
│   └── index.ts    # createApp + createServer
└── index.ts        # Package entry: re-exports core + server
```

## License

MIT
