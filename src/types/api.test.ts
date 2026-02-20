import { describe, expect, it } from 'vitest';
import {
	ApiKeyMetadataSchema,
	GameStateSchema,
	PLANS,
	PLAN_BURST,
	PLAN_RPS,
	VoteRequestSchema,
	WsIncomingMessageSchema,
	WsOutgoingMessageSchema,
} from './api.js';

describe('PLANS and rate tiers', () => {
	it('defines all three plan tiers', () => {
		expect(PLANS).toContain('free');
		expect(PLANS).toContain('standard');
		expect(PLANS).toContain('premium');
	});

	it('free tier has lowest RPS', () => {
		expect(PLAN_RPS.free).toBeLessThan(PLAN_RPS.standard);
		expect(PLAN_RPS.standard).toBeLessThan(PLAN_RPS.premium);
	});

	it('burst is greater than RPS for all plans', () => {
		for (const plan of PLANS) {
			expect(PLAN_BURST[plan]).toBeGreaterThan(PLAN_RPS[plan]);
		}
	});
});

describe('VoteRequestSchema', () => {
	it('accepts valid vote request', () => {
		const result = VoteRequestSchema.safeParse({ action: 'move_right' });
		expect(result.success).toBe(true);
	});

	it('accepts vote with tick', () => {
		const result = VoteRequestSchema.safeParse({ action: 'jump', tick: 42 });
		expect(result.success).toBe(true);
	});

	it('rejects empty action', () => {
		const result = VoteRequestSchema.safeParse({ action: '' });
		expect(result.success).toBe(false);
	});

	it('rejects action over 64 characters', () => {
		const result = VoteRequestSchema.safeParse({ action: 'a'.repeat(65) });
		expect(result.success).toBe(false);
	});
});

describe('ApiKeyMetadataSchema', () => {
	it('accepts valid metadata', () => {
		const result = ApiKeyMetadataSchema.safeParse({
			agentId: 'agent-1',
			plan: 'standard',
			rpsLimit: 20,
			createdAt: 1700000000000,
		});
		expect(result.success).toBe(true);
	});

	it('rejects unknown plan', () => {
		const result = ApiKeyMetadataSchema.safeParse({
			agentId: 'x',
			plan: 'enterprise',
			rpsLimit: 100,
			createdAt: 1,
		});
		expect(result.success).toBe(false);
	});
});

describe('GameStateSchema', () => {
	it('accepts valid game state', () => {
		const result = GameStateSchema.safeParse({
			tick: 5,
			phase: 'voting',
			board: { player: { x: 0, y: 0 } },
			// biome-ignore lint/style/useNamingConvention: game action names use snake_case
			votes: { move_right: 3, jump: 1 },
			leadingAction: 'move_right',
			tickEndsAt: Date.now() + 10000,
		});
		expect(result.success).toBe(true);
	});

	it('rejects invalid phase', () => {
		const result = GameStateSchema.safeParse({
			tick: 0,
			phase: 'waiting',
			board: {},
			votes: {},
			leadingAction: null,
			tickEndsAt: 1,
		});
		expect(result.success).toBe(false);
	});
});

describe('WsIncomingMessageSchema', () => {
	it('parses ping message', () => {
		const result = WsIncomingMessageSchema.safeParse({ type: 'ping' });
		expect(result.success).toBe(true);
	});

	it('parses subscribe message', () => {
		const result = WsIncomingMessageSchema.safeParse({ type: 'subscribe', channel: 'game-state' });
		expect(result.success).toBe(true);
	});

	it('rejects unknown type', () => {
		const result = WsIncomingMessageSchema.safeParse({ type: 'unknown' });
		expect(result.success).toBe(false);
	});
});

describe('WsOutgoingMessageSchema', () => {
	it('parses pong message', () => {
		const result = WsOutgoingMessageSchema.safeParse({ type: 'pong' });
		expect(result.success).toBe(true);
	});

	it('parses error message', () => {
		const result = WsOutgoingMessageSchema.safeParse({ type: 'error', code: 'RATE_LIMITED', message: 'slow down' });
		expect(result.success).toBe(true);
	});
});
