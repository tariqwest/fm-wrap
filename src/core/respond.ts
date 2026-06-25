import { spawn } from 'child_process';
import * as pty from 'node-pty';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { RespondOptions, RespondResult } from './types.js';

export function buildRespondArgs(prompt: string, opts: RespondOptions): string[] {
  const args: string[] = ['respond'];
  if (opts.model) args.push('--model', opts.model);
  if (opts.instructions) args.push('--instructions', opts.instructions);
  if (opts.greedy) args.push('--greedy');
  if (opts.image) args.push('--image', opts.image);
  if (opts.schema) {
    const schemaPath = typeof opts.schema === 'string'
      ? opts.schema
      : writeTempSchema(opts.schema);
    args.push('--schema', schemaPath);
  }
  if (opts.transcript) args.push('--load-transcript', opts.transcript);
  if (opts.saveTranscript) args.push('--save-transcript', opts.saveTranscript);
  if (opts.stream === false) args.push('--no-stream');
  if (opts.useCase) args.push('--use-case', opts.useCase);
  if (opts.guardrails) args.push('--guardrails', opts.guardrails);
  args.push(prompt);
  return args;
}

function writeTempSchema(schema: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'fm-schema-'));
  const path = join(dir, 'schema.json');
  writeFileSync(path, JSON.stringify(schema));
  return path;
}

export function respond(prompt: string, options?: RespondOptions & { stream: true }): AsyncIterable<RespondResult>;
export function respond(prompt: string, options?: RespondOptions): Promise<RespondResult>;
export function respond(prompt: string, options: RespondOptions = {}): Promise<RespondResult> | AsyncIterable<RespondResult> {
  const args = buildRespondArgs(prompt, options);
  const usePty = options.model === 'pcc';

  if (options.stream) {
    return usePty ? ptyStreamRespond(args) : streamRespond(args);
  }
  return usePty ? ptyBufferedRespond(args) : bufferedRespond(args);
}

// -- Standard spawn (for on-device / system model) --

async function bufferedRespond(args: string[]): Promise<RespondResult> {
  const child = spawn('fm', args);
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  return new Promise<RespondResult>((resolve, reject) => {
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `fm exited with code ${code}`));
      } else {
        resolve({ text: stdout.trim() });
      }
    });
  });
}

async function* streamRespond(args: string[]): AsyncIterable<RespondResult> {
  const child = spawn('fm', args);

  for await (const chunk of child.stdout) {
    yield { text: chunk.toString() };
  }
}

// -- PTY-based spawn (for PCC model — requires terminal context) --

const FM_PATH = '/usr/bin/fm';

/** Strip ANSI escape sequences from PTY output */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

async function ptyBufferedRespond(args: string[]): Promise<RespondResult> {
  return new Promise<RespondResult>((resolve, reject) => {
    let output = '';
    const proc = pty.spawn(FM_PATH, args, {
      name: 'xterm-color',
      cols: 200,
      rows: 24,
      cwd: process.env.HOME,
      env: process.env as Record<string, string>,
    });

    proc.onData((data: string) => {
      output += data;
    });

    proc.onExit(({ exitCode }) => {
      const cleaned = stripAnsi(output).trim();
      if (exitCode !== 0) {
        reject(new Error(cleaned || `fm exited with code ${exitCode}`));
      } else {
        resolve({ text: cleaned });
      }
    });
  });
}

async function* ptyStreamRespond(args: string[]): AsyncIterable<RespondResult> {
  const proc = pty.spawn(FM_PATH, args, {
    name: 'xterm-color',
    cols: 200,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env as Record<string, string>,
  });

  let done = false;
  let pendingResolve: ((value: IteratorResult<RespondResult>) => void) | null = null;
  const queue: string[] = [];

  proc.onData((data: string) => {
    const cleaned = stripAnsi(data);
    if (cleaned) {
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve({ value: { text: cleaned }, done: false });
      } else {
        queue.push(cleaned);
      }
    }
  });

  proc.onExit(() => {
    done = true;
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve({ value: undefined as unknown as RespondResult, done: true });
    }
  });

  while (!done || queue.length > 0) {
    if (queue.length > 0) {
      yield { text: queue.shift()! };
    } else if (!done) {
      const result = await new Promise<IteratorResult<RespondResult>>((resolve) => {
        pendingResolve = resolve;
      });
      if (result.done) break;
      yield result.value;
    }
  }
}
