import type { Logger } from 'pino';
import uWS from 'uWebSockets.js';
import type { HttpRequest, HttpResponse, WebSocket, us_listen_socket } from 'uWebSockets.js';

import { lookupApiKey } from '../auth/api-key.js';
import { checkRateLimit, getRateLimitBurst } from '../auth/rate-limiter.js';
import { createLogger } from '../logger.js';
import { createRedisClient } from '../redis/client.js';
import { VoteRequestSchema } from '../types/api.js';
import { assertRelayServerConfig, loadRelayConfig } from './config.js';
import type { BattleState, HomeClientMessage, RelayMessage, VoteBuffer, VoteBufferEntry } from './types.js';
import { HomeClientMessageSchema } from './types.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HOME_CLIENT_TIMEOUT_MS = 90_000;

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

// ─── WebSocket User Data Types ──────────────────────────────────────────────

type HomeWsData = {
	authenticated: boolean;
	isHome: true;
};

type AgentWsData = {
	isHome: false;
};

// ─── Relay Server ───────────────────────────────────────────────────────────

export class RelayServer {
	private readonly app: uWS.TemplatedApp;
	private readonly logger: Logger;
	private readonly relaySecret: string;
	private readonly port: number;

	private listenSocket: us_listen_socket | null = null;
	private homeWs: WebSocket<HomeWsData> | null = null;
	private homeConnectedAt: number | null = null;
	private lastHomeHeartbeatAt: number | null = null;
	private cachedState: BattleState | null = null;
	private voteBuffer: VoteBuffer = new Map();
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

