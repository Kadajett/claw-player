import HyperExpress from 'hyper-express';
import type { Request, Response } from 'hyper-express';
import type { Logger } from 'pino';

import { lookupApiKey } from '../auth/api-key.js';
import { AGENT_LOCALS_KEY, buildRateLimitMiddleware, getAgentFromLocals } from '../auth/rate-limiter.js';
import { createLogger } from '../logger.js';
import { createRedisClient } from '../redis/client.js';
import { VoteRequestSchema } from '../types/api.js';
import { assertRelayServerConfig, loadRelayConfig } from './config.js';
import type { BattleState, HomeClientMessage, RelayMessage, VoteBuffer, VoteBufferEntry } from './types.js';
import { HomeClientMessageSchema } from './types.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HOME_CLIENT_TIMEOUT_MS = 90_000;

type HomeWs = {
	send: (data: string) => void;
	close: () => void;
};

export class RelayServer {
	private readonly app: HyperExpress.Server;
	private readonly logger: Logger;
	private readonly relaySecret: string;
	private readonly port: number;

	private homeWs: HomeWs | null = null;
	private homeConnectedAt: number | null = null;
	private lastHomeHeartbeatAt: number | null = null;
	private cachedState: BattleState | null = null;
	private voteBuffer: VoteBuffer = new Map();
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	constructor(relaySecret: string, port: number, logger: Logger) {
		this.relaySecret = relaySecret;
		this.port = port;
		this.logger = logger;
		this.app = new HyperExpress.Server();
		this.setupRoutes();
	}

	private isHomeConnected(): boolean {
		if (!(this.homeWs && this.lastHomeHeartbeatAt)) return false;
		return Date.now() - this.lastHomeHeartbeatAt < HOME_CLIENT_TIMEOUT_MS;
	}

	private sendToHome(msg: RelayMessage): boolean {
		if (!this.homeWs) return false;
		try {
			this.homeWs.send(JSON.stringify(msg));
			return true;
		} catch (err) {
			this.logger.error({ err }, 'Failed to send message to home client');
			return false;
		}
	}

	private broadcastToAgents(msg: RelayMessage): void {
		this.app.publish('game-state', JSON.stringify(msg));
	}

	private flushVoteBuffer(tickId: number, gameId: string): void {
		if (this.voteBuffer.size === 0) return;

		const votes = Array.from(this.voteBuffer.entries()).map(([agentId, entry]) => ({
			agentId,
			// biome-ignore lint/suspicious/noExplicitAny: action is validated as BattleAction at ingestion time
			action: entry.action as any,
			timestamp: entry.timestamp,
		}));

		const batch: RelayMessage = {
			type: 'vote_batch',
			tickId,
			gameId,
			votes,
		};

		const sent = this.sendToHome(batch);
		if (sent) {
			this.voteBuffer.clear();
			this.logger.info({ tickId, gameId, voteCount: votes.length }, 'Vote batch flushed to home client');
		} else {
			this.logger.warn({ tickId, gameId, voteCount: votes.length }, 'Home client not connected, vote batch queued');
		}
	}

	private handleHomeAuth(rawMsg: unknown, ws: HomeWs): boolean {
		const msg = rawMsg as { type?: string; secret?: string };
		if (msg.type === 'auth_home' || (msg.secret !== undefined && msg.type === undefined)) {
			if (msg.secret !== this.relaySecret) {
				this.logger.warn('Home client auth failed: wrong secret');
				ws.send(
					JSON.stringify({
						type: 'error',
						code: 'AUTH_FAILED',
						message: 'Invalid relay secret',
					} satisfies RelayMessage),
				);
				ws.close();
				return false;
			}
			return true;
		}
		// Check secret field directly for flexibility
		if (msg.secret === this.relaySecret) {
			return true;
		}
		ws.send(
			JSON.stringify({ type: 'error', code: 'AUTH_REQUIRED', message: 'Authenticate first' } satisfies RelayMessage),
		);
		return false;
	}

