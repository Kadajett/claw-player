import type { Logger } from 'pino';

import type { GameBoyEmulator, GbButton } from './emulator-interface.js';
import { MgbaSocketClient } from './mgba-client.js';
import type { MgbaClientOptions } from './mgba-client.js';

// ─── Button Name Mapping ────────────────────────────────────────────────────
// Our GbButton uses uppercase ('UP'), mGBA uses mixed case ('Up')

const BUTTON_NAME_MAP: ReadonlyMap<GbButton, string> = new Map([
	['A', 'A'],
	['B', 'B'],
	['UP', 'Up'],
	['DOWN', 'Down'],
	['LEFT', 'Left'],
	['RIGHT', 'Right'],
	['START', 'Start'],
	['SELECT', 'Select'],
]);

function toMgbaButton(button: GbButton): string {
	const mapped = BUTTON_NAME_MAP.get(button);
	if (!mapped) {
		throw new Error(`Unknown button: ${button}`);
	}
	return mapped;
}

// ─── Timing Constants ────────────────────────────────────────────────────────

// Default hold duration in frames for a button tap (mGBA runs at ~60fps)
const DEFAULT_TAP_FRAMES = 15;
// Delay between consecutive button presses to let the emulator process
const INTER_PRESS_DELAY_MS = 100;

// ─── mGBA Emulator Adapter ──────────────────────────────────────────────────

export class MgbaEmulator implements GameBoyEmulator {
	private readonly client: MgbaSocketClient;
	private readonly logger: Logger;
	private initialized = false;

	// Full RAM cache, refreshed on demand
	private ramCache: Array<number> = [];
	private ramCacheValid = false;

	constructor(options: MgbaClientOptions) {
		this.client = new MgbaSocketClient(options);
		this.logger = options.logger;
	}

	get isInitialized(): boolean {
		return this.initialized && this.client.isConnected;
	}

	async loadRom(_romPath: string): Promise<void> {
		// mGBA already has the ROM loaded in its GUI.
		// We just connect to the socket server.
		await this.client.connect();
		this.initialized = true;
		this.logger.info('mGBA emulator adapter connected (ROM managed by mGBA-qt)');
	}

	async pressButton(button: GbButton): Promise<void> {
		this.assertInitialized();
		const mgbaName = toMgbaButton(button);
		await this.client.tapButton(mgbaName, DEFAULT_TAP_FRAMES);
		this.ramCacheValid = false;
		// Give the emulator time to process the input
		await this.waitMs(INTER_PRESS_DELAY_MS);
	}

	async pressButtons(buttons: Array<GbButton>): Promise<void> {
		for (const button of buttons) {
			await this.pressButton(button);
		}
	}

	async advanceFrames(_count: number): Promise<void> {
		// mGBA runs in real time; frame advancement is not applicable.
		// This is a no-op for the mGBA backend.
		this.ramCacheValid = false;
	}

	async advanceSeconds(seconds: number): Promise<void> {
		// Wait real wall-clock time for the emulator to process
		await this.waitMs(Math.round(seconds * 1000));
		this.ramCacheValid = false;
	}

