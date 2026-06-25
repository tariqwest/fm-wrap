# Exposing macOS FM Client with Service
# Architectural Summary: Wrapping Apple's `fm` CLI as a Library and RESTful Web Service

This document summarizes the technical approach for exposing Apple's macOS 27 foundation models command-line tool (`fm`) as both a **programmatic TypeScript/JavaScript library** (importable as a module) and a **RESTful web service** (Express server). The library is the core layer; the server is a thin HTTP adapter on top of it.

---

## 0. The `fm` CLI — Full Capabilities Reference

**Binary**: `/usr/bin/fm`

### Models
- `system` — On-device Apple Foundation Model
- `pcc` — Apple Foundation Model on Private Cloud Compute (**default**)

### Commands

- `fm respond <prompt>` — Single-turn text generation
- `fm chat` — Interactive multi-turn session
- `fm serve` — Built-in Chat Completions API server (**device-only, no PCC**)
- `fm available` — Check model availability
- `fm quota-usage` — Check quota usage per model
- `fm token-count` — Count tokens in prompt/instructions (system model only)
- `fm schema object` — Generate JSON schemas for structured output

### `fm respond` Options
- `-m, --model <system|pcc>` — Model selection
- `-i, --instructions <text>` — System instructions
- `--image <path>` — Multimodal image input
- `--text <text>` — Additional text segment
- `--schema <file>` — JSON schema for structured generation
- `--[no-]stream` — Streaming output (default: on)
- `-g, --greedy` — Greedy sampling (deterministic)
- `--load-transcript <file>` — Seed with prior conversation context
- `--save-transcript <name>` — Persist transcript after responding
- `-v, --verbose` — Verbose output
- `--use-case <general|content-tagging>` — Use case (system model only)
- `--guardrails <default|permissive-content-transformations>` — Guardrail level (system model only)
- Accepts stdin pipe: `echo 'prompt' | fm respond`

### `fm chat` Options
- `-m, --model <system|pcc>` — Model selection
- `-i, --instructions <text>` — System instructions
- `-r, --resume <name>` — Resume a saved session (from `~/.fm/sessions/`)
- `--continue` — Continue the most recent session
- `--set-default-model <model>` — Persist default model preference

### `fm token-count` Options
- `-i, --instructions <text>` — Include instructions in count
- `--image <path>` — Include image (repeatable)
- `--text <text>` — Additional text (repeatable)
- `--load-transcript <file>` — Include saved transcript
- `-q, --quiet` — Output bare integer only
- **Note**: Only works with the on-device `system` model

### `fm schema object` Options
- `--name <name>` — Root object type name (required)
- Property types: `--string`, `--boolean`, `--integer`, `--double`, `--object`
- Modifiers: `--array`, `--optional`, `--description <text>`
- Composition: `--anyOf` with multiple `--schema` args
- Nesting: dot notation (`address.street`) or `--object` + `--schema`

### Why Not Use `fm serve`?
`fm serve` provides an OpenAI-compatible Chat Completions API (`/v1/chat/completions`) with streaming, but it **only has access to on-device models** — it cannot route to PCC. Since PCC is the default and more capable model, we wrap `fm respond` and `fm chat` directly to expose both models.

---

## 1. Core Structural Strategy

The project is structured as a **layered architecture** with two consumption modes:

### Package Layout

```
fm-wrap/
├── src/
│   ├── core/                  # Library layer (no HTTP dependency)
│   │   ├── index.ts           # Public API barrel export
│   │   ├── respond.ts         # fm respond wrapper
│   │   ├── chat.ts            # fm chat session manager
│   │   ├── models.ts          # fm available / quota-usage
│   │   ├── tokens.ts          # fm token-count
│   │   ├── schema.ts          # fm schema generation
│   │   └── types.ts           # Shared interfaces & types
│   ├── server/                # HTTP adapter layer
│   │   ├── index.ts           # Express app setup & listen
│   │   ├── routes/
│   │   │   ├── native.ts      # Native API routes
│   │   │   └── openai.ts      # OpenAI-compatible routes
│   │   └── middleware.ts      # Error handling, streaming helpers
│   └── index.ts               # Package entry: re-exports core + createServer
├── package.json               # "exports" field with dual entry points
└── tsconfig.json
```

