import pino from 'pino';
import uWS from 'uWebSockets.js';

import type { HttpRequest, HttpResponse, us_listen_socket } from 'uWebSockets.js';

import { registerAdminRoutes } from './auth/admin-routes.js';
import { lookupApiKey } from './auth/api-key.js';
import { checkAutoEscalation, checkBan, recordViolation } from './auth/ban.js';
import { extractIpFromUws } from './auth/ip.js';
import { checkRateLimit, getRateLimitBurst } from './auth/rate-limiter.js';
import { registerAgent } from './auth/registration.js';
import { loadConfig } from './config.js';
import type { GameBoyEmulator } from './game/emulator-interface.js';
import { Emulator } from './game/emulator.js';
import { createGameStateService } from './game/game-state-service.js';
import type { LiveGameStateService } from './game/game-state-service.js';
import { MgbaEmulator } from './game/mgba-emulator.js';
import { UnifiedTickProcessor } from './game/unified-tick-processor.js';
import { VoteAggregator } from './game/vote-aggregator.js';
import { createMcpHttpServer } from './mcp/server.js';
import { createRedisClient } from './redis/client.js';
import { createHomeClient } from './relay/home-client.js';
import { RegisterRequestSchema, VoteRequestSchema, WsIncomingMessageSchema } from './types/api.js';
import type { WsOutgoingMessage } from './types/api.js';

const config = loadConfig();

const pinoOptions: pino.LoggerOptions = {
	level: config.LOG_LEVEL,
	redact: ['req.headers["x-api-key"]', 'apiKey', 'rawKey'],
};
if (config.NODE_ENV !== 'production') {
	pinoOptions.transport = { target: 'pino-pretty' };
}

const logger = pino(pinoOptions);

// ─── Redis ──────────────────────────────────────────────────────────────────

const redis = createRedisClient(config.REDIS_URL);
await redis.connect();
logger.info({ url: config.REDIS_URL }, 'Redis connected');

// ─── Emulator ───────────────────────────────────────────────────────────────

let emulator: GameBoyEmulator;
const useRealEmulator = config.EMULATOR_BACKEND === 'mgba';

if (useRealEmulator) {
	const mgba = new MgbaEmulator({
		host: config.MGBA_HOST,
		port: config.MGBA_PORT,
		logger: logger.child({ module: 'mgba-client' }),
	});
	try {
		// loadRom connects to the mGBA socket server (ROM is loaded in mGBA-qt)
		await mgba.loadRom('');
		logger.info({ host: config.MGBA_HOST, port: config.MGBA_PORT }, 'mGBA emulator connected');
	} catch (err) {
		logger.error({ err, host: config.MGBA_HOST, port: config.MGBA_PORT }, 'Failed to connect to mGBA');
	}
	emulator = mgba;
} else {
	const serverboy = new Emulator();
	if (config.POKEMON_RED_ROM_PATH) {
		try {
			await serverboy.loadRom(config.POKEMON_RED_ROM_PATH);
			logger.info({ path: config.POKEMON_RED_ROM_PATH }, 'ROM loaded');
		} catch (err) {
			logger.error({ err, path: config.POKEMON_RED_ROM_PATH }, 'Failed to load ROM');
		}
	} else {
		logger.warn('No POKEMON_RED_ROM_PATH set. Emulator will not be initialized.');
	}
	emulator = serverboy;
}

// ─── Game Engine ────────────────────────────────────────────────────────────

const GAME_ID = 'default';
const voteAggregator = new VoteAggregator(redis, logger.child({ module: 'vote-aggregator' }));
const unifiedProcessor = new UnifiedTickProcessor(
	emulator,
	voteAggregator,
	redis,
	logger.child({ module: 'unified-tick-processor' }),
	{
		tickIntervalMs: config.TICK_INTERVAL_MS,
		emulatorSettleMs: 500,
		gameId: GAME_ID,
	},
);

// ─── Game State Service (MCP bridge) ────────────────────────────────────────

const gameStateService: LiveGameStateService = createGameStateService({
	redis,
	voteAggregator,
	logger: logger.child({ module: 'game-state-service' }),
	gameId: GAME_ID,
	tickIntervalMs: config.TICK_INTERVAL_MS,
	emulator,
});

