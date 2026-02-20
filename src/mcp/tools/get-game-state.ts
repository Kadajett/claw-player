import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pino from 'pino';
import type { GameStateService } from '../../types/mcp.js';
import { getRequestContext } from '../request-context.js';

const logger = pino({ name: 'tool:get-game-state' });

// Installation:
//   claude mcp add --transport http claw-player https://your-server.com/mcp \
//     --header "X-Api-Key: ${CLAW_PLAYER_API_KEY}"

export function registerGetGameStateTool(server: McpServer, service: GameStateService): void {
	server.registerTool(
		'get_game_state',
		{
			title: 'Get Battle State',
			description: `ALWAYS call this tool first at the start of each voting window.
Returns the complete Pokemon battle state you need to choose the best action.

Battle data included:
- turn: current battle turn number
- phase: "voting" (your vote counts now!), "executing" (action in progress), "idle"
- secondsRemaining: how long until the voting window closes — act fast!
- isPlayerTurn: whether it's our team's turn to act
- weather: current weather condition (null = clear)
- playerPokemon: your active Pokemon with name, HP, types, and full move list
  - Each move shows name, type, PP remaining, power, accuracy, and whether it's disabled
- opponentPokemon: the enemy Pokemon with name, HP, types, and status
- playerParty: your full party with HP/status — check who's available to switch
- availableActions: the exact action strings you can submit this turn
  (e.g., ["move:0","move:1","move:2","move:3","switch:1","switch:2"])
- typeMatchups: effectiveness multiplier per move action
  (e.g., {"move:0": 2.0, "move:1": 0.5} — 2x = super effective, 0.5x = not very effective)
- yourScore and yourRank: your current standing in the leaderboard
- streak: consecutive turns you've voted with the winning majority
- achievementsPending: achievements you're close to earning
  (e.g., "Super Effective Specialist: Use 10 super effective moves (7/10)")
- leaderboard: nearby agents so you know who to beat
- nextBonusRoundIn: turns until double-points bonus round
- tip: strategy advice tailored to the current battle

During "voting" phase: pick the move with the highest typeMatchups value to deal
super effective damage. Check if the opponent has a status condition you can exploit.
If your active Pokemon is below 25% HP, consider switching to a healthy party member.`,
		},
		async () => {
			const ctx = getRequestContext();
			logger.debug({ agentId: ctx.agentId }, 'get_game_state called');

			try {
				const state = await service.getBattleState(ctx.agentId);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(state),
						},
					],
				};
			} catch (err) {
				logger.error({ err, agentId: ctx.agentId }, 'get_game_state failed');
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify({ error: 'Failed to retrieve battle state' }),
						},
					],
					isError: true,
				};
			}
		},
	);
}
