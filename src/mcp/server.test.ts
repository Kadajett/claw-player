import type http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStateService, GetGameStateOutput, GetHistoryOutput, GetRateLimitOutput } from '../types/mcp.js';
import { createMcpHttpServer } from './server.js';

const mockGameState: GetGameStateOutput = {
	round: 1,
	phase: 'voting',
	secondsRemaining: 10,
	clawPosition: { x: 50, y: 50 },
	prizes: [],
	yourScore: 0,
	yourRank: 1,
	totalAgents: 1,
	streak: 0,
	achievementsPending: [],
	leaderboard: [],
	nextBonusRoundIn: 10,
	tip: 'Welcome to Claw Player!',
};

const mockRateLimit: GetRateLimitOutput = {
	requestsRemaining: 20,
	requestsPerSecond: 20,
	burstCapacity: 30,
	resetAt: '2026-02-19T12:00:00.000Z',
	windowSeconds: 60,
};

const mockHistory: GetHistoryOutput = {
	rounds: [],
	yourStats: {
		totalRounds: 0,
		wins: 0,
		winRate: 0,
		bestStreak: 0,
		totalScore: 0,
		rank: 1,
	},
};

function makeService(): GameStateService {
	return {
		getGameState: vi.fn().mockResolvedValue(mockGameState),
		submitAction: vi.fn().mockResolvedValue({
			success: true,
			outcome: 'ok',
			pointsEarned: 10,
			newScore: 10,
			newRank: 1,
			rankChange: '0',
			achievementsUnlocked: [],
			rateLimitRemaining: 19,
		}),
		getRateLimit: vi.fn().mockResolvedValue(mockRateLimit),
		getHistory: vi.fn().mockResolvedValue(mockHistory),
	};
}

function makeRedis(agentId: string | null = 'agent-test'): ReturnType<typeof vi.fn> {
	return { hget: vi.fn().mockResolvedValue(agentId) };
}

function getPort(server: http.Server): number {
	const addr = server.address();
	if (addr === null || typeof addr === 'string') throw new Error('Unexpected address');
	return addr.port;
}

describe('createMcpHttpServer', () => {
	let server: http.Server;

	afterEach(() => {
		server.close();
	});

	it('starts and responds to GET /health', async () => {
		server = createMcpHttpServer({
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			redis: makeRedis() as any,
			gameStateService: makeService(),
			port: 0,
			host: '127.0.0.1',
		});

		await new Promise<void>((r) => server.once('listening', r));
		const port = getPort(server);

		const res = await fetch(`http://127.0.0.1:${port}/health`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string };
		expect(body.status).toBe('ok');
	});

	it('returns 404 for unknown paths', async () => {
		server = createMcpHttpServer({
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			redis: makeRedis() as any,
			gameStateService: makeService(),
			port: 0,
			host: '127.0.0.1',
		});

		await new Promise<void>((r) => server.once('listening', r));
		const port = getPort(server);

		const res = await fetch(`http://127.0.0.1:${port}/unknown`);
		expect(res.status).toBe(404);
	});

	it('returns 401 for /mcp when key not found in Redis', async () => {
		server = createMcpHttpServer({
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			redis: makeRedis(null) as any,
			gameStateService: makeService(),
			port: 0,
			host: '127.0.0.1',
		});

		await new Promise<void>((r) => server.once('listening', r));
		const port = getPort(server);

		const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: { 'X-Api-Key': 'invalid-key' },
		});
		expect(res.status).toBe(401);
	});

	it('returns 401 for /mcp with no API key header', async () => {
		server = createMcpHttpServer({
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			redis: makeRedis() as any,
			gameStateService: makeService(),
			port: 0,
			host: '127.0.0.1',
		});

		await new Promise<void>((r) => server.once('listening', r));
		const port = getPort(server);

		const res = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST' });
		expect(res.status).toBe(401);
	});
});

describe('createMcpHttpServer MCP integration', () => {
	let server: http.Server;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		server.close();
	});

	it('accepts /mcp POST with valid key and returns a non-4xx response', async () => {
		server = createMcpHttpServer({
			// biome-ignore lint/suspicious/noExplicitAny: test mock
			redis: makeRedis('agent-test') as any,
			gameStateService: makeService(),
			port: 0,
			host: '127.0.0.1',
		});

		await new Promise<void>((r) => server.once('listening', r));
		const port = getPort(server);

		// A valid MCP JSON-RPC initialize request
		const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'X-Api-Key': 'valid-key',
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: {
					protocolVersion: '2024-11-05',
					capabilities: {},
					clientInfo: { name: 'test-client', version: '1.0.0' },
				},
			}),
		});

		// MCP server must not return 401 (auth works) or 400 (parse works)
		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(400);
	});
});