### Dual Consumption Modes

**1. As an importable library (no server running)**

```typescript
import { respond, createChatSession, getAvailableModels, countTokens } from 'fm-wrap';

// Single-turn
const result = await respond('What is Swift?', { model: 'pcc', stream: false });
console.log(result.text);

// Streaming
for await (const chunk of respond('Explain async/await', { stream: true })) {
  process.stdout.write(chunk.text);
}

// Multi-turn chat
const chat = await createChatSession({ model: 'pcc', instructions: 'Be concise' });
const reply1 = await chat.send('Hello');
const reply2 = await chat.send('Follow up');
await chat.close();

// Structured output
const json = await respond('Extract the person', {
  schema: { name: 'Person', properties: { name: 'string', age: 'integer' } }
});

// Utilities
const models = await getAvailableModels();
const { count } = await countTokens('Hello world');
```

**2. As a standalone server**

```typescript
import { createServer } from 'fm-wrap/server';

const server = createServer({ port: 8000 });
await server.start();
```

Or via CLI:
```bash
pnpm start          # runs the server on default port
fm-wrap serve       # (optional bin entry)
```

### Package Exports (`package.json`)

```json
{
  "name": "fm-wrap",
  "exports": {
    ".": "./dist/core/index.js",
    "./server": "./dist/server/index.js"
  },
  "types": {
    ".": "./dist/core/index.d.ts",
    "./server": "./dist/server/index.d.ts"
  },
  "bin": {
    "fm-wrap": "./dist/cli.js"
  }
}
```

### Core Library API Design

The library exposes typed async functions that wrap `fm` CLI invocations. All functions return Promises (or AsyncIterables for streaming). The library manages process spawning, PTY lifecycle, output parsing, and temp file creation internally.

```typescript
// src/core/types.ts
export type FmModel = 'system' | 'pcc';

export interface RespondOptions {
  model?: FmModel;
  instructions?: string;
  stream?: boolean;
  greedy?: boolean;
  image?: string;           // file path
  schema?: string | object; // path to JSON schema file, or inline schema object
  transcript?: string;      // path to load-transcript
  saveTranscript?: string;  // name to save-transcript
  useCase?: 'general' | 'content-tagging';
  guardrails?: 'default' | 'permissive-content-transformations';
}

export interface RespondResult {
  text: string;
}

export interface ChatSessionOptions {
  model?: FmModel;
  instructions?: string;
  resume?: string;          // session name to resume
}

export interface ChatSession {
  id: string;
  send(message: string): Promise<string>;
  close(): Promise<void>;
}

export interface ModelAvailability {
  model: FmModel;
  available: boolean;
}

export interface QuotaUsage {
  model: FmModel;
  usage: string; // raw output from fm quota-usage
}

export interface TokenCountOptions {
  instructions?: string;
  image?: string;
  transcript?: string;
}

export interface TokenCountResult {
  count: number;
}
```

### Separation of Concerns

- **`src/core/`** has zero HTTP/Express imports. It depends only on `child_process`, `node-pty`, `uuid`, and Node built-ins. Any project can `import` it without pulling in Express.
- **`src/server/`** imports from `src/core/` and wraps each library function in an Express route handler. It owns request validation, HTTP status codes, SSE framing, and multipart upload handling.
- The server is a consumer of the library, not the other way around. No circular dependencies.

---

The terminal interaction paths:

*   **Single-Turn (`core/respond.ts`)**: Ephemeral child processes spawned on-demand. Supports text, multimodal (image), structured output (schema), transcript seeding, streaming, and model selection. Returns a Promise<RespondResult> or AsyncIterable<RespondResult> for streaming.
*   **Multi-Turn (`core/chat.ts`)**: PTY-backed persistent processes managed in a session registry. Exposes a `ChatSession` object with `send()` and `close()` methods. Handles session lifecycle, idle timeout cleanup, and concurrency locking internally.
*   **Utilities (`core/models.ts`, `core/tokens.ts`)**: Simple spawn-and-parse wrappers around `fm available`, `fm quota-usage`, and `fm token-count`.

