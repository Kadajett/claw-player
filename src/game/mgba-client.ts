import { Socket } from 'node:net';
import type { Logger } from 'pino';

const TERMINATION_MARKER = '<|END|>';
const SUCCESS_MARKER = '<|SUCCESS|>';
const ERROR_MARKER = '<|ERROR|>';
const ACK_COMMAND = '<|ACK|>';

const DEFAULT_TIMEOUT_MS = 5000;

export type MgbaClientOptions = {
	host: string;
	port: number;
	logger: Logger;
	timeoutMs?: number;
};

export class MgbaSocketClient {
	private socket: Socket | null = null;
	private buffer = '';
	private responseQueue: Array<{
		resolve: (value: string) => void;
		reject: (reason: Error) => void;
		timer: ReturnType<typeof setTimeout>;
	}> = [];
	private connected = false;

	private readonly host: string;
	private readonly port: number;
	private readonly logger: Logger;
	private readonly timeoutMs: number;

	constructor(options: MgbaClientOptions) {
		this.host = options.host;
		this.port = options.port;
		this.logger = options.logger;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	}

	get isConnected(): boolean {
		return this.connected;
	}

	async connect(): Promise<void> {
		if (this.connected) return;

		await new Promise<void>((resolve, reject) => {
			const sock = new Socket();
			sock.setEncoding('utf-8');

			sock.on('data', (chunk: string) => {
				this.onData(chunk);
			});

			sock.on('error', (err: Error) => {
				this.logger.error({ err }, 'mGBA socket error');
				this.handleDisconnect();
			});

			sock.on('close', () => {
				this.logger.info('mGBA socket closed');
				this.handleDisconnect();
			});

			sock.connect(this.port, this.host, () => {
				this.socket = sock;
				this.connected = true;
				this.logger.info({ host: this.host, port: this.port }, 'Connected to mGBA socket server');
				resolve();
			});

			sock.on('error', (err: Error) => {
				if (!this.connected) {
					reject(err);
				}
			});
		});

		// Send ACK and wait for the response so it doesn't pollute subsequent commands
		await this.sendCommand(ACK_COMMAND);
	}

	async disconnect(): Promise<void> {
		if (this.socket) {
			this.socket.destroy();
			this.handleDisconnect();
		}
	}

	async sendCommand(command: string): Promise<string> {
		if (!(this.socket && this.connected)) {
			throw new Error('Not connected to mGBA socket server');
		}

		return new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => {
				const idx = this.responseQueue.findIndex((q) => q.resolve === resolve);
				if (idx !== -1) {
					this.responseQueue.splice(idx, 1);
				}
				reject(new Error(`mGBA command timed out after ${this.timeoutMs}ms: ${command}`));
			}, this.timeoutMs);

			this.responseQueue.push({ resolve, reject, timer });

			this.logger.debug({ command }, 'Sending mGBA command');
			this.sendRaw(command + TERMINATION_MARKER);
		});
	}

	// ─── Convenience Methods ──────────────────────────────────────────────────

	async tapButton(buttonName: string, duration?: number): Promise<void> {
		const command =
			duration !== undefined ? `mgba-http.button.hold,${buttonName},${duration}` : `mgba-http.button.tap,${buttonName}`;

		const response = await this.sendCommand(command);
		this.assertSuccess(response, `tapButton(${buttonName})`);
	}

	async read8(address: number): Promise<number> {
		const response = await this.sendCommand(`core.read8,${address}`);
		const value = Number.parseInt(response, 10);
		if (Number.isNaN(value)) {
			throw new Error(`Invalid read8 response at 0x${address.toString(16)}: ${response}`);
		}
		return value;
	}

	async read16(address: number): Promise<number> {
		const response = await this.sendCommand(`core.read16,${address}`);
		const value = Number.parseInt(response, 10);
		if (Number.isNaN(value)) {
			throw new Error(`Invalid read16 response at 0x${address.toString(16)}: ${response}`);
		}
		return value;
	}

	async readRange(address: number, length: number): Promise<ReadonlyArray<number>> {
		const response = await this.sendCommand(`core.readRange,${address},${length}`);
		if (response === SUCCESS_MARKER || response === ERROR_MARKER) {
			throw new Error(`readRange failed at 0x${address.toString(16)}, length ${length}`);
		}
		// Response is comma-separated hex bytes like "0a,1b,2c"
		return response.split(',').map((hex) => {
			const val = Number.parseInt(hex.trim(), 16);
			return Number.isNaN(val) ? 0 : val;
		});
	}

	async currentFrame(): Promise<number> {
		const response = await this.sendCommand('core.currentFrame');
		return Number.parseInt(response, 10);
	}

	// ─── Internal ─────────────────────────────────────────────────────────────

	private sendRaw(data: string): void {
		this.socket?.write(data);
	}

	private onData(chunk: string): void {
		this.buffer += chunk;

		while (true) {
			const markerIdx = this.buffer.indexOf(TERMINATION_MARKER);
			if (markerIdx === -1) break;

			const message = this.buffer.slice(0, markerIdx);
			this.buffer = this.buffer.slice(markerIdx + TERMINATION_MARKER.length);

			this.logger.debug({ response: message.slice(0, 100) }, 'mGBA response received');
			this.resolveNext(message);
		}
	}

	private resolveNext(message: string): void {
		const pending = this.responseQueue.shift();
		if (pending) {
			clearTimeout(pending.timer);
			pending.resolve(message);
		}
	}

	private handleDisconnect(): void {
		this.connected = false;
		this.socket = null;

		for (const pending of this.responseQueue) {
			clearTimeout(pending.timer);
			pending.reject(new Error('mGBA socket disconnected'));
		}
		this.responseQueue = [];
		this.buffer = '';
	}

	private assertSuccess(response: string, context: string): void {
		if (response === ERROR_MARKER) {
			throw new Error(`mGBA command failed: ${context}`);
		}
	}
}
