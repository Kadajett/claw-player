// ─── Shared Button Type ──────────────────────────────────────────────────────

export type GbButton = 'A' | 'B' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'START' | 'SELECT';

// ─── Async Emulator Interface ────────────────────────────────────────────────
// Both serverboy (instant) and mGBA (TCP round-trips) implement this interface.

export interface GameBoyEmulator {
	readonly isInitialized: boolean;

	loadRom(romPath: string): Promise<void>;

	pressButton(button: GbButton): Promise<void>;

	pressButtons(buttons: Array<GbButton>): Promise<void>;

	advanceFrames(count: number): Promise<void>;

	advanceSeconds(seconds: number): Promise<void>;

	getRAM(): Promise<ReadonlyArray<number>>;

	readByte(address: number): Promise<number>;

	readWord(addressHigh: number): Promise<number>;

	readBytes(address: number, length: number): Promise<ReadonlyArray<number>>;

	waitMs(ms: number): Promise<void>;

	shutdown(): Promise<void>;
}
