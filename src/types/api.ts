import { z } from 'zod';

import { gameActionSchema } from '../game/types.js';

export const PLANS = ['free', 'standard', 'premium'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_RPS: Record<Plan, number> = {
	free: 5,
	standard: 20,
	premium: 100,
};

export const PLAN_BURST: Record<Plan, number> = {
	free: 8,
	standard: 30,
	premium: 150,
};

// Zod schemas - runtime validation boundaries

export const VoteRequestSchema = z.object({
	action: gameActionSchema,
	tick: z.number().int().nonnegative().optional(),
});
export type VoteRequest = z.infer<typeof VoteRequestSchema>;

export const VoteResponseSchema = z.object({
	accepted: z.boolean(),
	tick: z.number().int().nonnegative(),
	action: z.string(),
	message: z.string().optional(),
});
export type VoteResponse = z.infer<typeof VoteResponseSchema>;

export const GameStateSchema = z.object({
	tick: z.number().int().nonnegative(),
	phase: z.enum(['voting', 'executing', 'complete']),
	board: z.record(z.string(), z.unknown()),
	votes: z.record(z.string(), z.number().int().nonnegative()),
	leadingAction: z.string().nullable(),
	tickEndsAt: z.number().int().positive(),
});
export type GameState = z.infer<typeof GameStateSchema>;

export const ApiKeyMetadataSchema = z.object({
	agentId: z.string().min(1),
	plan: z.enum(PLANS),
	rpsLimit: z.number().int().positive(),
	createdAt: z.number().int().positive(),
});
export type ApiKeyMetadata = z.infer<typeof ApiKeyMetadataSchema>;

export const WsIncomingMessageSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('ping') }),
	z.object({ type: z.literal('subscribe'), channel: z.string().min(1) }),
	z.object({ type: z.literal('unsubscribe'), channel: z.string().min(1) }),
	z.object({ type: z.literal('vote'), payload: VoteRequestSchema }),
]);
export type WsIncomingMessage = z.infer<typeof WsIncomingMessageSchema>;

export const WsOutgoingMessageSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('pong') }),
	z.object({ type: z.literal('state'), payload: GameStateSchema }),
	z.object({ type: z.literal('vote_ack'), payload: VoteResponseSchema }),
	z.object({ type: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type WsOutgoingMessage = z.infer<typeof WsOutgoingMessageSchema>;

export const RegisterRequestSchema = z.object({
	agentId: z
		.string()
		.min(3)
		.max(64)
		.regex(/^[a-zA-Z0-9_-]+$/, 'agentId must be alphanumeric with hyphens or underscores'),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RegisterResponseSchema = z.object({
	apiKey: z.string(),
	agentId: z.string(),
	plan: z.enum(PLANS),
	rpsLimit: z.number().int().positive(),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const ErrorResponseSchema = z.object({
	error: z.string(),
	code: z.string(),
	details: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
