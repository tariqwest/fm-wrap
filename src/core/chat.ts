import * as pty from 'node-pty';
import { v4 as uuidv4 } from 'uuid';
import type { ChatSession, ChatSessionOptions } from './types.js';

const PROMPT_PATTERN = />>>|User:/;
const BOOT_TIMEOUT_MS = 2000;

interface InternalSession {
  ptyProcess: pty.IPty;
  pendingResolve: ((output: string) => void) | null;
  buffer: string;
}

const sessions = new Map<string, InternalSession>();

function buildChatArgs(opts: ChatSessionOptions): string[] {
  const args: string[] = ['chat'];
  if (opts.model) args.push('--model', opts.model);
  if (opts.instructions) args.push('--instructions', opts.instructions);
  if (opts.resume) args.push('--resume', opts.resume);
  return args;
}

export async function createChatSession(options: ChatSessionOptions = {}): Promise<ChatSession> {
  const id = uuidv4();
  const args = buildChatArgs(options);

  const ptyProcess = pty.spawn('fm', args, {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: process.env as Record<string, string>,
  });

  const internal: InternalSession = {
    ptyProcess,
    pendingResolve: null,
    buffer: '',
  };

  sessions.set(id, internal);

  ptyProcess.onData((data: string) => {
    internal.buffer += data;
    if (internal.pendingResolve && PROMPT_PATTERN.test(internal.buffer)) {
      const resolve = internal.pendingResolve;
      internal.pendingResolve = null;
      const output = internal.buffer;
      internal.buffer = '';
      resolve(output);
    }
  });

  // Wait for initial boot prompt
  await new Promise<string>((resolve) => {
    internal.pendingResolve = resolve;
    setTimeout(() => {
      if (internal.pendingResolve) {
        internal.pendingResolve = null;
        internal.buffer = '';
        resolve('');
      }
    }, BOOT_TIMEOUT_MS);
  });

  const session: ChatSession = {
    id,
    async send(message: string): Promise<string> {
      const s = sessions.get(id);
      if (!s) throw new Error(`Session ${id} not found`);

      const responsePromise = new Promise<string>((resolve) => {
        s.pendingResolve = resolve;
      });

      s.ptyProcess.write(`${message}\n`);
      const rawOutput = await responsePromise;

      // Strip the echoed input and prompt delimiter
      return rawOutput
        .replace(message, '')
        .replace(/>>>/g, '')
        .replace(/User:/g, '')
        .trim();
    },
    async close(): Promise<void> {
      const s = sessions.get(id);
      if (s) {
        s.ptyProcess.kill();
        sessions.delete(id);
      }
    },
  };

  return session;
}

export function closeChatSession(id: string): boolean {
  const s = sessions.get(id);
  if (!s) return false;
  s.ptyProcess.kill();
  sessions.delete(id);
  return true;
}

export function getSession(id: string): InternalSession | undefined {
  return sessions.get(id);
}
