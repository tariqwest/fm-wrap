// Package entry point — re-exports core library + server factory
export * from './core/index.js';
export { createApp, createServer } from './server/index.js';
export type { ServerOptions } from './server/index.js';