// Start unified tick processor if emulator is ready
if (emulator.isInitialized) {
	try {
		unifiedProcessor.start();
		logger.info({ gameId: GAME_ID, tickIntervalMs: config.TICK_INTERVAL_MS }, 'Unified tick processor started');
	} catch (err) {
		logger.warn({ err }, 'Could not start unified tick processor. MCP submit_action still works.');
	}
} else {
	logger.info('Game engine idle: waiting for ROM');
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const mcpServer = createMcpHttpServer({
	redis,
	gameStateService,
	port: config.MCP_PORT,
	host: config.HOST,
});

// ─── Relay Home Client (when RELAY_MODE=client) ────────────────────────────

if (config.RELAY_MODE === 'client') {
	const homeClient = createHomeClient(
		async (batch) => {
			for (const vote of batch.votes) {
				await voteAggregator.recordVote(batch.gameId, batch.tickId, vote.agentId, vote.action);
			}
			logger.info(
				{ tickId: batch.tickId, gameId: batch.gameId, voteCount: batch.votes.length },
				'Relay vote batch injected via dedup aggregator',
			);
		},
		async () => {
			const rawState = await redis.get(`game:state:${GAME_ID}`);
			if (!rawState) return null;
			return JSON.parse(rawState) as import('./game/memory-map.js').UnifiedGameState;
		},
	);

	homeClient.start();
	logger.info('Home client started, connecting to relay');

	// Push state to relay after each tick
	unifiedProcessor.onTick(async (state) => {
		await homeClient.pushState(state.turn, state.gameId, state);
	});
}

// ─── uWS Helpers ────────────────────────────────────────────────────────────

const HTTP_STATUS: Record<number, string> = {
	200: '200 OK',
	202: '202 Accepted',
	400: '400 Bad Request',
	401: '401 Unauthorized',
	429: '429 Too Many Requests',
	503: '503 Service Unavailable',
};

function sendJson(res: HttpResponse, statusCode: number, body: unknown): void {
	const status = HTTP_STATUS[statusCode] ?? `${statusCode}`;
	res.cork(() => {
		res.writeStatus(status).writeHeader('Content-Type', 'application/json').end(JSON.stringify(body));
	});
}

function readBody(res: HttpResponse): Promise<string> {
	return new Promise<string>((resolve) => {
		let buffer = '';
		res.onData((chunk, isLast) => {
			buffer += Buffer.from(chunk).toString();
			if (isLast) {
				resolve(buffer);
			}
		});
	});
}

// ─── Auth + Rate Limit Helper ───────────────────────────────────────────────

type AuthResult = {
	agent: import('./types/api.js').ApiKeyMetadata;
	remaining: number;
};

type RequestContext = { rawKey: string; ip: string; userAgent: string };

/** Extract request context synchronously (uWS req is only valid during the sync handler). */
function extractRequestContext(res: HttpResponse, req: HttpRequest): RequestContext {
	return {
		rawKey: req.getHeader('x-api-key'),
		ip: extractIpFromUws(res, req, config.TRUST_PROXY),
		userAgent: req.getHeader('user-agent'),
	};
}

async function authenticateAndRateLimit(res: HttpResponse, ctx: RequestContext): Promise<AuthResult | null> {
	if (!ctx.rawKey) {
		sendJson(res, 401, { error: 'Missing API key', code: 'MISSING_AUTH' });
		return null;
	}
	const agent = await lookupApiKey(redis, ctx.rawKey);
	if (!agent) {
		sendJson(res, 401, { error: 'Invalid API key', code: 'INVALID_AUTH' });
		return null;
	}

	// Ban check (after auth, before rate limit)
	const banResult = await checkBan(redis, agent.agentId, ctx.ip, ctx.userAgent, logger);

	if (banResult.banned) {
		if (banResult.type === 'hard') {
			sendJson(res, 403, { error: 'Banned', code: 'BANNED', reason: banResult.reason });
			return null;
		}
		// Soft ban: 429 with ban reason
		res.cork(() => {
			res
				.writeStatus('429 Too Many Requests')
				.writeHeader('Content-Type', 'application/json')
				.end(
					JSON.stringify({
						error: 'Temporarily banned',
						code: 'SOFT_BANNED',
						reason: banResult.reason,
						expiresAt: banResult.expiresAt,
					}),
				);
		});
		return null;
	}

	const burst = getRateLimitBurst(agent);
	const rlResult = await checkRateLimit(redis, agent.agentId, agent.rpsLimit, burst);

	if (!rlResult.allowed) {
		// Track rate limit violations for auto-escalation
		await recordViolation(redis, agent.agentId, 'rateLimitHit');
		await checkAutoEscalation(
			redis,
			agent.agentId,
			ctx.ip,
			config.AUTO_BAN_RATE_LIMIT_THRESHOLD,
			config.AUTO_BAN_INVALID_REQUEST_THRESHOLD,
			logger,
		);

		res.cork(() => {
			res
				.writeStatus('429 Too Many Requests')
				.writeHeader('Content-Type', 'application/json')
				.writeHeader('X-RateLimit-Limit', String(agent.rpsLimit))
				.writeHeader('X-RateLimit-Remaining', String(rlResult.remaining))
				.writeHeader('Retry-After', String(Math.ceil(rlResult.retryAfterMs / 1000)))
				.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }));
		});
		return null;
	}

	return { agent, remaining: rlResult.remaining };
}

