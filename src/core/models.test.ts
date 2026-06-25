import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'stream';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { getAvailableModels, getQuotaUsage } from './models.js';

const mockSpawn = vi.mocked(spawn);

function createMockProcess(stdoutData: string, exitCode = 0, stderrData = '') {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin: new Writable({ write() {} }),
    pid: 1234,
    killed: false,
    kill: vi.fn(),
  });

  setTimeout(() => {
    if (stdoutData) stdout.push(stdoutData);
    stdout.push(null);
    if (stderrData) stderr.push(stderrData);
    stderr.push(null);
    proc.emit('close', exitCode);
  }, 0);

  return proc as any;
}

describe('getAvailableModels', () => {
  beforeEach(() => vi.clearAllMocks());

  it('parses availability for both models', async () => {
    mockSpawn.mockReturnValue(createMockProcess(
      'system: available\npcc: available\n'
    ));

    const result = await getAvailableModels();
    expect(result).toEqual([
      { model: 'system', available: true },
      { model: 'pcc', available: true },
    ]);
    expect(mockSpawn).toHaveBeenCalledWith('fm', ['available']);
  });

  it('handles unavailable models', async () => {
    mockSpawn.mockReturnValue(createMockProcess(
      'system: available\npcc: unavailable\n'
    ));

    const result = await getAvailableModels();
    expect(result).toEqual([
      { model: 'system', available: true },
      { model: 'pcc', available: false },
    ]);
  });

  it('can check a specific model', async () => {
    mockSpawn.mockReturnValue(createMockProcess('pcc: available\n'));

    const result = await getAvailableModels('pcc');
    expect(mockSpawn).toHaveBeenCalledWith('fm', ['available', '--model', 'pcc']);
    expect(result).toEqual([{ model: 'pcc', available: true }]);
  });

  it('rejects on non-zero exit', async () => {
    mockSpawn.mockReturnValue(createMockProcess('', 1, 'Error'));
    await expect(getAvailableModels()).rejects.toThrow('Error');
  });
});

describe('getQuotaUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns quota info for all models', async () => {
    mockSpawn.mockReturnValue(createMockProcess(
      'system: 10/100 requests used\npcc: 50/500 requests used\n'
    ));

    const result = await getQuotaUsage();
    expect(result).toEqual([
      { model: 'system', usage: '10/100 requests used' },
      { model: 'pcc', usage: '50/500 requests used' },
    ]);
    expect(mockSpawn).toHaveBeenCalledWith('fm', ['quota-usage']);
  });

  it('can check a specific model', async () => {
    mockSpawn.mockReturnValue(createMockProcess('pcc: 50/500 requests used\n'));

    const result = await getQuotaUsage('pcc');
    expect(mockSpawn).toHaveBeenCalledWith('fm', ['quota-usage', '--model', 'pcc']);
    expect(result).toEqual([{ model: 'pcc', usage: '50/500 requests used' }]);
  });

  it('rejects on non-zero exit', async () => {
    mockSpawn.mockReturnValue(createMockProcess('', 1, 'Quota error'));
    await expect(getQuotaUsage()).rejects.toThrow('Quota error');
  });
});
