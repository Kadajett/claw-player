import { readFileSync } from 'node:fs';
import ServerBoy from 'serverboy';

export type GbButton = 'A' | 'B' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'START' | 'SELECT';

const GB_FRAMES_PER_SECOND = 60;

// Number of frames to advance while waiting for battle text to scroll
const FRAMES_PER_BUTTON_PRESS = 10;

export class Emulator {
	private gb: InstanceType<typeof ServerBoy> | null = null;

	get isInitialized(): boolean {
		return this.gb !== null;
	}

	/**
	 * Load a Pokemon Red ROM from the given file path and start emulation.
	 * The ROM file must be a legally obtained copy - it is not distributed with this project.
	 */
	loadRom(romPath: string): void {
		const romBuffer = readFileSync(romPath);
		const romData = Array.from(romBuffer) as Array<number>;
		this.gb = new ServerBoy();
		this.gb.loadRom(romData);
	}

	/**
	 * Advance emulation by the specified number of frames.
	 * At 60fps, 60 frames = ~1 second of game time.
	 */
	advanceFrames(count: number): void {
		this.assertInitialized();
		for (let i = 0; i < count; i++) {
			this.gb?.doFrame();
		}
	}

	/**
	 * Press a button for one frame, then advance to let the input register.
	 */
	pressButton(button: GbButton): void {
		this.assertInitialized();
		this.gb?.pressKey(button);
		this.advanceFrames(FRAMES_PER_BUTTON_PRESS);
	}

	/**
	 * Press a sequence of buttons with frames between each press.
	 */
	pressButtons(buttons: Array<GbButton>): void {
		for (const button of buttons) {
			this.pressButton(button);
		}
	}

	/**
	 * Return raw Game Boy memory as a readonly array.
	 * Pokemon Red has 64KB address space (0x0000 - 0xFFFF).
	 */
	getRAM(): ReadonlyArray<number> {
		this.assertInitialized();
		return this.gb?.getMemory() ?? [];
	}

	/**
	 * Read a single byte at the given memory address.
	 */
	readByte(address: number): number {
		const ram = this.getRAM();
		return ram[address] ?? 0;
	}

	/**
	 * Read a 16-bit big-endian value (high byte then low byte).
	 */
	readWord(addressHigh: number): number {
		const ram = this.getRAM();
		const high = ram[addressHigh] ?? 0;
		const low = ram[addressHigh + 1] ?? 0;
		return (high << 8) | low;
	}

	/**
	 * Read `length` bytes starting at `address`.
	 */
	readBytes(address: number, length: number): ReadonlyArray<number> {
		const ram = this.getRAM();
		return ram.slice(address, address + length);
	}

	/**
	 * Advance a configurable number of seconds of in-game time.
	 * Useful for waiting out battle animations.
	 */
	advanceSeconds(seconds: number): void {
		this.advanceFrames(Math.round(seconds * GB_FRAMES_PER_SECOND));
	}

	/**
	 * Release the emulator instance. The next call to loadRom() will start fresh.
	 */
	shutdown(): void {
		this.gb = null;
	}

	private assertInitialized(): void {
		if (!this.gb) {
			throw new Error('Emulator not initialized - call loadRom() first');
		}
	}
}
