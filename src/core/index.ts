// Core library public API
export { respond, buildRespondArgs } from './respond.js';
export { createChatSession, closeChatSession, getSession } from './chat.js';
export { getAvailableModels, getQuotaUsage } from './models.js';
export { countTokens } from './tokens.js';

export type {
  FmModel,
  RespondOptions,
  RespondResult,
  ChatSession,
  ChatSessionOptions,
  ModelAvailability,
  QuotaUsage,
  TokenCountOptions,
  TokenCountResult,
} from './types.js';

export {
  FmModelSchema,
  RespondOptionsSchema,
  RespondResultSchema,
  ChatSessionOptionsSchema,
  ModelAvailabilitySchema,
  QuotaUsageSchema,
  TokenCountOptionsSchema,
  TokenCountResultSchema,
} from './types.js';