---

## 2. Overcoming Terminal & TTY Quirks

Interactive TUI tools like `fm chat` usually check whether they are connected to a real user terminal or an automated script. If they do not detect a real terminal interface, they stop flashing data line-by-line and buffer text.

To solve this, the Node.js native `child_process.spawn` is bypassed for interactive tracking. Instead, a **pseudo-terminal wrapper (`node-pty`)** is used to trick the `fm` CLI into believing it is communicating with an active user shell interface (`xterm-color`). This ensures instant, line-buffered data output.

**Note**: `fm respond` with `--stream` writes to stdout normally and does not require PTY wrapping — only `fm chat` needs the PTY approach.

---

## 3. Implementation Blueprint

The previous monolithic `server.ts` is now split across layers. The server routes are thin adapters:

```typescript
// src/core/respond.ts — Library function (no HTTP)
import { spawn } from 'child_process';
import { RespondOptions, RespondResult } from './types';

export function respond(prompt: string, options?: RespondOptions): Promise<RespondResult>;
export function respond(prompt: string, options: RespondOptions & { stream: true }): AsyncIterable<RespondResult>;
export function respond(prompt: string, options: RespondOptions = {}): Promise<RespondResult> | AsyncIterable<RespondResult> {
  const args = buildRespondArgs(prompt, options);

  if (options.stream) {
    return streamRespond(args);
  }
  return bufferedRespond(args);
}

function buildRespondArgs(prompt: string, opts: RespondOptions): string[] {
  const args = ['respond'];
  if (opts.model) args.push('--model', opts.model);
  if (opts.instructions) args.push('--instructions', opts.instructions);
  if (opts.greedy) args.push('--greedy');
  if (opts.image) args.push('--image', opts.image);
  if (opts.schema) args.push('--schema', typeof opts.schema === 'string' ? opts.schema : writeTempSchema(opts.schema));
  if (opts.transcript) args.push('--load-transcript', opts.transcript);
  if (opts.saveTranscript) args.push('--save-transcript', opts.saveTranscript);
  if (opts.stream === false) args.push('--no-stream');
  args.push(prompt);
  return args;
}

async function bufferedRespond(args: string[]): Promise<RespondResult> {
  const child = spawn('fm', args);
  let stdout = '', stderr = '';
  child.stdout.on('data', (d) => stdout += d.toString());
  child.stderr.on('data', (d) => stderr += d.toString());
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr.trim()));
      else resolve({ text: stdout.trim() });
    });
  });
}

async function* streamRespond(args: string[]): AsyncIterable<RespondResult> {
  const child = spawn('fm', args);
  for await (const chunk of child.stdout) {
    yield { text: chunk.toString() };
  }
}
```

```typescript
// src/server/routes/native.ts — Thin HTTP adapter
import { Router } from 'express';
import { respond, createChatSession, getSessionOrThrow } from '../../core';

const router = Router();

router.post('/v1/respond', async (req, res) => {
  const { prompt, ...options } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  if (options.stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    for await (const chunk of respond(prompt, { ...options, stream: true })) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    const result = await respond(prompt, options);
    res.json(result);
  }
});

export default router;
```

---

## 4. Key Production Considerations

1.  **Garbage Collection**: Unclosed multi-turn web requests keep sub-processes alive forever. Implement a cron-like tracking routine to loop over current items and call `ptyProcess.kill()` on sessions that have been idle for over 15 minutes.
2.  **Concurrency Isolation**: PTY writing handles are inherently sequential. A session lock strategy must be implemented if the frontend interface allows users to send multiple concurrent messages inside the same chat window before the previous generation finishes.
3.  **Native Session Persistence**: `fm chat` already saves sessions to `~/.fm/sessions/`. The service can leverage `--resume <name>` to reconnect to prior conversations without maintaining its own persistence layer.
4.  **Structured Output**: `fm respond --schema <file>` enables type-safe JSON generation. The service should accept inline JSON schema in request bodies, write to a temp file, and pass it to `fm`.
5.  **Multimodal Support**: `fm respond --image <path>` accepts image files. The service should handle multipart uploads, write to temp storage, and pass paths to the CLI.
6.  **Token Counting**: Expose `fm token-count` for pre-flight validation (system model only). Useful for clients to check prompt size before sending.
7.  **Quota Awareness**: Expose `fm quota-usage` to let clients monitor PCC usage limits and gracefully degrade to on-device when approaching caps.

