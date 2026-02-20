declare module 'serverboy' {
	interface KeyMap {
		readonly RIGHT: 0;
		readonly LEFT: 1;
		readonly UP: 2;
		readonly DOWN: 3;
		readonly A: 4;
		readonly B: 5;
		readonly SELECT: 6;
		readonly START: 7;
	}

	class ServerBoy {
		loadRom(rom: Array<number>, saveData?: Array<number>): boolean;
		doFrame(partial?: boolean): Array<number>;
		pressKey(key: string | number): void;
		pressKeys(keys: Array<string | number>): void;
		getKeys(): Array<boolean>;
		getScreen(): Array<number>;
		getMemory(start?: number, end?: number): Array<number>;
		setMemory(start: number, data: Array<number>): void;
		getSaveData(): Array<number>;
		getAudio(): Array<number>;
	}

	namespace ServerBoy {
		export type { KeyMap };
		const KEYMAP: KeyMap;
	}

	export = ServerBoy;
}
