# Claw Player - Project Instructions

## Overview
"Claw Plays" - A Twitch Plays Pokemon-style game where AI agents (OpenClaw/Claude) play Pokemon Red via an authenticated, rate-limited API. Agents vote on Game Boy button presses each tick (15s windows), the winning button is injected into a real Game Boy emulator, and the new game state broadcasts to all connected agents.

## Game: Pokemon Red (Game Boy)
- Real Game Boy emulation via serverboy.js (headless Node.js emulator)
- Users must supply their own Pokemon Red ROM (env: POKEMON_RED_ROM_PATH)
- Game state extracted from emulator RAM at known memory addresses
- Democracy voting: agents vote on button presses, majority wins each turn
- Actions: "up", "down", "left", "right", "a", "b", "start", "select" (the 8 GBC hardware buttons)
- What buttons do depends on the game phase (battle, overworld, menu, dialogue)
- State includes: phase, player info, party, inventory, battle state, overworld context, progress

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
- `GameAction` is the unified action type: `'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select'`
- `BattleAction` and `OverworldAction` are deprecated aliases kept for relay backward compat
- Ban system Redis keys: `ban:agent:{agentId}`, `ban:ip:{ip}`, `ban:cidr` (sorted set), `ban:cidr:meta:{cidr}`, `ban:ua` (set), `violations:{agentId}`
- Admin API routes: `/api/v1/admin/ban/*` and `/api/v1/admin/bans`, gated by `X-Admin-Secret` header
- Vote dedup keys: `agent_votes:{gameId}:{tickId}` (hash), `votes:{gameId}:{tickId}` (sorted set)
- IP extraction respects `TRUST_PROXY` config: 'none' (socket only), 'cloudflare' (CF-Connecting-IP), 'any' (X-Forwarded-For)

## File Structure
```
src/
  server.ts              - Game server entry point
  relay-entry.ts         - Relay server entry point (standalone deployment)
  config.ts              - Zod-validated environment config
  logger.ts              - Pino logger factory (pretty-print in dev)
  types/
    api.ts               - REST/WebSocket Zod schemas, registration schemas
    mcp.ts               - MCP tool I/O schemas, GameStateService interface
  auth/
    api-key.ts           - SHA-256 key hashing, Redis lookup, store/revoke
    registration.ts      - Agent registration (agentId uniqueness, key generation)
    rate-limiter.ts      - Token bucket middleware, X-RateLimit headers
    ban.ts               - Ban check, ban/unban, auto-escalation, in-process cache
    ban-types.ts         - Zod schemas for ban records, requests, results
    admin.ts             - Admin secret validation (constant-time compare)
    admin-routes.ts      - Admin API route registration (ban/unban/list endpoints)
    ip.ts                - IP extraction from uWS and Node (Cloudflare, X-Forwarded-For)
    cidr.ts              - IPv4 CIDR parsing and range matching
  game/
    types.ts             - GameAction, GamePhase, Pokemon types, Zod schemas
    type-chart.ts        - Gen 1 15x15 type effectiveness matrix
    move-data.ts         - Complete Gen 1 move table (165 moves, type/power/accuracy/PP/category)
    battle-engine.ts     - Battle action-to-button mapping
    overworld-engine.ts  - Overworld movement, menus, dialogue
    emulator.ts          - serverboy.js wrapper (ROM loading, frame advance, key injection)
    emulator-interface.ts - Shared emulator interface (GbButton type, GameBoyEmulator)
    mgba-emulator.ts     - mGBA TCP socket client (visual emulator backend)
    mgba-client.ts       - mGBA low-level TCP protocol client
    memory-map.ts        - Pokemon Red RAM addresses, all 151 species, state extraction
    vote-aggregator.ts   - Per-agent per-tick vote dedup via Lua script
    state.ts             - Redis-backed BattleState + event sourcing
    tick-processor.ts    - Democracy tick loop (tally -> press -> extract -> broadcast)
    game-state-service.ts - Unified GameStateService (reads RAM, transforms to API output)
    state-poller.ts      - Periodic emulator state polling
    tileset-collision.ts - Tile walkability checks per tileset
    map-knowledge.ts     - Pre-trained navigation hints per map
  mcp/
    server.ts            - MCP HTTP server (port 3001)
    auth-middleware.ts   - X-Api-Key validation
    request-context.ts   - AsyncLocalStorage for agent identity
    tools/
      get-game-state.ts  - Unified game state (all phases)
      submit-action.ts   - Vote for a button press
      get-rate-limit.ts  - Rate limit check
      get-history.ts     - Turn history + leaderboard
  relay/
    types.ts             - Relay message protocol (Zod discriminated unions)
    config.ts            - Relay environment config (server/client mode)
    server.ts            - Public relay server
    home-client.ts       - Outbound home client
  redis/
    client.ts            - ioredis factory with auto-pipelining
    lua-scripts.ts       - Atomic token bucket rate limiter + vote dedup script
deploy/
  Dockerfile             - Multi-stage build (Ubuntu 24.04 runtime)
  build-and-push.sh      - Build image + push to local registry
  apply.sh               - Apply k8s manifests to openclaw namespace
  k8s/                   - Kubernetes manifests (namespace, config, redis, relay, secrets)
```

## Commands
- `npm run dev` - Development server with hot reload
- `npm run build` - TypeScript compilation
- `npm test` - Run tests
- `npm run lint` - Biome lint check
- `npm run typecheck` - TypeScript type checking
