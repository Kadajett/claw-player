import type { Logger } from 'pino';

import type { GameBoyEmulator } from './emulator-interface.js';
import { ADDR_IN_BATTLE } from './memory-map.js';

// ─── Polling Constants ───────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_WAIT_MS = 10_000;

// Pokemon Red RAM addresses for detecting battle menu readiness
const ADDR_TEXT_PROGRESS = 0xcf4f; // wLetterPrintingDelayFlags: nonzero while text printing
const ADDR_BATTLE_TYPE = 0xd057; // 0=no battle, 1=wild, 2=trainer

export type PollOptions = {
	pollIntervalMs?: number;
	maxWaitMs?: number;
};

// ─── State Poller ────────────────────────────────────────────────────────────
// Polls RAM addresses to detect when the game has returned to an actionable
// state instead of using fixed delays.

export class StatePoller {
	private readonly emulator: GameBoyEmulator;
	private readonly logger: Logger;

	constructor(emulator: GameBoyEmulator, logger: Logger) {
		this.emulator = emulator;
		this.logger = logger;
	}

	/**
	 * Wait until the battle menu is ready for input.
	 * Returns true if ready, false if timed out.
	 */
	async waitForBattleMenuReady(options?: PollOptions): Promise<boolean> {
		const pollInterval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		const maxWait = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
		const startTime = Date.now();

		while (Date.now() - startTime < maxWait) {
			const inBattle = await this.emulator.readByte(ADDR_IN_BATTLE);
			if (inBattle === 0) {
				this.logger.debug('Battle ended while waiting for menu');
				return true;
			}

			const textProgress = await this.emulator.readByte(ADDR_TEXT_PROGRESS);
			if (textProgress === 0) {
				this.logger.debug({ elapsed: Date.now() - startTime }, 'Battle menu ready');
				return true;
			}

			await this.emulator.waitMs(pollInterval);
		}

		this.logger.warn({ maxWait }, 'Timed out waiting for battle menu');
		return false;
	}

	/**
	 * Wait until text has finished printing (scrolling text, move announcements).
	 * Returns true when text is done, false if timed out.
	 */
	async waitForTextComplete(options?: PollOptions): Promise<boolean> {
		const pollInterval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		const maxWait = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
		const startTime = Date.now();

		while (Date.now() - startTime < maxWait) {
			const textFlags = await this.emulator.readByte(ADDR_TEXT_PROGRESS);
			if (textFlags === 0) {
				this.logger.debug({ elapsed: Date.now() - startTime }, 'Text printing complete');
				return true;
			}

			await this.emulator.waitMs(pollInterval);
		}

		this.logger.warn({ maxWait }, 'Timed out waiting for text to complete');
		return false;
	}

	/**
	 * Wait until the game is in a battle state.
	 * Useful after overworld transitions.
	 */
	async waitForBattle(options?: PollOptions): Promise<boolean> {
		const pollInterval = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
		const maxWait = options?.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
		const startTime = Date.now();

		while (Date.now() - startTime < maxWait) {
			const battleType = await this.emulator.readByte(ADDR_BATTLE_TYPE);
			if (battleType !== 0) {
				this.logger.debug({ elapsed: Date.now() - startTime, battleType }, 'Battle detected');
				return true;
			}

			await this.emulator.waitMs(pollInterval);
		}

		this.logger.warn({ maxWait }, 'Timed out waiting for battle');
		return false;
	}

	/**
	 * Check whether the game is currently in a battle.
	 */
	async isInBattle(): Promise<boolean> {
		const inBattle = await this.emulator.readByte(ADDR_IN_BATTLE);
		return inBattle !== 0;
	}
}
