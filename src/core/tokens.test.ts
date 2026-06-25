import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'stream';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { countTokens } from './tokens.js';

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

describe('countTokens', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns token count from output', async () => {
    mockSpawn.mockReturnValue(createMockProcess('42\n'));
    const result = await countTokens('Hello world');
    expect(result.count).toBe(42);
    expect(mockSpawn).toHaveBeenCalledWith('fm', expect.arrayContaining(['token-count', '--quiet', 'Hello world']));
  });

  it('passes instructions option', async () => {
    mockSpawn.mockReturnValue(createMockProcess('15\n'));
    await countTokens('Hello', { instructions: 'Be concise' });
    const args = mockSpawn.mock.calls[0][1];
    expect(args).toContain('--instructions');
    expect(args).toContain('Be concise');
  });

  it('passes image option', async () => {
    mockSpawn.mockReturnValue(createMockProcess('100\n'));
    await countTokens('Describe', { image: '/tmp/photo.jpg' });
    const args = mockSpawn.mock.calls[0][1];
    expect(args).toContain('--image');
    expect(args).toContain('/tmp/photo.jpg');
  });

  it('passes transcript option', async () => {
    mockSpawn.mockReturnValue(createMockProcess('200\n'));
    await countTokens('Follow up', { transcript: '/tmp/t.json' });
    const args = mockSpawn.mock.calls[0][1];
    expect(args).toContain('--load-transcript');
    expect(args).toContain('/tmp/t.json');
  });

  it('rejects on non-zero exit code', async () => {
    mockSpawn.mockReturnValue(createMockProcess('', 1, 'token-count error'));
    await expect(countTokens('Hello')).rejects.toThrow('token-count error');
  });

  it('rejects on non-numeric output', async () => {
    mockSpawn.mockReturnValue(createMockProcess('not a number\n'));
    await expect(countTokens('Hello')).rejects.toThrow('Failed to parse token count');
  });
});
