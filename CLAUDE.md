# Claw Player - Project Instructions

## Overview
"Claw Plays" - A Twitch Plays Pokemon-style game where AI agents (OpenClaw/Claude) play Pokemon Red via an authenticated, rate-limited API. Agents vote on battle actions each tick (15s windows), the winning action is injected into a real Game Boy emulator, and the new battle state broadcasts to all connected agents.

## Game: Pokemon Red (Game Boy)
- Real Game Boy emulation via serverboy.js (headless Node.js emulator)
- Users must supply their own Pokemon Red ROM (env: POKEMON_RED_ROM_PATH)
- Battle state extracted from emulator RAM at known memory addresses
- Democracy voting: agents vote on moves/switches, majority wins each turn
- Actions: "move:0"-"move:3" (select attack), "switch:0"-"switch:5" (swap Pokemon), "run"
- State includes: active Pokemon, HP, moves with PP, opponent info, type matchups, weather

## Architecture
- **Ingestion Layer**: Hyper-Express (uWebSockets.js) for HTTP + WebSocket
- **State & Messaging**: Redis (Streams, Sorted Sets, Pub/Sub, rate limiting via Lua scripts)
- **Game Engine**: serverboy.js GB emulator + RAM state extraction + democracy tick loop
- **Broadcast**: WebSocket fanout via uWebSockets.js topic subscriptions
- **MCP Server**: Streamable HTTP transport for Claude Code agent integration
- **Streaming**: Web-based visualizer captured by OBS Browser Source

## Tech Stack
- Runtime: Node.js 22 LTS
- Language: TypeScript (strict mode, all strict compiler flags)
- HTTP/WS: hyper-express (uWebSockets.js wrapper)
- Database: Redis 7.2+ (ioredis client)
- Validation: Zod
- Auth: jose (JWT) + API key (SHA-256 hashed)
- MCP SDK: @modelcontextprotocol/sdk
- Logging: pino
- Testing: vitest + @vitest/coverage-v8
- Linting: Biome (strict rules, no @apply, no unused imports)
- Git hooks: husky (pre-commit: lint + typecheck + test)

## Conventions
- Use `import type` for type-only imports
- All exported functions must have explicit return types
- No `any` types - use `unknown` and narrow
- All Redis operations must use ioredis pipeline/multi when batching
- Rate limiting uses atomic Redis Lua scripts (no race conditions)
- Every module must have corresponding .test.ts file with >80% coverage
- Use pino logger, never console.log
- Indent with tabs (Biome default)
- Single quotes, trailing commas, semicolons

## File Structure
```
src/
  server.ts              - Entry point, server startup
  config.ts              - Environment config with Zod validation
  types/                 - Shared TypeScript types and Zod schemas
  auth/                  - API key validation, JWT, rate limiting
  game/
    types.ts             - Pokemon battle types (PokemonState, BattleState, etc.)
    emulator.ts          - serverboy.js wrapper (load ROM, advance frames, inject keys)
    memory-map.ts        - Pokemon Red RAM addresses + state extraction
    battle-engine.ts     - Maps vote actions to GB button presses
    vote-aggregator.ts   - Redis sorted set voting (ZADD/ZREVRANGE)
    state.ts             - Redis-backed battle state + event sourcing
    tick-processor.ts    - Democracy tick loop (tally -> press -> extract -> broadcast)
    type-chart.ts        - Gen 1 type effectiveness matrix
  ws/                    - WebSocket connection handling, broadcast
  mcp/                   - MCP server tools and transport
  redis/                 - Redis client, Lua scripts, connection pool
  stream/                - OBS integration, visualizer state
```

## Commands
- `npm run dev` - Development server with hot reload
- `npm run build` - TypeScript compilation
- `npm test` - Run tests
- `npm run lint` - Biome lint check
- `npm run typecheck` - TypeScript type checking
