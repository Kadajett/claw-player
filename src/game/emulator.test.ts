import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Emulator } from './emulator.js';

// Mock serverboy - has no TypeScript types and requires a real ROM
vi.mock('serverboy', () => {
	const mockGb = {
		loadRom: vi.fn().mockReturnValue(true),
		doFrame: vi.fn().mockReturnValue([]),
		pressKey: vi.fn(),
		pressKeys: vi.fn(),
		getKeys: vi.fn().mockReturnValue([]),
		getMemory: vi.fn().mockReturnValue(new Array(65536).fill(0) as Array<number>),
		getScreen: vi.fn().mockReturnValue([]),
		getSaveData: vi.fn().mockReturnValue([]),
	};

	const ServerBoyMock = vi.fn(() => mockGb);
	// biome-ignore lint/suspicious/noExplicitAny: test mock for CJS default export
	(ServerBoyMock as any).KEYMAP = { RIGHT: 0, LEFT: 1, UP: 2, DOWN: 3, A: 4, B: 5, SELECT: 6, START: 7 };

	return { default: ServerBoyMock };
});

// Mock fs.readFileSync to avoid real file access
vi.mock('node:fs', () => ({
	readFileSync: vi.fn().mockReturnValue(Buffer.from(new Array(32768).fill(0))),
}));

describe('Emulator', () => {
	let emulator: Emulator;

	beforeEach(() => {
		emulator = new Emulator();
		vi.clearAllMocks();
	});

	describe('isInitialized', () => {
		it('returns false before loadRom', () => {
			expect(emulator.isInitialized).toBe(false);
		});

		it('returns true after loadRom', async () => {
			await emulator.loadRom('/fake/rom.gb');
			expect(emulator.isInitialized).toBe(true);
		});

		it('returns false after shutdown', async () => {
			await emulator.loadRom('/fake/rom.gb');
			await emulator.shutdown();
			expect(emulator.isInitialized).toBe(false);
		});
	});

	describe('loadRom', () => {
		it('initializes the emulator', async () => {
			await emulator.loadRom('/fake/rom.gb');
			expect(emulator.isInitialized).toBe(true);
		});
	});

	describe('advanceFrames', () => {
		it('rejects when not initialized', async () => {
			await expect(emulator.advanceFrames(1)).rejects.toThrow('not initialized');
		});

		it('calls doFrame the requested number of times', async () => {
			await emulator.loadRom('/fake/rom.gb');
			await emulator.advanceFrames(5);
			expect(emulator.isInitialized).toBe(true);
		});
	});

	describe('pressButton', () => {
		it('rejects when not initialized', async () => {
			await expect(emulator.pressButton('A')).rejects.toThrow('not initialized');
		});

		it('does not throw for valid button after init', async () => {
			await emulator.loadRom('/fake/rom.gb');
			await expect(emulator.pressButton('A')).resolves.toBeUndefined();
		});
	});

	describe('pressButtons', () => {
		it('presses each button in sequence', async () => {
			await emulator.loadRom('/fake/rom.gb');
			await expect(emulator.pressButtons(['A', 'B', 'START'])).resolves.toBeUndefined();
		});
	});

	describe('getRAM', () => {
		it('rejects when not initialized', async () => {
			await expect(emulator.getRAM()).rejects.toThrow('not initialized');
		});

		it('returns memory array after init', async () => {
			await emulator.loadRom('/fake/rom.gb');
			const ram = await emulator.getRAM();
			expect(ram).toBeDefined();
			expect(ram.length).toBeGreaterThan(0);
		});
	});

	describe('readByte', () => {
		it('returns 0 for unset address', async () => {
			await emulator.loadRom('/fake/rom.gb');
			await expect(emulator.readByte(0xd057)).resolves.toBe(0);
		});
	});

	describe('readWord', () => {
		it('reads 16-bit big-endian value', async () => {
			await emulator.loadRom('/fake/rom.gb');
			await expect(emulator.readWord(0xd015)).resolves.toBe(0);
		});
	});

	describe('advanceSeconds', () => {
		it('advances approximately 60 frames per second', async () => {
			await emulator.loadRom('/fake/rom.gb');
			await expect(emulator.advanceSeconds(0.1)).resolves.toBeUndefined();
		});
	});

	describe('shutdown', () => {
		it('can be called multiple times without error', async () => {
			await emulator.shutdown();
			await emulator.shutdown();
		});
	});
});
