import HyperExpress from 'hyper-express';
import type { Request, Response } from 'hyper-express';
import pino from 'pino';
import { lookupApiKey } from './auth/api-key.js';
import { AGENT_LOCALS_KEY, buildRateLimitMiddleware, getAgentFromLocals } from './auth/rate-limiter.js';
import { loadConfig } from './config.js';
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

const redis = createRedisClient(config.REDIS_URL);
await redis.connect();

logger.info({ host: config.HOST, port: config.PORT }, 'Claw Player server starting');

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
	res.json({ status: 'ok', time: Date.now() });
});

const apiRouter = new HyperExpress.Router();
apiRouter.use(authMiddleware);
apiRouter.use(rateLimitMiddleware);

apiRouter.get('/state', async (_req: Request, res: Response) => {
	const rawState = await redis.get('game:state');
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
logger.info({ host: config.HOST, port: config.PORT }, 'Server listening');
