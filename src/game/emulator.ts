import { readFileSync } from 'node:fs';
import ServerBoy from 'serverboy';

import type { GameBoyEmulator, GbButton } from './emulator-interface.js';

// Re-export for backward compatibility
export type { GbButton } from './emulator-interface.js';

const GB_FRAMES_PER_SECOND = 60;

// Number of frames to advance while waiting for battle text to scroll
const FRAMES_PER_BUTTON_PRESS = 10;

export class Emulator implements GameBoyEmulator {
	private gb: InstanceType<typeof ServerBoy> | null = null;

	get isInitialized(): boolean {
		return this.gb !== null;
	}

	async loadRom(romPath: string): Promise<void> {
		const romBuffer = readFileSync(romPath);
		const romData = Array.from(romBuffer) as Array<number>;
		this.gb = new ServerBoy();
		this.gb.loadRom(romData);
	}

	async advanceFrames(count: number): Promise<void> {
		this.assertInitialized();
		for (let i = 0; i < count; i++) {
			this.gb?.doFrame();
		}
	}

	async pressButton(button: GbButton): Promise<void> {
		this.assertInitialized();
		this.gb?.pressKey(button);
		await this.advanceFrames(FRAMES_PER_BUTTON_PRESS);
	}

	async pressButtons(buttons: Array<GbButton>): Promise<void> {
		for (const button of buttons) {
			await this.pressButton(button);
		}
	}

	async getRAM(): Promise<ReadonlyArray<number>> {
		this.assertInitialized();
		return this.gb?.getMemory() ?? [];
	}

	async readByte(address: number): Promise<number> {
		const ram = await this.getRAM();
		return ram[address] ?? 0;
	}

	async readWord(addressHigh: number): Promise<number> {
		const ram = await this.getRAM();
		const high = ram[addressHigh] ?? 0;
		const low = ram[addressHigh + 1] ?? 0;
		return (high << 8) | low;
	}

	async readBytes(address: number, length: number): Promise<ReadonlyArray<number>> {
		const ram = await this.getRAM();
		return ram.slice(address, address + length);
	}

	async advanceSeconds(seconds: number): Promise<void> {
		await this.advanceFrames(Math.round(seconds * GB_FRAMES_PER_SECOND));
	}

	async waitMs(ms: number): Promise<void> {
		return new Promise<void>((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	async shutdown(): Promise<void> {
		this.gb = null;
	}

	private assertInitialized(): void {
		if (!this.gb) {
			throw new Error('Emulator not initialized - call loadRom() first');
		}
	}
}