	private onHomeAuthenticated(ws: HomeWs): void {
		this.homeWs = ws;
		this.homeConnectedAt = Date.now();
		this.lastHomeHeartbeatAt = Date.now();
		this.logger.info('Home client authenticated and connected');

		if (this.cachedState) {
			const stateMsg: RelayMessage = {
				type: 'state_update',
				tickId: this.cachedState.turn,
				gameId: this.cachedState.gameId,
				state: this.cachedState,
			};
			ws.send(JSON.stringify(stateMsg));
		}
	}

	private handleHomeMessage(msg: HomeClientMessage): void {
		if (msg.type === 'heartbeat_ack') {
			this.lastHomeHeartbeatAt = Date.now();
			this.logger.debug({ timestamp: msg.timestamp }, 'Heartbeat ack received from home client');
			return;
		}

		if (msg.type === 'state_push') {
			this.cachedState = msg.state;
			this.logger.info(
				{ tickId: msg.tickId, gameId: msg.gameId, turn: msg.state.turn },
				'State received from home client',
			);
			this.broadcastToAgents({
				type: 'state_update',
				tickId: msg.tickId,
				gameId: msg.gameId,
				state: msg.state,
			});
			return;
		}

		if (msg.type === 'votes_request') {
			this.flushVoteBuffer(msg.tickId, msg.gameId);
		}
	}

	private setupHomeWsHandler(ws: {
		on: (event: string, cb: (...args: Array<unknown>) => void) => void;
		send: (data: string) => void;
		close: () => void;
	}): void {
		let authenticated = false;
		const homeWs: HomeWs = { send: ws.send.bind(ws), close: ws.close.bind(ws) };

		ws.on('message', (rawMessage: unknown) => {
			const raw = typeof rawMessage === 'string' ? rawMessage : String(rawMessage);
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				this.logger.warn('Home client sent invalid JSON');
				ws.send(JSON.stringify({ type: 'error', code: 'PARSE_ERROR', message: 'Invalid JSON' } satisfies RelayMessage));
				return;
			}

			if (!authenticated) {
				authenticated = this.handleHomeAuth(parsed, homeWs);
				if (authenticated) {
					this.onHomeAuthenticated(homeWs);
				}
				return;
			}

			this.processHomeMessage(parsed, ws);
		});

