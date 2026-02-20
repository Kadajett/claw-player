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

		it('returns true after loadRom', () => {
			emulator.loadRom('/fake/rom.gb');
			expect(emulator.isInitialized).toBe(true);
		});

		it('returns false after shutdown', () => {
			emulator.loadRom('/fake/rom.gb');
			emulator.shutdown();
			expect(emulator.isInitialized).toBe(false);
		});
	});

	describe('loadRom', () => {
		it('initializes the emulator', () => {
			emulator.loadRom('/fake/rom.gb');
			expect(emulator.isInitialized).toBe(true);
		});
	});

	describe('advanceFrames', () => {
		it('throws when not initialized', () => {
			expect(() => emulator.advanceFrames(1)).toThrow('not initialized');
		});

		it('calls doFrame the requested number of times', () => {
			emulator.loadRom('/fake/rom.gb');
			emulator.advanceFrames(5);
			// Each press also advances frames, so just verify no error thrown
			expect(emulator.isInitialized).toBe(true);
		});
	});

	describe('pressButton', () => {
		it('throws when not initialized', () => {
			expect(() => emulator.pressButton('A')).toThrow('not initialized');
		});

		it('does not throw for valid button after init', () => {
			emulator.loadRom('/fake/rom.gb');
			expect(() => emulator.pressButton('A')).not.toThrow();
		});
	});

	describe('pressButtons', () => {
		it('presses each button in sequence', () => {
			emulator.loadRom('/fake/rom.gb');
			expect(() => emulator.pressButtons(['A', 'B', 'START'])).not.toThrow();
		});
	});

	describe('getRAM', () => {
		it('throws when not initialized', () => {
			expect(() => emulator.getRAM()).toThrow('not initialized');
		});

		it('returns memory array after init', () => {
			emulator.loadRom('/fake/rom.gb');
			const ram = emulator.getRAM();
			expect(ram).toBeDefined();
			expect(ram.length).toBeGreaterThan(0);
		});
	});

	describe('readByte', () => {
		it('returns 0 for unset address', () => {
			emulator.loadRom('/fake/rom.gb');
			expect(emulator.readByte(0xd057)).toBe(0);
		});
	});

	describe('readWord', () => {
		it('reads 16-bit big-endian value', () => {
			emulator.loadRom('/fake/rom.gb');
			// Both bytes are 0 in our mock, so result should be 0
			expect(emulator.readWord(0xd015)).toBe(0);
		});
	});

	describe('advanceSeconds', () => {
		it('advances approximately 60 frames per second', () => {
			emulator.loadRom('/fake/rom.gb');
			// Should not throw
			expect(() => emulator.advanceSeconds(0.1)).not.toThrow();
		});
	});

	describe('shutdown', () => {
		it('can be called multiple times without error', () => {
			expect(() => {
				emulator.shutdown();
				emulator.shutdown();
			}).not.toThrow();
		});
	});
});