	constructor(relaySecret: string, port: number, logger: Logger) {
		this.relaySecret = relaySecret;
		this.port = port;
		this.logger = logger;
		this.app = uWS.App();
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

	private handleHomeAuth(rawMsg: unknown, ws: WebSocket<HomeWsData>): boolean {
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
				ws.end(1008, 'Auth failed');
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

	private onHomeAuthenticated(ws: WebSocket<HomeWsData>): void {
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

	private processHomeMessage(parsed: unknown, ws: WebSocket<HomeWsData>): void {
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
		this.app.get('/health', (res: HttpResponse, _req: HttpRequest) => {
			sendJson(res, 200, {
				status: 'ok',
				time: Date.now(),
				homeConnected: this.isHomeConnected(),
				cachedStateTick: this.cachedState?.turn ?? null,
				bufferedVotes: this.voteBuffer.size,
			});
		});

		this.app.ws<HomeWsData>('/home/connect', {
			compression: uWS.DISABLED,
			idleTimeout: 120,
			maxBackpressure: 4 * 1024 * 1024,
			maxPayloadLength: 1024 * 1024,

			upgrade: (res, req, context) => {
				res.upgrade(
					{ authenticated: false, isHome: true as const },
					req.getHeader('sec-websocket-key'),
					req.getHeader('sec-websocket-protocol'),
					req.getHeader('sec-websocket-extensions'),
					context,
				);
			},

			open: (_ws) => {
				this.logger.info('Home client WebSocket connecting');
			},

			message: (ws, message) => {
				const raw = Buffer.from(message).toString();
				let parsed: unknown;
				try {
					parsed = JSON.parse(raw);
				} catch {
					ws.send(
						JSON.stringify({
							type: 'error',
							code: 'PARSE_ERROR',
							message: 'Invalid JSON',
						} satisfies RelayMessage),
					);
					return;
				}

				const data = ws.getUserData();
				if (!data.authenticated) {
					data.authenticated = this.handleHomeAuth(parsed, ws);
					if (data.authenticated) {
						this.onHomeAuthenticated(ws);
					}
					return;
				}

				this.processHomeMessage(parsed, ws);
			},

			close: (ws) => {
				if (this.homeWs === ws) {
					this.homeWs = null;
					this.homeConnectedAt = null;
					this.lastHomeHeartbeatAt = null;
					this.logger.warn('Home client disconnected');
				}
			},
		});

		this.app.ws<AgentWsData>('/agent/stream', {
			compression: uWS.DISABLED,
			idleTimeout: 120,
			maxBackpressure: 64 * 1024,
			maxPayloadLength: 4 * 1024,

			upgrade: (res, req, context) => {
				res.upgrade(
					{ isHome: false as const },
					req.getHeader('sec-websocket-key'),
					req.getHeader('sec-websocket-protocol'),
					req.getHeader('sec-websocket-extensions'),
					context,
				);
			},

			open: (ws) => {
				this.logger.debug('Agent WebSocket connected');

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
			},

			message: (ws) => {
				ws.send(
					JSON.stringify({
						type: 'error',
						code: 'NOT_SUPPORTED',
						message: 'Use REST API for votes',
					} satisfies RelayMessage),
				);
				this.logger.debug('Agent WebSocket message ignored (read-only stream)');
			},

			close: () => {
				this.logger.debug('Agent WebSocket disconnected');
			},
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
		return new Promise<void>((resolve, reject) => {
			this.app.listen(this.port, (token) => {
				if (!token) {
					reject(new Error(`Failed to listen on port ${this.port}`));
					return;
				}
				this.listenSocket = token;
				this.startHeartbeat();
				this.logger.info({ port: this.port }, 'Relay server listening');
				resolve();
			});
		});
	}

	async close(): Promise<void> {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
		if (this.listenSocket) {
			uWS.us_listen_socket_close(this.listenSocket);
			this.listenSocket = null;
		}
		this.logger.info('Relay server closed');
	}

	getApp(): uWS.TemplatedApp {
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

async function relayAuthAndRateLimit(
	res: HttpResponse,
	rawKey: string,
	redis: import('ioredis').Redis,
): Promise<{ agent: import('../types/api.js').ApiKeyMetadata } | null> {
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
				.writeHeader('Retry-After', String(Math.ceil(rlResult.retryAfterMs / 1000)))
				.end(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMITED' }));
		});
		return null;
	}

	return { agent };
}

export async function startRelayServer(): Promise<RelayServer> {
	const relayConfig = loadRelayConfig();
	assertRelayServerConfig(relayConfig);

	const logger = createLogger('relay-server');
	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	const redis = createRedisClient(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
	await redis.connect();

	const server = new RelayServer(relayConfig.RELAY_SECRET, relayConfig.RELAY_PORT, logger);
	const app = server.getApp();

	app.get('/api/v1/state', (res: HttpResponse, req: HttpRequest) => {
		const rawKey = req.getHeader('x-api-key');
		let aborted = false;
		res.onAborted(() => {
			aborted = true;
		});

		(async () => {
			const auth = await relayAuthAndRateLimit(res, rawKey, redis);
			if (!auth || aborted) return;

			const cached = server.getCachedState();
			if (!cached) {
				sendJson(res, 503, { error: 'Game state unavailable', code: 'STATE_UNAVAILABLE' });
				return;
			}

			res.cork(() => {
				res.writeStatus('200 OK').writeHeader('Content-Type', 'application/json').end(JSON.stringify(cached));
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
				const auth = await relayAuthAndRateLimit(res, rawKey, redis);
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

				server.bufferVote(auth.agent.agentId, {
					agentId: auth.agent.agentId,
					action,
					timestamp: Date.now(),
				});

				const cached = server.getCachedState();
				const currentTick = cached?.turn ?? 0;

				logger.debug({ agentId: auth.agent.agentId, action, tick: currentTick }, 'Vote buffered on relay');

				if (!aborted) {
					sendJson(res, 202, { accepted: true, tick: currentTick, action });
				}
			})
			.catch((err: unknown) => {
				logger.error({ err }, 'Error in /api/v1/vote handler');
				if (!aborted) sendJson(res, 500, { error: 'Internal server error' });
			});
	});

	await server.listen();
	logger.info('Relay server started');
	return server;
}
