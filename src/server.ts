import HyperExpress from 'hyper-express';
import type { Request, Response } from 'hyper-express';
import pino from 'pino';

import { lookupApiKey } from './auth/api-key.js';
import { AGENT_LOCALS_KEY, buildRateLimitMiddleware, getAgentFromLocals } from './auth/rate-limiter.js';
import { loadConfig } from './config.js';
import { Emulator } from './game/emulator.js';
import { createGameStateService } from './game/game-state-service.js';
import type { LiveGameStateService } from './game/game-state-service.js';
import { extractBattleState } from './game/memory-map.js';
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

const emulator = new Emulator();

if (config.POKEMON_RED_ROM_PATH) {
	try {
		emulator.loadRom(config.POKEMON_RED_ROM_PATH);
		logger.info({ path: config.POKEMON_RED_ROM_PATH }, 'ROM loaded');
	} catch (err) {
		logger.error({ err, path: config.POKEMON_RED_ROM_PATH }, 'Failed to load ROM');
	}
} else {
	logger.warn('No POKEMON_RED_ROM_PATH set. Emulator will not be initialized.');
}

// ─── Game Engine ────────────────────────────────────────────────────────────

const GAME_ID = 'default';
const stateManager = new StateManager(redis, logger.child({ module: 'state-manager' }));
const voteAggregator = new VoteAggregator(redis, logger.child({ module: 'vote-aggregator' }));
const tickProcessor = new TickProcessor(stateManager, voteAggregator, logger.child({ module: 'tick-processor' }), {
	tickIntervalMs: config.TICK_INTERVAL_MS,
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

// Initialize game state if emulator is ready
if (emulator.isInitialized) {
	const ram = emulator.getRAM();
	const initialState = extractBattleState(ram, GAME_ID, 0);
	await stateManager.saveState(initialState);
	await tickProcessor.start(GAME_ID);
	logger.info({ gameId: GAME_ID, tickIntervalMs: config.TICK_INTERVAL_MS }, 'Game engine started');
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

// ─── HTTP + WebSocket Server ────────────────────────────────────────────────

const app = new HyperExpress.Server();

async function authMiddleware(req: Request, res: Response): Promise<void> {
	const rawKey = req.headers['x-api-key'];
	if (!rawKey || typeof rawKey !== 'string') {
		res.status(401).json({ error: 'Missing API key', code: 'MISSING_AUTH' });
		return;
	}

	const agent = await lookupApiKey(redis, rawKey);
	if (!agent) {
		res.status(401).json({ error: 'Invalid API key', code: 'INVALID_AUTH' });
		return;
	}

	req.locals[AGENT_LOCALS_KEY] = agent;
}

const rateLimitMiddleware = buildRateLimitMiddleware(redis);

app.get('/health', (_req: Request, res: Response) => {
	res.json({
		status: 'ok',
		time: Date.now(),
		emulatorReady: emulator.isInitialized,
		gameRunning: tickProcessor.isRunning(),
	});
});

const apiRouter = new HyperExpress.Router();
apiRouter.use(authMiddleware);
apiRouter.use(rateLimitMiddleware);

apiRouter.get('/state', async (_req: Request, res: Response) => {
	const rawState = await redis.get('game:state:default');
	if (!rawState) {
		res.status(503).json({ error: 'Game state unavailable', code: 'STATE_UNAVAILABLE' });
		return;
	}
	res.header('Content-Type', 'application/json');
	res.send(rawState);
});

apiRouter.post('/vote', async (req: Request, res: Response) => {
	const agent = getAgentFromLocals(req);
	if (!agent) {
		res.status(401).json({ error: 'Unauthorized', code: 'MISSING_AUTH' });
		return;
	}

	const body: unknown = await req.json();

	const parsed = VoteRequestSchema.safeParse(body);
	if (!parsed.success) {
		res.status(400).json({ error: 'Invalid request body', code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
		return;
	}

	const { action, tick } = parsed.data;

	const tickKey = `tick:${tick ?? 'current'}:votes`;
	await redis.zincrby(tickKey, 1, action);

	const currentTick = Number((await redis.get('game:tick')) ?? '0');
	logger.debug({ agentId: agent.agentId, action, tick: currentTick }, 'vote recorded');

	res.status(202).json({
		accepted: true,
		tick: currentTick,
		action,
	});
});

app.use('/api/v1', apiRouter);

app.ws(
	'/agent/stream',
	{
		compression: 0,
		// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
		idle_timeout: 120,
		// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
		max_backpressure: 64 * 1024,
		// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
		max_payload_length: 4 * 1024,
	},
	(ws) => {
		logger.debug('WebSocket client connected');

		ws.on('message', (rawMessage: string) => {
			let parsed: unknown;
			try {
				parsed = JSON.parse(rawMessage);
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
		});

		ws.on('close', () => {
			logger.debug('WebSocket client disconnected');
		});

		ws.subscribe('game-state');
	},
);

await app.listen(config.PORT, config.HOST);
logger.info({ host: config.HOST, port: config.PORT }, 'HTTP server listening');
logger.info({ host: config.HOST, port: config.MCP_PORT }, 'MCP server listening');

// ─── Graceful Shutdown ──────────────────────────────────────────────────────

function shutdown(): void {
	logger.info('Shutting down...');
	tickProcessor.stop();
	emulator.shutdown();
	mcpServer.close();
	app.close();
	redis.quit().catch((err: unknown) => {
		logger.error({ err }, 'Error closing Redis');
	});
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
