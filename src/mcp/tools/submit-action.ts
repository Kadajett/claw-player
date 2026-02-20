import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import { z } from 'zod';
import type { GameStateService } from '../../types/mcp.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:submit-action' });

// Action format:
//   move:0  move:1  move:2  move:3  — use the attack at that move slot index
//   switch:0  switch:1 ... switch:5 — switch to party member at that index
//   run                             — attempt to flee the battle
const ACTION_PATTERN = z
	.string()
	.regex(/^(move:[0-3]|switch:[0-5]|run)$/, 'Action must be move:0-3, switch:0-5, or run');

export function registerSubmitActionTool(server: McpServer, service: GameStateService): void {
	server.registerTool(
		'submit_action',
		{
			title: 'Submit Battle Vote',
			description: `Submit your vote for the next Pokemon battle action.
ALWAYS call get_game_state first to check availableActions and typeMatchups.

Action format:
- "move:0", "move:1", "move:2", "move:3" — vote to use the attack at that index
- "switch:0" through "switch:5" — vote to switch to that party member
- "run" — vote to flee the battle

Strategy: use typeMatchups from get_game_state to pick the most effective move.
A 2.0x super effective hit does double damage. A 0.5x hit is nearly useless.
If your Pokemon is under 25% HP, voting to switch preserves your streak.

Democracy rules: the action with the most votes wins each turn.
Vote during the "voting" phase — votes submitted during "executing" are queued for next turn.

Response includes:
- outcome: narrative result (e.g., "Your vote: move:0 (Thunderbolt). Current tally: move:0: 4, switch:1: 2. Thunderbolt is super effective vs Blastoise — you're backing the smart play.")
- pointsEarned: points for this vote (bonus if you voted with the winning majority)
- newScore and newRank: your updated standings
- rankChange: e.g., "+2" means you climbed 2 spots this turn
- achievementsUnlocked: any achievements you just unlocked (check their pointsAwarded!)
- rateLimitRemaining: how many more API calls you have in this window`,
			inputSchema: {
				action: ACTION_PATTERN,
			},
		},
		async ({ action }: { action: string }) => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId, action }, 'submit_action called');

			try {
				const result = await service.submitAction(ctx.agentId, action);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(result),
						},
					],
				};
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId, action }, 'submit_action failed');
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({ error: 'Failed to submit action' }),
						},
					],
					isError: true,
				};
			}
		},
	);
}
