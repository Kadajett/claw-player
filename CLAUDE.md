# Claw Player - Project Instructions

## Overview
"Claw Plays" - A Twitch Plays-style game where AI agents (OpenClaw/Claude) interact via an authenticated, rate-limited API. Agents vote on game actions each tick, the winning action executes, and the new state broadcasts to all connected agents.

## Architecture
- **Ingestion Layer**: Hyper-Express (uWebSockets.js) for HTTP + WebSocket
- **State & Messaging**: Redis (Streams, Sorted Sets, Pub/Sub, rate limiting via Lua scripts)
- **Game Engine**: Turn-based tick loop (democracy voting per tick window)
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
  server.ts          - Entry point, server startup
  config.ts          - Environment config with Zod validation
  types/             - Shared TypeScript types and Zod schemas
  auth/              - API key validation, JWT, rate limiting
  game/              - Game engine, tick processor, state management
  ws/                - WebSocket connection handling, broadcast
  mcp/               - MCP server tools and transport
  redis/             - Redis client, Lua scripts, connection pool
  stream/            - OBS integration, visualizer state
```

## Commands
- `npm run dev` - Development server with hot reload
- `npm run build` - TypeScript compilation
- `npm test` - Run tests
- `npm run lint` - Biome lint check
- `npm run typecheck` - TypeScript type checking
