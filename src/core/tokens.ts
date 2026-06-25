import { spawn } from 'child_process';
import type { TokenCountOptions, TokenCountResult } from './types.js';

export async function countTokens(prompt: string, options: TokenCountOptions = {}): Promise<TokenCountResult> {
  const args = buildTokenCountArgs(prompt, options);
  const child = spawn('fm', args);
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `fm exited with code ${code}`));
      } else {
        try {
          const count = parseTokenCount(stdout.trim());
          resolve({ count });
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

function buildTokenCountArgs(prompt: string, opts: TokenCountOptions): string[] {
  const args = ['token-count'];
  if (opts.instructions) args.push('--instructions', opts.instructions);
  if (opts.image) args.push('--image', opts.image);
  if (opts.transcript) args.push('--load-transcript', opts.transcript);
  args.push('--quiet');
  args.push(prompt);
  return args;
}

function parseTokenCount(output: string): number {
  const num = parseInt(output, 10);
  if (isNaN(num)) throw new Error(`Failed to parse token count: "${output}"`);
  return num;
}
