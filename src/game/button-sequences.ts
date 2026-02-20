import type { GbButton } from './emulator-interface.js';
import type { BattleAction } from './types.js';

// ─── Button Step ─────────────────────────────────────────────────────────────

export type ButtonStep = {
	button: GbButton;
	delayMs: number;
};

// ─── Timing Constants ────────────────────────────────────────────────────────

const SHORT_DELAY = 200;
const CONFIRM_DELAY = 300;
const ANIMATION_DELAY = 3000;

// ─── Sequence Builders ───────────────────────────────────────────────────────

function moveSequence(index: number): Array<ButtonStep> {
	// First A opens the FIGHT menu
	const steps: Array<ButtonStep> = [{ button: 'A', delayMs: CONFIRM_DELAY }];

	// Navigate to the correct move slot (2x2 grid):
	//   move:0 = top-left     (no nav)
	//   move:1 = top-right    (RIGHT)
	//   move:2 = bottom-left  (DOWN)
	//   move:3 = bottom-right (DOWN + RIGHT)
	if (index === 1) {
		steps.push({ button: 'RIGHT', delayMs: SHORT_DELAY });
	} else if (index === 2) {
		steps.push({ button: 'DOWN', delayMs: SHORT_DELAY });
	} else if (index === 3) {
		steps.push({ button: 'DOWN', delayMs: SHORT_DELAY });
		steps.push({ button: 'RIGHT', delayMs: SHORT_DELAY });
	}

	// Confirm move selection, then wait for animation
	steps.push({ button: 'A', delayMs: ANIMATION_DELAY });

	return steps;
}

function switchSequence(partyIndex: number): Array<ButtonStep> {
	// Navigate right to POKEMON menu, then confirm
	const steps: Array<ButtonStep> = [
		{ button: 'RIGHT', delayMs: SHORT_DELAY },
		{ button: 'A', delayMs: CONFIRM_DELAY },
	];

	// Navigate down to the target party member
	for (let i = 0; i < partyIndex; i++) {
		steps.push({ button: 'DOWN', delayMs: SHORT_DELAY });
	}

	// Select the Pokemon, then confirm switch
	steps.push({ button: 'A', delayMs: CONFIRM_DELAY });
	steps.push({ button: 'A', delayMs: ANIMATION_DELAY });

	return steps;
}

function runSequence(): Array<ButtonStep> {
	// Navigate to RUN (bottom-right of action menu)
	return [
		{ button: 'DOWN', delayMs: SHORT_DELAY },
		{ button: 'RIGHT', delayMs: SHORT_DELAY },
		{ button: 'A', delayMs: ANIMATION_DELAY },
	];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getButtonSequence(action: BattleAction): Array<ButtonStep> {
	if (action === 'run') {
		return runSequence();
	}

	const moveMatch = /^move:([0-3])$/.exec(action);
	if (moveMatch?.[1] !== undefined) {
		return moveSequence(Number.parseInt(moveMatch[1], 10));
	}

	const switchMatch = /^switch:([0-5])$/.exec(action);
	if (switchMatch?.[1] !== undefined) {
		return switchSequence(Number.parseInt(switchMatch[1], 10));
	}

	// Fallback: press A (will select move:0 by default)
	return moveSequence(0);
}

export function getTotalSequenceTimeMs(action: BattleAction): number {
	const steps = getButtonSequence(action);
	return steps.reduce((total, step) => total + step.delayMs, 0);
}
