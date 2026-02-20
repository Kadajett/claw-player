import type { Redis } from 'ioredis';

/**
 * Token bucket rate limiter implemented as an atomic Lua script.
 *
 * KEYS[1] - rate limit key (e.g. "rl:{agent_id}")
 * ARGV[1] - current timestamp in milliseconds
 * ARGV[2] - rate: tokens replenished per second
 * ARGV[3] - burst: maximum token capacity
 * ARGV[4] - cost: tokens to consume for this request (usually 1)
 *
 * Returns: [allowed (0|1), remaining_tokens (integer)]
 */
export const TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then tokens = burst end
if last_refill == nil then last_refill = now end

local elapsed = math.max(0, now - last_refill) / 1000
local new_tokens = math.min(burst, tokens + elapsed * rate)

local allowed = 0
if new_tokens >= cost then
  new_tokens = new_tokens - cost
  allowed = 1
end

local ttl = math.ceil(burst / rate) + 60
redis.call('HMSET', key, 'tokens', new_tokens, 'last_refill', now)
redis.call('EXPIRE', key, ttl)

return {allowed, math.floor(new_tokens)}
`;

export type TokenBucketResult = {
	allowed: boolean;
	remaining: number;
};

export async function runTokenBucket(
	client: Redis,
	key: string,
	nowMs: number,
	ratePerSecond: number,
	burst: number,
	cost: number,
): Promise<TokenBucketResult> {
	const result = await client.eval(TOKEN_BUCKET_SCRIPT, 1, key, nowMs, ratePerSecond, burst, cost);

	if (!Array.isArray(result) || result.length < 2) {
		throw new Error(`Unexpected Lua script result: ${JSON.stringify(result)}`);
	}

	const [allowed, remaining] = result as [number, number];
	return {
		allowed: allowed === 1,
		remaining,
	};
}
