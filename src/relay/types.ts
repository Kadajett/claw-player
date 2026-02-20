import { z } from 'zod';
import type { GameState } from '../game/types.js';
import { gameActionSchema, gameStateSchema } from '../game/types.js';

export type { GameState };

// ─── Relay Message (Relay Server -> Agent) ────────────────────────────────────

export const RelayVoteBatchSchema = z.object({
	type: z.literal('vote_batch'),
	tickId: z.number().int().nonnegative(),
	gameId: z.string(),
	votes: z.array(
		z.object({
			agentId: z.string(),
			action: gameActionSchema,
			timestamp: z.number().int().positive(),
		}),
	),
});
export type RelayVoteBatch = z.infer<typeof RelayVoteBatchSchema>;

export const RelayStateUpdateSchema = z.object({
	type: z.literal('state_update'),
	tickId: z.number().int().nonnegative(),
	gameId: z.string(),
	state: gameStateSchema,
});
export type RelayStateUpdate = z.infer<typeof RelayStateUpdateSchema>;

export const RelayHeartbeatSchema = z.object({
	type: z.literal('heartbeat'),
	timestamp: z.number().int().positive(),
});
export type RelayHeartbeat = z.infer<typeof RelayHeartbeatSchema>;

export const RelayAuthSchema = z.object({
	type: z.literal('auth'),
	secret: z.string().min(1),
});
export type RelayAuth = z.infer<typeof RelayAuthSchema>;

export const RelayErrorSchema = z.object({
	type: z.literal('error'),
	code: z.string(),
	message: z.string(),
});
export type RelayError = z.infer<typeof RelayErrorSchema>;

export const RelayMessageSchema = z.discriminatedUnion('type', [
	RelayVoteBatchSchema,
	RelayStateUpdateSchema,
	RelayHeartbeatSchema,
	RelayAuthSchema,
	RelayErrorSchema,
]);
export type RelayMessage = z.infer<typeof RelayMessageSchema>;

// ─── Home Client Message (Home Client -> Relay Server) ────────────────────────

export const HomeVotesRequestSchema = z.object({
	type: z.literal('votes_request'),
	tickId: z.number().int().nonnegative(),
	gameId: z.string(),
});
export type HomeVotesRequest = z.infer<typeof HomeVotesRequestSchema>;

export const HomeStatePushSchema = z.object({
	type: z.literal('state_push'),
	tickId: z.number().int().nonnegative(),
	gameId: z.string(),
	state: gameStateSchema,
});
export type HomeStatePush = z.infer<typeof HomeStatePushSchema>;

export const HomeHeartbeatAckSchema = z.object({
	type: z.literal('heartbeat_ack'),
	timestamp: z.number().int().positive(),
});
export type HomeHeartbeatAck = z.infer<typeof HomeHeartbeatAckSchema>;

export const HomeClientMessageSchema = z.discriminatedUnion('type', [
	HomeVotesRequestSchema,
	HomeStatePushSchema,
	HomeHeartbeatAckSchema,
]);
export type HomeClientMessage = z.infer<typeof HomeClientMessageSchema>;

// ─── Relay Config ─────────────────────────────────────────────────────────────

export const RelayConfigSchema = z.object({
	relayMode: z.enum(['server', 'client']),
	relayUrl: z.string().url().optional(),
	relaySecret: z.string().min(16),
	relayPort: z.number().int().positive().default(4000),
});
export type RelayConfig = z.infer<typeof RelayConfigSchema>;

// ─── Vote Buffer Entry ────────────────────────────────────────────────────────

export type VoteBufferEntry = {
	agentId: string;
	action: string;
	timestamp: number;
};

export type VoteBuffer = Map<string, VoteBufferEntry>;