	async getRAM(): Promise<ReadonlyArray<number>> {
		this.assertInitialized();
		if (this.ramCacheValid) {
			return this.ramCache;
		}

		// mGBA's readRange doesn't work reliably for GB games over the socket.
		// Read only the specific addresses we need using individual read8 calls.
		const fullRam = new Array<number>(0x10000).fill(0);

		// All addresses used by memory-map.ts for battle + overworld state
		// Addresses verified against pret/pokered battle_struct macro
		const addresses = [
			// Battle detection
			0xd057,
			0xd058,
			// Player active pokemon (wBattleMon @ 0xD014)
			0xd014, // species
			0xd015,
			0xd016, // HP high/low
			0xd018, // status
			0xd019,
			0xd01a, // type1, type2
			0xd01c,
			0xd01d,
			0xd01e,
			0xd01f, // 4 move IDs
			0xd022, // level
			0xd023,
			0xd024, // maxHP high/low
			0xd02d,
			0xd02e,
			0xd02f,
			0xd030, // 4 PP values
			// Enemy pokemon (wEnemyMon @ 0xCFE5)
			0xcfe5, // species
			0xcfe6,
			0xcfe7, // HP high/low
			0xcfe9, // status
			0xcfea,
			0xcfeb, // type1, type2
			0xcff3, // level
			0xcff4,
			0xcff5, // maxHP high/low
			// Battle stat modifiers (player: 6 bytes)
			0xcd1a,
			0xcd1b,
			0xcd1c,
			0xcd1d,
			0xcd1e,
			0xcd1f,
			// Battle stat modifiers (enemy: 6 bytes)
			0xcd2e,
			0xcd2f,
			0xcd30,
			0xcd31,
			0xcd32,
			0xcd33,
			// Battle status bitfields (player: 3 bytes)
			0xd062,
			0xd063,
			0xd064,
			// Battle status bitfields (enemy: 3 bytes)
			0xd067,
			0xd068,
			0xd069,
			// Player active battle stats (8 bytes, big-endian 16-bit pairs)
			0xd025,
			0xd026, // wPlayerAttack
			0xd027,
			0xd028, // wPlayerDefense
			0xd029,
			0xd02a, // wPlayerSpeed
			0xd02b,
			0xd02c, // wPlayerSpecial
			// Enemy active battle stats (8 bytes)
			0xcff6,
			0xcff7, // wEnemyAttack
			0xcff8,
			0xcff9, // wEnemyDefense
			0xcffa,
			0xcffb, // wEnemySpeed
			0xcffc,
			0xcffd, // wEnemySpecial
			// Enemy moves (4 move IDs)
			0xcfed,
			0xcfee,
			0xcfef,
			0xcff0,
			// Enemy PP (4 bytes)
			0xcffe,
			0xcfff,
			0xd000,
			0xd001,
			// Current move data (player)
			0xcfd2, // wPlayerMoveID
			0xcfd3, // wPlayerMoveEffect
			0xcfd4, // wPlayerMovePower
			0xcfd5, // wPlayerMoveType
			0xcfd6, // wPlayerMoveAccuracy
			// Current move data (enemy)
			0xcfcc, // wEnemyMoveID
			0xcfcd, // wEnemyMoveEffect
			0xcfce, // wEnemyMovePower
			0xcfcf, // wEnemyMoveType
			0xcfd0, // wEnemyMoveAccuracy
			// Trainer data
			0xd031, // wTrainerClass
			0xd059, // wCurOpponent
			0xd89c, // wEnemyPartyCount
			// Misc battle state
			0xccd5, // wBattleTurnCount
			0xccd7, // wPlayerSubstituteHP
			0xccd8, // wEnemySubstituteHP
			0xd05e, // wCriticalOHKOFlag
			0xd06b, // wPlayerConfusionCounter
			0xd06c, // wPlayerToxicCounter
			// Overworld state
			0xd361,
			0xd362,
			0xd35e,
			0xc109,
			0xd368,
			0xd369,
			0xcd6b,
			0xcc26,
			0xd358,
			0xd125,
			0xcc2d, // text box ID, menu item ID (used by overworld engine)
			// Menu state
			0xcc24,
			0xcc25,
			0xcc2b, // wTopMenuItemY, wTopMenuItemX, wMaxMenuItem
			// Warp data
			0xd3ae, // wNumberOfWarps
			// Tileset collision detection
			0xd367, // wCurMapTileset
			0xcfc6, // wTileInFrontOfPlayer
			0xd71c, // wTileInFrontOfBoulderCollisionResult
			0xd535, // wGrassTile
			// Movement
			0xd700, // wWalkBikeSurfState
			0xd52a, // wPlayerDirection
			// Game state flags
			0xd05a, // wBattleType (normal/Old Man/Safari)
			0xd728, // wStatusFlags1
			0xd729, // wStatusFlags2
			0xd72a, // wStatusFlags3
			0xd72b, // wStatusFlags4
			0xd72c, // wStatusFlags5
			0xd72d, // wStatusFlags6
			0xd72e, // wStatusFlags7
			0xd734, // wElite4Flags
			0xd736, // wMovementFlags
			// Player info
			0xd158,
			0xd159,
			0xd15a,
			0xd15b,
			0xd15c,
			0xd15d,
			0xd15e,
			0xd15f,
			0xd160,
			0xd161,
			0xd162, // name
			0xd347,
			0xd348,
			0xd349, // money (BCD)
			0xd356, // badges
			0xd31d, // num bag items
			// Party data
			0xd163, // wPartyCount
		];

		// wPartySpecies: 7 bytes at 0xD164 (6 species + FF terminator)
		for (let i = 0; i < 7; i++) {
			addresses.push(0xd164 + i);
		}

		// Party Pokemon structs: up to 6 Pokemon, 44 bytes each at 0xD16B
		// Key offsets per mon: +0=species, +1/+2=HP, +4=status, +5=type1, +6=type2,
		// +8..+B=moves, +0x1D..+0x20=PP, +0x21=level, +0x22/+0x23=maxHP
		for (let mon = 0; mon < 6; mon++) {
			const base = 0xd16b + mon * 0x2c;
			addresses.push(
				base, // species
				base + 0x01,
				base + 0x02, // HP high/low
				base + 0x04, // status
				base + 0x05,
				base + 0x06, // type1, type2
				base + 0x08,
				base + 0x09,
				base + 0x0a,
				base + 0x0b, // 4 moves
				base + 0x1d,
				base + 0x1e,
				base + 0x1f,
				base + 0x20, // 4 PP
				base + 0x21, // level
				base + 0x22,
				base + 0x23, // max HP high/low
			);
		}

		// Screen tilemap (wTileMap): 20x18 grid at 0xC3A0 (360 bytes)
		// Full screen read for dialogue text + menu detection
		for (let i = 0; i < 360; i++) {
			addresses.push(0xc3a0 + i);
		}

		// Bag items: up to 20 pairs at 0xD31E
		for (let i = 0; i < 40; i++) {
			addresses.push(0xd31e + i);
		}

		// Warp entries: up to 12 warps, 4 bytes each at 0xD3AF
		for (let i = 0; i < 48; i++) {
			addresses.push(0xd3af + i);
		}

		// Sprite data: 16 sprites * key offsets
		for (let i = 0; i < 16; i++) {
			const d1 = 0xc100 + i * 0x10;
			const d2 = 0xc200 + i * 0x10;
			addresses.push(d1, d1 + 1, d1 + 9); // picture ID, movement status, facing
			addresses.push(d2 + 4, d2 + 5); // map Y, map X
		}

		// Read all addresses concurrently in batches to avoid overwhelming the socket
		const batchSize = 20;
		for (let i = 0; i < addresses.length; i += batchSize) {
			const batch = addresses.slice(i, i + batchSize);
			const values = await Promise.all(batch.map((addr) => this.client.read8(addr)));
			for (let j = 0; j < batch.length; j++) {
				// biome-ignore lint/style/noNonNullAssertion: index is always in bounds from the slice
				fullRam[batch[j]!] = values[j] ?? 0;
			}
		}

		this.ramCache = fullRam;
		this.ramCacheValid = true;

		return fullRam;
	}

	async readByte(address: number): Promise<number> {
		this.assertInitialized();
		return this.client.read8(address);
	}

	async readWord(addressHigh: number): Promise<number> {
		this.assertInitialized();
		const high = await this.client.read8(addressHigh);
		const low = await this.client.read8(addressHigh + 1);
		return (high << 8) | low;
	}

	async readBytes(address: number, length: number): Promise<ReadonlyArray<number>> {
		this.assertInitialized();
		return this.client.readRange(address, length);
	}

	async waitMs(ms: number): Promise<void> {
		return new Promise<void>((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	async shutdown(): Promise<void> {
		await this.client.disconnect();
		this.initialized = false;
		this.ramCache = [];
		this.ramCacheValid = false;
		this.logger.info('mGBA emulator adapter shut down');
	}

	private assertInitialized(): void {
		if (!(this.initialized && this.client.isConnected)) {
			throw new Error('mGBA emulator not initialized - call loadRom() first');
		}
	}
}
