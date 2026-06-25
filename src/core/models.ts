import { spawn } from 'child_process';
import type { FmModel, ModelAvailability, QuotaUsage } from './types.js';

function runFmCommand(args: string[]): Promise<string> {
  const child = spawn('fm', args);
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `fm exited with code ${code}`));
      else resolve(stdout.trim());
    });
  });
}

export async function getAvailableModels(model?: FmModel): Promise<ModelAvailability[]> {
  const args = ['available'];
  if (model) args.push('--model', model);

  const output = await runFmCommand(args);
  return parseAvailability(output);
}

function parseAvailability(output: string): ModelAvailability[] {
  const results: ModelAvailability[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^(system|pcc):\s*(.+)$/);
    if (match) {
      results.push({
        model: match[1] as FmModel,
        available: match[2].trim().toLowerCase().includes('available') && !match[2].trim().toLowerCase().includes('unavailable'),
      });
    }
  }
  return results;
}

export async function getQuotaUsage(model?: FmModel): Promise<QuotaUsage[]> {
  const args = ['quota-usage'];
  if (model) args.push('--model', model);

  const output = await runFmCommand(args);
  return parseQuotaUsage(output);
}

function parseQuotaUsage(output: string): QuotaUsage[] {
  const results: QuotaUsage[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^(system|pcc):\s*(.+)$/);
    if (match) {
      results.push({
        model: match[1] as FmModel,
        usage: match[2].trim(),
      });
    }
  }
  return results;
}
