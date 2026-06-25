import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable, Writable } from 'stream';
import { EventEmitter } from 'events';

// Mock child_process before importing respond
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { respond, buildRespondArgs } from './respond.js';

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

  // Emit data async so the listeners are attached first
  setTimeout(() => {
    if (stdoutData) stdout.push(stdoutData);
    stdout.push(null);
    if (stderrData) stderr.push(stderrData);
    stderr.push(null);
    proc.emit('close', exitCode);
  }, 0);

  return proc as any;
}

describe('buildRespondArgs', () => {
  it('builds minimal args', () => {
    const args = buildRespondArgs('Hello', {});
    expect(args).toEqual(['respond', 'Hello']);
  });

  it('adds --model flag', () => {
    const args = buildRespondArgs('Hello', { model: 'pcc' });
    expect(args).toContain('--model');
    expect(args).toContain('pcc');
  });

  it('adds --instructions flag', () => {
    const args = buildRespondArgs('Hello', { instructions: 'Be concise' });
    expect(args).toContain('--instructions');
    expect(args).toContain('Be concise');
  });

  it('adds --greedy flag', () => {
    const args = buildRespondArgs('Hello', { greedy: true });
    expect(args).toContain('--greedy');
  });

  it('does not add --greedy when false', () => {
    const args = buildRespondArgs('Hello', { greedy: false });
    expect(args).not.toContain('--greedy');
  });

  it('adds --image flag', () => {
    const args = buildRespondArgs('Describe', { image: '/tmp/photo.jpg' });
    expect(args).toContain('--image');
    expect(args).toContain('/tmp/photo.jpg');
  });

  it('adds --no-stream when stream is false', () => {
    const args = buildRespondArgs('Hello', { stream: false });
    expect(args).toContain('--no-stream');
  });

  it('does not add --no-stream when stream is true', () => {
    const args = buildRespondArgs('Hello', { stream: true });
    expect(args).not.toContain('--no-stream');
  });

  it('adds --load-transcript', () => {
    const args = buildRespondArgs('Hello', { transcript: '/tmp/t.json' });
    expect(args).toContain('--load-transcript');
    expect(args).toContain('/tmp/t.json');
  });

  it('adds --save-transcript', () => {
    const args = buildRespondArgs('Hello', { saveTranscript: 'my-session' });
    expect(args).toContain('--save-transcript');
    expect(args).toContain('my-session');
  });

  it('adds --use-case', () => {
    const args = buildRespondArgs('Hello', { useCase: 'content-tagging' });
    expect(args).toContain('--use-case');
    expect(args).toContain('content-tagging');
  });

  it('adds --guardrails', () => {
    const args = buildRespondArgs('Hello', { guardrails: 'permissive-content-transformations' });
    expect(args).toContain('--guardrails');
    expect(args).toContain('permissive-content-transformations');
  });

  it('puts prompt at the end', () => {
    const args = buildRespondArgs('My prompt', { model: 'system', greedy: true });
    expect(args[args.length - 1]).toBe('My prompt');
  });
});

describe('respond (buffered)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns text from stdout on success', async () => {
    mockSpawn.mockReturnValue(createMockProcess('Swift is a language\n'));
    const result = await respond('What is Swift?');
    expect(result.text).toBe('Swift is a language');
    expect(mockSpawn).toHaveBeenCalledWith('fm', expect.arrayContaining(['respond', 'What is Swift?']));
  });

  it('passes options to spawn args', async () => {
    mockSpawn.mockReturnValue(createMockProcess('Response'));
    await respond('Hello', { model: 'system', instructions: 'Be brief' });
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).toContain('--model');
    expect(spawnArgs).toContain('system');
    expect(spawnArgs).toContain('--instructions');
    expect(spawnArgs).toContain('Be brief');
  });

  it('rejects on non-zero exit code', async () => {
    mockSpawn.mockReturnValue(createMockProcess('', 1, 'Error: model unavailable'));
    await expect(respond('Hello')).rejects.toThrow('Error: model unavailable');
  });

  it('trims whitespace from output', async () => {
    mockSpawn.mockReturnValue(createMockProcess('  hello world  \n'));
    const result = await respond('Hi');
    expect(result.text).toBe('hello world');
  });
});

describe('respond (streaming)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('yields chunks from stdout', async () => {
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
      stdout.push('chunk1');
      stdout.push('chunk2');
      stdout.push(null);
      stderr.push(null);
      proc.emit('close', 0);
    }, 0);

    mockSpawn.mockReturnValue(proc as any);

    const chunks: string[] = [];
    for await (const chunk of respond('Hello', { stream: true })) {
      chunks.push(chunk.text);
    }

    expect(chunks).toEqual(['chunk1', 'chunk2']);
  });
});
