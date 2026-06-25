import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// Shared state to capture the onData callback from each pty instance
let latestDataCb: ((data: string) => void) | null = null;
const mockPtyWrite = vi.fn();
const mockPtyKill = vi.fn();

vi.mock('node-pty', () => ({
  spawn: vi.fn((..._args: any[]) => {
    latestDataCb = null;
    return {
      onData(cb: (data: string) => void) {
        latestDataCb = cb;
        return { dispose: () => {} };
      },
      write: mockPtyWrite,
      kill: mockPtyKill,
      pid: 9999,
    };
  }),
}));

import * as pty from 'node-pty';
import { createChatSession, closeChatSession, getSession } from './chat.js';

const mockPtySpawn = vi.mocked(pty.spawn);

/** Helper to emit data into the current PTY as if it came from fm */
function emitData(data: string) {
  if (!latestDataCb) throw new Error('No pty data callback registered');
  latestDataCb(data);
}

/** Create a session, emitting a boot prompt on next tick */
async function createSessionWithBoot(options = {}) {
  const promise = createChatSession(options);
  // Give createChatSession time to register onData, then emit boot prompt
  await new Promise((r) => setTimeout(r, 1));
  emitData('Welcome to fm chat\n>>> ');
  return promise;
}

describe('createChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestDataCb = null;
  });

  it('creates a session with a unique id', async () => {
    const session = await createSessionWithBoot();
    expect(session.id).toBeDefined();
    expect(typeof session.id).toBe('string');
    expect(session.id.length).toBeGreaterThan(0);
  });

  it('passes model option to pty spawn', async () => {
    await createSessionWithBoot({ model: 'system' });
    const spawnArgs = mockPtySpawn.mock.calls[0];
    expect(spawnArgs[0]).toBe('fm');
    expect(spawnArgs[1]).toContain('--model');
    expect(spawnArgs[1]).toContain('system');
  });

  it('passes instructions option', async () => {
    await createSessionWithBoot({ instructions: 'Be concise' });
    const spawnArgs = mockPtySpawn.mock.calls[0];
    expect(spawnArgs[1]).toContain('--instructions');
    expect(spawnArgs[1]).toContain('Be concise');
  });

  it('passes resume option', async () => {
    await createSessionWithBoot({ resume: 'old-session' });
    const spawnArgs = mockPtySpawn.mock.calls[0];
    expect(spawnArgs[1]).toContain('--resume');
    expect(spawnArgs[1]).toContain('old-session');
  });
});

describe('ChatSession.send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestDataCb = null;
  });

  it('writes the prompt and returns the response', async () => {
    const session = await createSessionWithBoot();

    const sendPromise = session.send('Hello');
    // Let send() register its pendingResolve
    await new Promise((r) => setTimeout(r, 1));
    emitData('Hello\nHi there! How can I help?\n>>> ');

    const reply = await sendPromise;
    expect(mockPtyWrite).toHaveBeenCalledWith('Hello\n');
    expect(reply).toContain('Hi there!');
  });
});

describe('ChatSession.close', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestDataCb = null;
  });

  it('kills the pty process', async () => {
    const session = await createSessionWithBoot();
    await session.close();
    expect(mockPtyKill).toHaveBeenCalled();
  });

  it('removes session from registry', async () => {
    const session = await createSessionWithBoot();
    const id = session.id;
    await session.close();
    expect(getSession(id)).toBeUndefined();
  });
});

describe('closeChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestDataCb = null;
  });

  it('closes session by id', async () => {
    const session = await createSessionWithBoot();
    closeChatSession(session.id);
    expect(mockPtyKill).toHaveBeenCalled();
    expect(getSession(session.id)).toBeUndefined();
  });

  it('returns false for unknown session', () => {
    expect(closeChatSession('nonexistent')).toBe(false);
  });
});
