import type { Logger } from 'pino';

import type { BattleState } from '../game/types.js';
import { createLogger } from '../logger.js';
import { assertRelayClientConfig, loadRelayConfig } from './config.js';
import type { HomeClientMessage, RelayMessage, RelayVoteBatch } from './types.js';
import { RelayMessageSchema } from './types.js';

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS = 100;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_JITTER_MS = 500;

// WS readyState constants
const WS_OPEN = 1;

export type VoteBatchHandler = (batch: RelayVoteBatch) => Promise<void> | void;
export type StateProvider = () => Promise<BattleState | null> | BattleState | null;

export type HomeClientOptions = {
	relayUrl: string;
	relaySecret: string;
	onVoteBatch: VoteBatchHandler;
	getState: StateProvider;
	logger?: Logger;
};

type WsLike = {
	send: (data: string) => void;
	close: () => void;
	on: (event: string, listener: (...args: Array<unknown>) => void) => void;
	readyState: number;
};

type WsConstructor = new (url: string) => WsLike;

type GlobalWithWs = {
	// biome-ignore lint/style/useNamingConvention: WebSocket is a standard Web API name
	WebSocket?: WsConstructor;
};

function getWebSocketConstructor(): WsConstructor | null {
	const g = globalThis as unknown as GlobalWithWs;
	return g.WebSocket ?? null;
}

export class HomeClient {
	private readonly relayUrl: string;
	private readonly relaySecret: string;
	private readonly onVoteBatch: VoteBatchHandler;
	private readonly getState: StateProvider;
	private readonly logger: Logger;

	private ws: WsLike | null = null;
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
	private stopped = false;

	constructor(options: HomeClientOptions) {
		this.relayUrl = options.relayUrl;
		this.relaySecret = options.relaySecret;
		this.onVoteBatch = options.onVoteBatch;
		this.getState = options.getState;
		this.logger = options.logger ?? createLogger('home-client');
	}

	start(): void {
		this.stopped = false;
		this.connect();
	}

	stop(): void {
		this.stopped = true;
		this.clearReconnectTimer();
		this.clearHeartbeat();
		if (this.ws) {
			try {
				this.ws.close();
			} catch {
				// ignore close errors on shutdown
			}
			this.ws = null;
		}
		this.logger.info('Home client stopped');
	}

	isConnected(): boolean {
		return this.ws !== null && this.ws.readyState === WS_OPEN;
	}

	async pushState(tickId: number, gameId: string, state: BattleState): Promise<void> {
		if (!this.isConnected()) {
			this.logger.warn({ tickId, gameId }, 'Cannot push state: not connected to relay');
			return;
		}
		const msg: HomeClientMessage = {
			type: 'state_push',
			tickId,
			gameId,
			state,
		};
		this.sendMessage(msg);
		this.logger.info({ tickId, gameId, turn: state.turn }, 'State pushed to relay');
	}

	private connect(): void {
		if (this.stopped) return;

		this.logger.info({ url: this.relayUrl, attempt: this.reconnectAttempts }, 'Connecting to relay');

		const WsConstructor = getWebSocketConstructor();
		if (!WsConstructor) {
			this.logger.error('No WebSocket implementation available in runtime');
			this.scheduleReconnect();
			return;
		}

		let socket: WsLike;
		try {
			socket = new WsConstructor(this.relayUrl);
		} catch (err) {
			this.logger.error({ err }, 'Failed to create WebSocket');
			this.scheduleReconnect();
			return;
		}

		this.ws = socket;
		this.attachSocketListeners(socket);
	}

	private attachSocketListeners(socket: WsLike): void {
		socket.on('open', () => {
			this.reconnectAttempts = 0;
			this.logger.info({ url: this.relayUrl }, 'Connected to relay, authenticating');
			socket.send(JSON.stringify({ secret: this.relaySecret }));
			this.startHeartbeat();
		});

		socket.on('message', (rawData: unknown) => {
			const raw = typeof rawData === 'string' ? rawData : String(rawData);
			this.handleRawMessage(raw);
		});

		socket.on('close', () => {
			this.logger.warn('Relay connection closed');
			this.clearHeartbeat();
			this.ws = null;
			this.scheduleReconnect();
		});

		socket.on('error', (err: unknown) => {
			this.logger.error({ err }, 'Relay WebSocket error');
		});
	}

	private handleRawMessage(raw: string): void {
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			this.logger.warn({ raw }, 'Received invalid JSON from relay');
			return;
		}

		const result = RelayMessageSchema.safeParse(parsed);
		if (!result.success) {
			this.logger.warn({ error: result.error.flatten(), parsed }, 'Received unknown relay message');
			return;
		}

		this.handleRelayMessage(result.data);
	}

	private handleRelayMessage(msg: RelayMessage): void {
		if (msg.type === 'heartbeat') {
			this.logger.debug({ timestamp: msg.timestamp }, 'Heartbeat received from relay');
			this.sendMessage({ type: 'heartbeat_ack', timestamp: msg.timestamp });
			return;
		}

		if (msg.type === 'vote_batch') {
			this.logger.info({ tickId: msg.tickId, gameId: msg.gameId, voteCount: msg.votes.length }, 'Vote batch received');
			Promise.resolve(this.onVoteBatch(msg)).catch((err: unknown) => {
				this.logger.error({ err, tickId: msg.tickId }, 'Error processing vote batch');
			});
			return;
		}

		if (msg.type === 'state_update') {
			this.logger.debug({ tickId: msg.tickId, gameId: msg.gameId }, 'State update received (loopback)');
			return;
		}

		if (msg.type === 'error') {
			this.logger.error({ code: msg.code, message: msg.message }, 'Relay error received');
			return;
		}

		// msg.type === 'auth' or unhandled - no-op
	}

	private sendMessage(msg: HomeClientMessage): void {
		if (!this.ws) {
			this.logger.warn({ type: msg.type }, 'Cannot send message: no WebSocket connection');
			return;
		}
		try {
			this.ws.send(JSON.stringify(msg));
		} catch (err) {
			this.logger.error({ err, type: msg.type }, 'Failed to send message to relay');
		}
	}

	private startHeartbeat(): void {
		this.clearHeartbeat();
		this.heartbeatTimer = setInterval(() => {
			if (!this.isConnected()) return;
			this.sendMessage({ type: 'heartbeat_ack', timestamp: Date.now() });
			this.logger.debug('Periodic heartbeat sent to relay');
		}, HEARTBEAT_INTERVAL_MS);
	}

	private clearHeartbeat(): void {
		if (this.heartbeatTimer) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	private scheduleReconnect(): void {
		if (this.stopped) return;
		this.clearReconnectTimer();

		const jitter = Math.random() * RECONNECT_JITTER_MS;
		const backoff = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
		const delay = backoff + jitter;

		this.reconnectAttempts++;
		this.logger.info({ attempt: this.reconnectAttempts, delayMs: Math.round(delay) }, 'Scheduling relay reconnect');

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}
}

// ─── Standalone Entry Point ───────────────────────────────────────────────────

export function createHomeClient(onVoteBatch: VoteBatchHandler, getState: StateProvider): HomeClient {
	const relayConfig = loadRelayConfig();
	assertRelayClientConfig(relayConfig);

	const logger = createLogger('home-client');

	return new HomeClient({
		relayUrl: relayConfig.RELAY_URL,
		relaySecret: relayConfig.RELAY_SECRET,
		onVoteBatch,
		getState,
		logger,
	});
}
