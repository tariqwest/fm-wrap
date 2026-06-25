import { spawn } from 'child_process';
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

  if (options.stream) {
    return streamRespond(args);
  }
  return bufferedRespond(args);
}

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
