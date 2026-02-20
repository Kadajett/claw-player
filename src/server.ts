import pino from 'pino';
import uWS from 'uWebSockets.js';

import type { HttpRequest, HttpResponse, us_listen_socket } from 'uWebSockets.js';

import { lookupApiKey } from './auth/api-key.js';
import { checkRateLimit, getRateLimitBurst } from './auth/rate-limiter.js';
import { loadConfig } from './config.js';
import type { GameBoyEmulator } from './game/emulator-interface.js';
import { Emulator } from './game/emulator.js';
import { createGameStateService } from './game/game-state-service.js';
import type { LiveGameStateService } from './game/game-state-service.js';
import { extractBattleState } from './game/memory-map.js';
import { MgbaEmulator } from './game/mgba-emulator.js';
import { StateManager } from './game/state.js';
import { TickProcessor } from './game/tick-processor.js';
import { VoteAggregator } from './game/vote-aggregator.js';
import { createMcpHttpServer } from './mcp/server.js';
import { createRedisClient } from './redis/client.js';
import { VoteRequestSchema, WsIncomingMessageSchema } from './types/api.js';
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
const stateManager = new StateManager(redis, logger.child({ module: 'state-manager' }));
const voteAggregator = new VoteAggregator(redis, logger.child({ module: 'vote-aggregator' }));
const tickProcessor = new TickProcessor(stateManager, voteAggregator, logger.child({ module: 'tick-processor' }), {
	tickIntervalMs: config.TICK_INTERVAL_MS,
	useRealEmulator,
	emulator: useRealEmulator ? emulator : undefined,
});

// ─── Game State Service (MCP bridge) ────────────────────────────────────────

const gameStateService: LiveGameStateService = createGameStateService({
	redis,
	stateManager,
	voteAggregator,
	logger: logger.child({ module: 'game-state-service' }),
	gameId: GAME_ID,
	tickIntervalMs: config.TICK_INTERVAL_MS,
});

// Initialize game state if emulator is ready and in a battle
if (emulator.isInitialized) {
	const ram = await emulator.getRAM();
	const battleFlag = ram[0xd058] ?? 0; // ADDR_IN_BATTLE
	if (battleFlag !== 0) {
		try {
			const initialState = extractBattleState(Array.from(ram), GAME_ID, 0);
			await stateManager.saveState(initialState);
			await tickProcessor.start(GAME_ID);
			logger.info({ gameId: GAME_ID, tickIntervalMs: config.TICK_INTERVAL_MS }, 'Game engine started (in battle)');
		} catch (err) {
			logger.warn({ err }, 'Could not initialize tick processor for current battle. MCP press_button still works.');
		}
	} else {
		logger.info('Emulator loaded but not in battle. Tick processor will start when a battle begins.');
	}
} else {
	logger.info('Game engine idle: waiting for ROM');
}

// ─── MCP Server ─────────────────────────────────────────────────────────────

const mcpServer = createMcpHttpServer({
	redis,
	gameStateService,
	emulator,
	port: config.MCP_PORT,
	host: config.HOST,
});

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

async function authenticateAndRateLimit(res: HttpResponse, rawKey: string): Promise<AuthResult | null> {
	if (!rawKey) {
		sendJson(res, 401, { error: 'Missing API key', code: 'MISSING_AUTH' });
		return null;
	}
	const agent = await lookupApiKey(redis, rawKey);
	if (!agent) {
		sendJson(res, 401, { error: 'Invalid API key', code: 'INVALID_AUTH' });
		return null;
	}

	const burst = getRateLimitBurst(agent);
	const rlResult = await checkRateLimit(redis, agent.agentId, agent.rpsLimit, burst);

	if (!rlResult.allowed) {
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
		gameRunning: tickProcessor.isRunning(),
	});
});

app.get('/api/v1/state', (res: HttpResponse, req: HttpRequest) => {
	const rawKey = req.getHeader('x-api-key');
	let aborted = false;
	res.onAborted(() => {
		aborted = true;
	});

	(async () => {
		const auth = await authenticateAndRateLimit(res, rawKey);
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
	const rawKey = req.getHeader('x-api-key');
	let aborted = false;
	res.onAborted(() => {
		aborted = true;
	});

	readBody(res)
		.then(async (bodyStr) => {
			const auth = await authenticateAndRateLimit(res, rawKey);
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

			const { action, tick } = parsed.data;
			const tickKey = `tick:${tick ?? 'current'}:votes`;
			await redis.zincrby(tickKey, 1, action);

			const currentTick = Number((await redis.get('game:tick')) ?? '0');
			if (aborted) return;

			logger.debug({ agentId: auth.agent.agentId, action, tick: currentTick }, 'vote recorded');

			res.cork(() => {
				res
					.writeStatus('202 Accepted')
					.writeHeader('Content-Type', 'application/json')
					.writeHeader('X-RateLimit-Limit', String(auth.agent.rpsLimit))
					.writeHeader('X-RateLimit-Remaining', String(auth.remaining))
					.end(JSON.stringify({ accepted: true, tick: currentTick, action }));
			});
		})
		.catch((err: unknown) => {
			logger.error({ err }, 'Error in /api/v1/vote handler');
			if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
		});
});

app.ws<Record<string, never>>('/agent/stream', {
	compression: uWS.DISABLED,
	idleTimeout: 120,
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
	tickProcessor.stop();
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