---

## 5. Proposed API Surface

### Native API (reflects `fm` CLI capabilities directly)

```
POST   /v1/respond              Single-turn generation (text, image, schema)
POST   /v1/chat                 Multi-turn message (create or continue session)
DELETE /v1/chat/:session_id     Close a chat session
GET    /v1/models/available     Model availability check
GET    /v1/quota                Quota usage
POST   /v1/token-count          Token counting (system model only)
GET    /health                  Service health
```

### OpenAI-Compatible API (drop-in replacement for clients expecting the Chat Completions format)

Mirrors the same interface `fm serve` exposes, but backed by `fm respond`/`fm chat` so it can route to **both** `system` and `pcc` models.

```
GET    /v1/models               List available models
POST   /v1/chat/completions     Chat completions (streaming & non-streaming)
GET    /health                  Health check (shared)
```

#### `/v1/models` Response Shape

```json
{
  "object": "list",
  "data": [
    { "id": "system", "object": "model", "owned_by": "apple" },
    { "id": "pcc", "object": "model", "owned_by": "apple" }
  ]
}
```

#### `/v1/chat/completions` Request Shape

Accepts the standard OpenAI Chat Completions request body:

```json
{
  "model": "pcc",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "What is Swift?" }
  ],
  "stream": false,
  "temperature": 0
}
```

Mapping to `fm` CLI:
- `model` → `--model` flag
- `messages[role=system]` → `--instructions` flag
- `messages[role=user]` (single message, no history) → `fm respond <prompt>`
- `messages` (multi-turn history) → `fm respond --load-transcript <file>` with the conversation serialized as a transcript, or routed through a managed `fm chat` PTY session
- `stream: true` → `--stream` flag (uses SSE with `data: [DONE]` sentinel)
- `temperature: 0` → `--greedy` flag

#### `/v1/chat/completions` Response Shape (non-streaming)

```json
{
  "id": "fm-abc123",
  "object": "chat.completion",
  "created": 1719322177,
  "model": "pcc",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "Swift is..." },
      "finish_reason": "stop"
    }
  ],
  "usage": null
}
```

#### `/v1/chat/completions` Streaming (SSE)

When `stream: true`, responds with `Content-Type: text/event-stream` and emits chunks:

```
data: {"id":"fm-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"Swift"},"finish_reason":null}]}

data: [DONE]
```

---

## 6. Routing Strategy for OpenAI-Compatible Endpoint

The `/v1/chat/completions` handler decides which `fm` execution path to use:

1. **Single user message, no prior history** → `fm respond <prompt>` with `--model`, `--instructions`, `--stream`, `--greedy` as applicable. Simplest path, no session state.
2. **Multi-turn conversation** → Two strategies available:
   - **Transcript-based (stateless)**: Serialize the full `messages` array to a transcript JSON file, invoke `fm respond --load-transcript <file> <latest_user_message>`. Each request is independent — no server-side session. Preferred for simplicity.
   - **PTY session-based (stateful)**: For long-running conversations where transcript replay is expensive, maintain a `fm chat` PTY session (same mechanism as the native `/v1/chat` endpoint). Maps the `messages` array to a `session_id` internally.
3. **Structured output** → If request includes `response_format: { type: "json_schema", json_schema: {...} }`, write schema to temp file and pass `--schema <file>`.
4. **Image/multimodal** → If messages contain `content` arrays with `image_url` type entries pointing to local paths or base64, decode/write to temp and pass `--image <path>`.