		ws.on('close', () => {
			if (this.homeWs === homeWs) {
				this.homeWs = null;
				this.homeConnectedAt = null;
				this.lastHomeHeartbeatAt = null;
				this.logger.warn('Home client disconnected');
			}
		});
	}

	private processHomeMessage(parsed: unknown, ws: { send: (data: string) => void }): void {
		const result = HomeClientMessageSchema.safeParse(parsed);
		if (!result.success) {
			this.logger.warn({ error: result.error.flatten() }, 'Invalid home client message');
			ws.send(
				JSON.stringify({
					type: 'error',
					code: 'VALIDATION_ERROR',
					message: 'Invalid message format',
				} satisfies RelayMessage),
			);
			return;
		}
		this.handleHomeMessage(result.data);
	}

	private setupRoutes(): void {
		this.app.get('/health', (_req: Request, res: Response) => {
			res.json({
				status: 'ok',
				time: Date.now(),
				homeConnected: this.isHomeConnected(),
				cachedStateTick: this.cachedState?.turn ?? null,
				bufferedVotes: this.voteBuffer.size,
			});
		});

		this.app.ws(
			'/home/connect',
			{
				compression: 0,
				// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
				idle_timeout: 120,
				// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
				max_backpressure: 4 * 1024 * 1024,
				// biome-ignore lint/style/useNamingConvention: uWebSockets.js API uses snake_case
				max_payload_length: 1024 * 1024,
			},
			(ws) => {
				this.logger.info('Home client WebSocket connecting');
				this.setupHomeWsHandler(
					ws as unknown as {
						on: (event: string, cb: (...args: Array<unknown>) => void) => void;
						send: (data: string) => void;
						close: () => void;
					},
				);
			},
		);

		this.app.ws(
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
				this.logger.debug('Agent WebSocket connected');
				this.setupAgentWsHandler(
					ws as unknown as {
						on: (event: string, cb: (...args: Array<unknown>) => void) => void;
						send: (data: string) => void;
						subscribe: (topic: string) => void;
					},
				);
			},
		);
	}

	private setupAgentWsHandler(ws: {
		on: (event: string, cb: (...args: Array<unknown>) => void) => void;
		send: (data: string) => void;
		subscribe: (topic: string) => void;
	}): void {
		if (this.cachedState) {
			const stateMsg: RelayMessage = {
				type: 'state_update',
				tickId: this.cachedState.turn,
				gameId: this.cachedState.gameId,
				state: this.cachedState,
			};
			ws.send(JSON.stringify(stateMsg));
		}

		ws.subscribe('game-state');

		ws.on('message', (rawMessage: unknown) => {
			ws.send(
				JSON.stringify({
					type: 'error',
					code: 'NOT_SUPPORTED',
					message: 'Use REST API for votes',
				} satisfies RelayMessage),
			);
			this.logger.debug({ rawMessage }, 'Agent WebSocket message ignored (read-only stream)');
		});

		ws.on('close', () => {
			this.logger.debug('Agent WebSocket disconnected');
		});
	}

	private startHeartbeat(): void {
		this.heartbeatTimer = setInterval(() => {
			if (!this.homeWs) return;
			const heartbeat: RelayMessage = { type: 'heartbeat', timestamp: Date.now() };
			this.sendToHome(heartbeat);
			this.logger.debug('Heartbeat sent to home client');
		}, HEARTBEAT_INTERVAL_MS);
	}

	async listen(): Promise<void> {
		await this.app.listen(this.port);
		this.startHeartbeat();
		this.logger.info({ port: this.port }, 'Relay server listening');
	}

	async close(): Promise<void> {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		await this.app.close();
		this.logger.info('Relay server closed');
	}

	getApp(): HyperExpress.Server {
		return this.app;
	}

	getCachedState(): BattleState | null {
		return this.cachedState;
	}

	getBufferedVoteCount(): number {
		return this.voteBuffer.size;
	}

	bufferVote(agentId: string, entry: VoteBufferEntry): void {
		this.voteBuffer.set(agentId, entry);
		this.logger.debug({ agentId, action: entry.action }, 'Vote buffered');
	}
}

// ─── Standalone Entry Point ───────────────────────────────────────────────────

export async function startRelayServer(): Promise<RelayServer> {
	const relayConfig = loadRelayConfig();
	assertRelayServerConfig(relayConfig);

	const logger = createLogger('relay-server');
	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	const redis = createRedisClient(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
	await redis.connect();

	const server = new RelayServer(relayConfig.RELAY_SECRET, relayConfig.RELAY_PORT, logger);
	const app = server.getApp();

	const authMiddleware = async (req: Request, res: Response): Promise<void> => {
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
	};

	const rateLimitMiddleware = buildRateLimitMiddleware(redis);

	const apiRouter = new HyperExpress.Router();
	apiRouter.use(authMiddleware);
	apiRouter.use(rateLimitMiddleware);

	apiRouter.get('/state', async (_req: Request, res: Response) => {
		const cached = server.getCachedState();
		if (!cached) {
			res.status(503).json({ error: 'Game state unavailable', code: 'STATE_UNAVAILABLE' });
			return;
		}
		res.header('Content-Type', 'application/json');
		res.send(JSON.stringify(cached));
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
			res.status(400).json({
				error: 'Invalid request body',
				code: 'VALIDATION_ERROR',
				details: parsed.error.flatten(),
			});
			return;
		}

		const { action } = parsed.data;

		server.bufferVote(agent.agentId, {
			agentId: agent.agentId,
			action,
			timestamp: Date.now(),
		});

		const cached = server.getCachedState();
		const currentTick = cached?.turn ?? 0;

		logger.debug({ agentId: agent.agentId, action, tick: currentTick }, 'Vote buffered on relay');

		res.status(202).json({ accepted: true, tick: currentTick, action });
	});

	app.use('/api/v1', apiRouter);

	await server.listen();
	logger.info('Relay server started');
	return server;
}