// ─── HTTP + WebSocket Server ────────────────────────────────────────────────

const app = uWS.App();

app.get('/health', (res: HttpResponse, _req: HttpRequest) => {
	sendJson(res, 200, {
		status: 'ok',
		time: Date.now(),
		emulatorReady: emulator.isInitialized,
		gameRunning: unifiedProcessor.isRunning(),
	});
});

app.post('/api/v1/register', (res: HttpResponse, req: HttpRequest) => {
	const registrationSecret = req.getHeader('x-registration-secret');
	let aborted = false;
	res.onAborted(() => {
		aborted = true;
	});

	readBody(res)
		.then(async (bodyStr) => {
			// Gate registration behind a shared secret when configured
			if (config.REGISTRATION_SECRET && registrationSecret !== config.REGISTRATION_SECRET) {
				sendJson(res, 401, { error: 'Invalid registration secret', code: 'INVALID_REGISTRATION_SECRET' });
				return;
			}

			let body: unknown;
			try {
				body = JSON.parse(bodyStr);
			} catch {
				sendJson(res, 400, { error: 'Invalid JSON', code: 'PARSE_ERROR' });
				return;
			}

			const parsed = RegisterRequestSchema.safeParse(body);
			if (!parsed.success) {
				sendJson(res, 400, {
					error: 'Invalid request body',
					code: 'VALIDATION_ERROR',
					details: parsed.error.flatten(),
				});
				return;
			}

			if (aborted) return;

			const result = await registerAgent(redis, parsed.data.agentId, logger);
			if (aborted) return;

			if (!result.ok) {
				sendJson(res, 409, { error: result.message, code: result.code });
				return;
			}

			sendJson(res, 200, result.response);
		})
		.catch((err: unknown) => {
			logger.error({ err }, 'Error in /api/v1/register handler');
			if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
		});
});

app.get('/api/v1/state', (res: HttpResponse, req: HttpRequest) => {
	const ctx = extractRequestContext(res, req);
	let aborted = false;
	res.onAborted(() => {
		aborted = true;
	});

	(async () => {
		const auth = await authenticateAndRateLimit(res, ctx);
		if (!auth || aborted) return;

		const rawState = await redis.get('game:state:default');
		if (aborted) return;

		if (!rawState) {
			sendJson(res, 503, { error: 'Game state unavailable', code: 'STATE_UNAVAILABLE' });
			return;
		}

		res.cork(() => {
			res
				.writeStatus('200 OK')
				.writeHeader('Content-Type', 'application/json')
				.writeHeader('X-RateLimit-Limit', String(auth.agent.rpsLimit))
				.writeHeader('X-RateLimit-Remaining', String(auth.remaining))
				.end(rawState);
		});
	})().catch((err: unknown) => {
		logger.error({ err }, 'Error in /api/v1/state handler');
		if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
	});
});

