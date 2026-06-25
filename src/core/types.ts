import { z } from 'zod';

// --- Model ---

export const FmModelSchema = z.enum(['system', 'pcc']);
export type FmModel = z.infer<typeof FmModelSchema>;

// --- Respond ---

export const RespondOptionsSchema = z.object({
  model: FmModelSchema.optional(),
  instructions: z.string().optional(),
  stream: z.boolean().optional(),
  greedy: z.boolean().optional(),
  image: z.string().optional(),
  schema: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  transcript: z.string().optional(),
  saveTranscript: z.string().optional(),
  useCase: z.enum(['general', 'content-tagging']).optional(),
  guardrails: z.enum(['default', 'permissive-content-transformations']).optional(),
});
export type RespondOptions = z.infer<typeof RespondOptionsSchema>;

export const RespondResultSchema = z.object({
  text: z.string(),
});
export type RespondResult = z.infer<typeof RespondResultSchema>;

// --- Chat ---

export const ChatSessionOptionsSchema = z.object({
  model: FmModelSchema.optional(),
  instructions: z.string().optional(),
  resume: z.string().optional(),
});
export type ChatSessionOptions = z.infer<typeof ChatSessionOptionsSchema>;

export interface ChatSession {
  id: string;
  send(message: string): Promise<string>;
  close(): Promise<void>;
}

// --- Models / Availability ---

export const ModelAvailabilitySchema = z.object({
  model: FmModelSchema,
  available: z.boolean(),
});
export type ModelAvailability = z.infer<typeof ModelAvailabilitySchema>;

export const QuotaUsageSchema = z.object({
  model: FmModelSchema,
  usage: z.string(),
});
export type QuotaUsage = z.infer<typeof QuotaUsageSchema>;

// --- Token Count ---

export const TokenCountOptionsSchema = z.object({
  instructions: z.string().optional(),
  image: z.string().optional(),
  transcript: z.string().optional(),
});
export type TokenCountOptions = z.infer<typeof TokenCountOptionsSchema>;

export const TokenCountResultSchema = z.object({
  count: z.number().int().nonnegative(),
});
export type TokenCountResult = z.infer<typeof TokenCountResultSchema>;
