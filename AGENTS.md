# AGENTS.md

> Machine-readable project context for AI agents working in this codebase.

## Project Identity

- **Name**: fm-wrap
- **Purpose**: TypeScript library + HTTP server wrapping Apple's macOS `fm` CLI (Foundation Models). Exposes both `system` (on-device) and `pcc` (Private Cloud Compute) models programmatically and via REST API.
- **Repository**: https://github.com/tariqwest/fm-wrap
- **Binary**: `/usr/bin/fm` (macOS 27+)

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript (strict mode, ESM)
- **Server**: Hono
- **Validation**: Zod v4
- **Testing**: Vitest
- **Build**: tsc (outputs to `dist/`)
- **Package manager**: bun (lockfile: `bun.lock`)

## Project Structure

```
fm-wrap/
├── src/
│   ├── core/                  # Library layer — zero HTTP dependencies
│   │   ├── types.ts           # Zod schemas, inferred TypeScript types
│   │   ├── respond.ts         # Wraps `fm respond` (buffered + async streaming)
│   │   ├── chat.ts            # Wraps `fm chat` via node-pty PTY sessions
│   │   ├── models.ts          # Wraps `fm available` and `fm quota-usage`
│   │   ├── tokens.ts          # Wraps `fm token-count`
│   │   └── index.ts           # Barrel export for all core APIs
│   ├── server/                # HTTP adapter layer (Hono)
│   │   ├── routes/
│   │   │   ├── native.ts      # /fm/* routes (mirrors CLI capabilities)
│   │   │   └── openai.ts      # /v1/* routes (OpenAI Chat Completions compatible)
│   │   └── index.ts           # createApp(), createServer()
│   └── index.ts               # Package entry — re-exports core + server
├── scripts/
│   └── release.sh             # npm + GitHub Release automation
├── .agents/
│   └── plans/                 # Architectural decision records
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Package Exports

```json
{
  ".": "./dist/core/index.js",        // Library (no HTTP)
  "./server": "./dist/server/index.js" // Server factory
}
```

Consumers import as:
- `import { respond, createChatSession } from 'fm-wrap'` — library only
- `import { createServer } from 'fm-wrap/server'` — server factory

## Core Library API

### `respond(prompt, options?): Promise<RespondResult> | AsyncIterable<RespondResult>`

Single-turn text generation. Returns a Promise normally, or an AsyncIterable when `options.stream` is true.

**Options** (all optional):
- `model`: `'system' | 'pcc'`
- `instructions`: system prompt string
- `stream`: boolean (enables streaming)
- `greedy`: boolean (deterministic sampling)
- `image`: file path for multimodal input
- `schema`: string path or object for structured JSON output
- `transcript`: path to load prior conversation
- `saveTranscript`: name to persist conversation
- `useCase`: `'general' | 'content-tagging'` (system model only)
- `guardrails`: `'default' | 'permissive-content-transformations'` (system model only)

### `createChatSession(options?): Promise<ChatSession>`

Creates a PTY-backed multi-turn chat session.

**Options**: `model`, `instructions`, `resume` (session name)

**ChatSession interface**:
- `.id`: string — unique session identifier
- `.send(message)`: Promise<string> — send message, get response
- `.close()`: Promise<void> — kill PTY process

### `closeChatSession(id): boolean`

Close a session by ID. Returns false if not found.

### `getAvailableModels(model?): Promise<ModelAvailability[]>`

Check which models are available. Optionally filter by model.

### `getQuotaUsage(model?): Promise<QuotaUsage[]>`

Check PCC quota. Optionally filter by model.

### `countTokens(prompt, options?): Promise<TokenCountResult>`

Count tokens for a prompt. System model only.

## HTTP API Routes

### Native API (`/fm/*`)

| Method | Path | Description |
|--------|------|-------------|
| POST | /fm/respond | Single-turn generation |
| POST | /fm/chat | Create session + send first message |
| DELETE | /fm/chat/:session_id | Close session |
| GET | /fm/models/available | Model availability |
| GET | /fm/quota | Quota usage |
| POST | /fm/token-count | Token counting |
| GET | /health | Health check |

### OpenAI-Compatible API (`/v1/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/models | List models (OpenAI format) |
| POST | /v1/chat/completions | Chat completions (streaming + non-streaming) |

**Mapping rules for `/v1/chat/completions`**:
- `model` → `--model` flag
- `messages[role=system]` → `--instructions`
- `messages[role=user]` (last) → prompt to `fm respond`
- `stream: true` → SSE response with `data: [DONE]` sentinel
- `temperature: 0` → `--greedy`

## Commands

```bash
bun install          # Install dependencies
bun run test         # Run all tests (vitest)
bun run typecheck    # TypeScript type check (tsc --noEmit)
bun run build        # Clean build to dist/
bun run start        # Start server on port 8000
bun run release      # Release to npm + GitHub
```

## Testing Conventions

- Tests are co-located: `src/core/respond.test.ts` next to `src/core/respond.ts`
- All CLI interactions are mocked (`child_process.spawn`, `node-pty`)
- Server tests use Hono's built-in `app.request()` — no supertest needed
- TDD approach: tests written before implementation

## Key Design Decisions

1. **Library-first architecture**: Core has zero HTTP dependencies. Server is a thin adapter.
2. **PTY for `fm chat`**: Required because `fm chat` is an interactive TUI that checks for terminal attachment. `fm respond` works fine with regular `child_process.spawn`.
3. **No `fm serve` usage**: `fm serve` only supports on-device models. We need PCC access, so we wrap the CLI directly.
4. **Dual API surface**: Native `/fm/*` routes expose full CLI capabilities. OpenAI `/v1/*` routes provide compatibility with existing tooling.
5. **Zod validation**: All inputs/outputs have runtime-validated schemas that also produce TypeScript types.

## Underlying CLI Reference

The `fm` binary at `/usr/bin/fm` provides:
- `fm respond <prompt>` — single-turn (supports `--model`, `--stream`, `--instructions`, `--image`, `--schema`, `--greedy`, `--load-transcript`, `--save-transcript`)
- `fm chat` — interactive multi-turn (supports `--model`, `--instructions`, `--resume`, `--continue`)
- `fm available` — model availability check
- `fm quota-usage` — PCC quota info
- `fm token-count` — token counting (system model only, `--quiet` for bare integer)
- `fm schema object` — JSON schema generation helper
- `fm serve` — built-in server (on-device only, NOT used by this project)

Models: `system` (on-device), `pcc` (Private Cloud Compute, default)