app.post('/api/v1/vote', (res: HttpResponse, req: HttpRequest) => {
	const ctx = extractRequestContext(res, req);
	let aborted = false;
	res.onAborted(() => {
		aborted = true;
	});

	readBody(res)
		.then(async (bodyStr) => {
			const auth = await authenticateAndRateLimit(res, ctx);
			if (!auth || aborted) return;

			let body: unknown;
			try {
				body = JSON.parse(bodyStr);
			} catch {
				sendJson(res, 400, { error: 'Invalid JSON', code: 'PARSE_ERROR' });
				return;
			}

			const parsed = VoteRequestSchema.safeParse(body);
			if (!parsed.success) {
				sendJson(res, 400, {
					error: 'Invalid request body',
					code: 'VALIDATION_ERROR',
					details: parsed.error.flatten(),
				});
				return;
			}

			const { action } = parsed.data;

			// Get current tick from unified processor
			const tickId = unifiedProcessor.getCurrentTick();

			// Atomic per-agent per-tick dedup via Lua script
			const dedupResult = await voteAggregator.recordVote(GAME_ID, tickId, auth.agent.agentId, action);

			logger.debug({ agentId: auth.agent.agentId, action, tickId, status: dedupResult.status }, 'vote recorded');

			res.cork(() => {
				res
					.writeStatus('202 Accepted')
					.writeHeader('Content-Type', 'application/json')
					.writeHeader('X-RateLimit-Limit', String(auth.agent.rpsLimit))
					.writeHeader('X-RateLimit-Remaining', String(auth.remaining))
					.end(JSON.stringify({ accepted: true, tick: tickId, action, voteStatus: dedupResult.status }));
			});
		})
		.catch((err: unknown) => {
			logger.error({ err }, 'Error in /api/v1/vote handler');
			if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
		});
});

app.ws<Record<string, never>>('/agent/stream', {
	compression: uWS.DISABLED,
	idleTimeout: 90,
	maxBackpressure: 64 * 1024,
	maxPayloadLength: 4 * 1024,

	open: (ws) => {
		logger.debug('WebSocket client connected');
		ws.subscribe('game-state');
	},

	message: (ws, message) => {
		const raw = Buffer.from(message).toString();
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			const errorMsg: WsOutgoingMessage = { type: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON' };
			ws.send(JSON.stringify(errorMsg));
			return;
		}

		const result = WsIncomingMessageSchema.safeParse(parsed);
		if (!result.success) {
			const errorMsg: WsOutgoingMessage = {
				type: 'error',
				code: 'VALIDATION_ERROR',
				message: 'Invalid message format',
			};
			ws.send(JSON.stringify(errorMsg));
			return;
		}

		const msg = result.data;

		if (msg.type === 'ping') {
			ws.send(JSON.stringify({ type: 'pong' } satisfies WsOutgoingMessage));
			return;
		}

		if (msg.type === 'subscribe') {
			ws.subscribe(msg.channel);
			return;
		}

		if (msg.type === 'unsubscribe') {
			ws.unsubscribe(msg.channel);
			return;
		}
	},

	close: () => {
		logger.debug('WebSocket client disconnected');
	},
});

// ─── Admin Routes ───────────────────────────────────────────────────────────

registerAdminRoutes(app, {
	redis,
	logger: logger.child({ module: 'admin' }),
	adminSecret: config.ADMIN_SECRET,
	sendJson,
	readBody,
});

let listenSocket: us_listen_socket | null = null;

app.listen(config.HOST, config.PORT, (token) => {
	if (!token) {
		logger.error({ host: config.HOST, port: config.PORT }, 'Failed to start HTTP server');
		process.exit(1);
	}
	listenSocket = token;
	logger.info({ host: config.HOST, port: config.PORT }, 'HTTP server listening');
	logger.info({ host: config.HOST, port: config.MCP_PORT }, 'MCP server listening');
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(): void {
	logger.info('Shutting down...');
	unifiedProcessor.stop();
	emulator.shutdown().catch((err: unknown) => {
		logger.error({ err }, 'Error shutting down emulator');
	});
	mcpServer.close();
	if (listenSocket) {
		uWS.us_listen_socket_close(listenSocket);
		listenSocket = null;
	}
	redis.quit().catch((err: unknown) => {
		logger.error({ err }, 'Error closing Redis');
	});
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
