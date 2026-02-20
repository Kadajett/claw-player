import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

import type { BanCheckResult, BanListEntry, BanRecord, BanType } from './ban-types.js';
import { isIpInCidr } from './cidr.js';

// Redis key patterns
const BAN_AGENT_PREFIX = 'ban:agent:';
const BAN_IP_PREFIX = 'ban:ip:';
const BAN_CIDR_SET = 'ban:cidr';
const BAN_CIDR_META_PREFIX = 'ban:cidr:meta:';
const BAN_UA_SET = 'ban:ua';
const VIOLATIONS_PREFIX = 'violations:';

// In-process cache for IP and UA bans (avoid per-request Redis lookups)
let ipBanCache: Map<string, BanRecord> = new Map();
let cidrBanList: Array<{ cidr: string; record: BanRecord }> = [];
let uaBanPatterns: Array<{ pattern: string; regex: RegExp }> = [];
let cacheRefreshedAt = 0;
const CACHE_TTL_MS = 60_000;

function banRecordToHash(record: BanRecord): Record<string, string> {
	const hash: Record<string, string> = {
		type: record.type,
		reason: record.reason,
		bannedAt: String(record.bannedAt),
		bannedBy: record.bannedBy,
	};
	if (record.expiresAt !== undefined) {
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		hash['expiresAt'] = String(record.expiresAt);
	}
	return hash;
}

function hashToBanRecord(hash: Record<string, string>): BanRecord | null {
	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	if (!(hash['type'] && hash['reason'] && hash['bannedAt'] && hash['bannedBy'])) return null;
	const record: BanRecord = {
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		type: hash['type'] as BanType,
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		reason: hash['reason'],
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		bannedAt: Number(hash['bannedAt']),
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		bannedBy: hash['bannedBy'],
	};
	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	if (hash['expiresAt']) {
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		record.expiresAt = Number(hash['expiresAt']);
	}
	return record;
}

function isExpired(record: BanRecord): boolean {
	if (record.expiresAt === undefined) return false;
	return Date.now() > record.expiresAt;
}

function makeBannedResult(record: BanRecord): BanCheckResult & { banned: true } {
	const result: BanCheckResult & { banned: true } = {
		banned: true,
		type: record.type,
		reason: record.reason,
	};
	if (record.expiresAt !== undefined) {
		result.expiresAt = record.expiresAt;
	}
	return result;
}

/**
 * Check if an agent is banned (by agentId).
 */
export async function checkAgentBan(redis: Redis, agentId: string): Promise<BanCheckResult> {
	const key = `${BAN_AGENT_PREFIX}${agentId}`;
	const raw = await redis.hgetall(key);
	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	if (!raw['type']) return { banned: false };

	const record = hashToBanRecord(raw);
	if (!record) return { banned: false };

	if (isExpired(record)) {
		await redis.del(key);
		return { banned: false };
	}

	return makeBannedResult(record);
}

/**
 * Check if an IP address is banned (exact match or CIDR range).
 */
export async function checkIpBan(redis: Redis, ip: string, logger?: Logger): Promise<BanCheckResult> {
	await refreshCacheIfNeeded(redis, logger);

	// Exact IP match
	const cached = ipBanCache.get(ip);
	if (cached && !isExpired(cached)) {
		return makeBannedResult(cached);
	}

	// CIDR range match
	for (const entry of cidrBanList) {
		if (!isExpired(entry.record) && isIpInCidr(ip, entry.cidr)) {
			return makeBannedResult(entry.record);
		}
	}

	return { banned: false };
}

/**
 * Check if a user-agent matches any banned patterns.
 */
export function checkUserAgentBan(userAgent: string): BanCheckResult {
	for (const entry of uaBanPatterns) {
		if (entry.regex.test(userAgent)) {
			return { banned: true, type: 'hard', reason: `Banned user-agent pattern: ${entry.pattern}` };
		}
	}
	return { banned: false };
}

/**
 * Combined ban check: agent, IP, and user-agent.
 */
export async function checkBan(
	redis: Redis,
	agentId: string | null,
	ip: string,
	userAgent: string,
	logger?: Logger,
): Promise<BanCheckResult> {
	// Agent ban takes priority
	if (agentId) {
		const agentResult = await checkAgentBan(redis, agentId);
		if (agentResult.banned) return agentResult;
	}

	// IP ban (exact + CIDR)
	const ipResult = await checkIpBan(redis, ip, logger);
	if (ipResult.banned) return ipResult;

	// User-agent pattern ban
	return checkUserAgentBan(userAgent);
}

/**
 * Ban an agent by ID.
 */
export async function banAgent(
	redis: Redis,
	agentId: string,
	type: BanType,
	reason: string,
	bannedBy: string,
	durationSeconds?: number,
): Promise<void> {
	const record: BanRecord = {
		type,
		reason,
		bannedAt: Date.now(),
		bannedBy,
		expiresAt: durationSeconds ? Date.now() + durationSeconds * 1000 : undefined,
	};

	const key = `${BAN_AGENT_PREFIX}${agentId}`;
	await redis.hset(key, banRecordToHash(record));
	if (durationSeconds) {
		await redis.expire(key, durationSeconds);
	}
}

/**
 * Ban an IP address.
 */
export async function banIp(
	redis: Redis,
	ip: string,
	type: BanType,
	reason: string,
	bannedBy: string,
	durationSeconds?: number,
): Promise<void> {
	const record: BanRecord = {
		type,
		reason,
		bannedAt: Date.now(),
		bannedBy,
		expiresAt: durationSeconds ? Date.now() + durationSeconds * 1000 : undefined,
	};

	const key = `${BAN_IP_PREFIX}${ip}`;
	await redis.hset(key, banRecordToHash(record));
	if (durationSeconds) {
		await redis.expire(key, durationSeconds);
	}
	invalidateCache();
}

/**
 * Ban a CIDR range.
 */
export async function banCidr(
	redis: Redis,
	cidr: string,
	type: BanType,
	reason: string,
	bannedBy: string,
	durationSeconds?: number,
): Promise<void> {
	const record: BanRecord = {
		type,
		reason,
		bannedAt: Date.now(),
		bannedBy,
		expiresAt: durationSeconds ? Date.now() + durationSeconds * 1000 : undefined,
	};

	const metaKey = `${BAN_CIDR_META_PREFIX}${cidr}`;
	await redis.zadd(BAN_CIDR_SET, Date.now(), cidr);
	await redis.hset(metaKey, banRecordToHash(record));
	if (durationSeconds) {
		await redis.expire(metaKey, durationSeconds);
	}
	invalidateCache();
}

/**
 * Ban a user-agent pattern.
 */
export async function banUserAgent(redis: Redis, pattern: string, reason: string, bannedBy: string): Promise<void> {
	const entry = JSON.stringify({ pattern, reason, bannedBy, bannedAt: Date.now() });
	await redis.sadd(BAN_UA_SET, entry);
	invalidateCache();
}

/**
 * Remove a ban by kind and target.
 */
export async function unban(
	redis: Redis,
	kind: 'agent' | 'ip' | 'cidr' | 'user-agent',
	target: string,
): Promise<boolean> {
	switch (kind) {
		case 'agent': {
			const deleted = await redis.del(`${BAN_AGENT_PREFIX}${target}`);
			return deleted > 0;
		}
		case 'ip': {
			const deleted = await redis.del(`${BAN_IP_PREFIX}${target}`);
			invalidateCache();
			return deleted > 0;
		}
		case 'cidr': {
			const removed = await redis.zrem(BAN_CIDR_SET, target);
			await redis.del(`${BAN_CIDR_META_PREFIX}${target}`);
			invalidateCache();
			return removed > 0;
		}
		case 'user-agent': {
			// Remove all entries matching the pattern
			const members = await redis.smembers(BAN_UA_SET);
			let found = false;
			for (const member of members) {
				try {
					const parsed = JSON.parse(member) as { pattern: string };
					if (parsed.pattern === target) {
						await redis.srem(BAN_UA_SET, member);
						found = true;
					}
				} catch {
					// skip malformed entries
				}
			}
			invalidateCache();
			return found;
		}
	}
}

/**
 * List all active bans.
 */
export async function listBans(redis: Redis): Promise<Array<BanListEntry>> {
	const entries: Array<BanListEntry> = [];

	// Agent bans
	const agentKeys = await redis.keys(`${BAN_AGENT_PREFIX}*`);
	for (const key of agentKeys) {
		const raw = await redis.hgetall(key);
		const record = hashToBanRecord(raw);
		if (record && !isExpired(record)) {
			entries.push({ kind: 'agent', target: key.slice(BAN_AGENT_PREFIX.length), record });
		}
	}

	// IP bans
	const ipKeys = await redis.keys(`${BAN_IP_PREFIX}*`);
	for (const key of ipKeys) {
		const raw = await redis.hgetall(key);
		const record = hashToBanRecord(raw);
		if (record && !isExpired(record)) {
			entries.push({ kind: 'ip', target: key.slice(BAN_IP_PREFIX.length), record });
		}
	}

	// CIDR bans
	const cidrs = await redis.zrange(BAN_CIDR_SET, 0, -1);
	for (const cidr of cidrs) {
		const raw = await redis.hgetall(`${BAN_CIDR_META_PREFIX}${cidr}`);
		const record = hashToBanRecord(raw);
		if (record && !isExpired(record)) {
			entries.push({ kind: 'cidr', target: cidr, record });
		}
	}

	// UA bans
	const uaMembers = await redis.smembers(BAN_UA_SET);
	for (const member of uaMembers) {
		try {
			const parsed = JSON.parse(member) as { pattern: string; reason: string; bannedBy: string; bannedAt: number };
			entries.push({
				kind: 'user-agent',
				target: parsed.pattern,
				record: { type: 'hard', reason: parsed.reason, bannedBy: parsed.bannedBy, bannedAt: parsed.bannedAt },
			});
		} catch {
			// skip malformed
		}
	}

	return entries;
}

/**
 * Record a violation for auto-escalation tracking.
 * Returns the current violation counts.
 */
export async function recordViolation(
	redis: Redis,
	agentId: string,
	violationType: 'rateLimitHit' | 'invalidRequest',
): Promise<{ count: number }> {
	const key = `${VIOLATIONS_PREFIX}${agentId}`;
	const count = await redis.hincrby(key, violationType, 1);
	await redis.expire(key, 300); // 5-minute window
	return { count };
}

/**
 * Check violation counts and auto-escalate if thresholds exceeded.
 */
export async function checkAutoEscalation(
	redis: Redis,
	agentId: string,
	ip: string,
	rateLimitThreshold: number,
	invalidRequestThreshold: number,
	logger?: Logger,
): Promise<void> {
	const key = `${VIOLATIONS_PREFIX}${agentId}`;
	const raw = await redis.hgetall(key);

	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	const rateLimitHits = Number(raw['rateLimitHit']) || 0;
	// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
	const invalidRequests = Number(raw['invalidRequest']) || 0;

	if (rateLimitHits >= rateLimitThreshold) {
		await banAgent(redis, agentId, 'soft', `Auto-ban: ${rateLimitHits} rate limit hits in 5min window`, 'system', 3600);
		logger?.warn({ agentId, rateLimitHits }, 'Agent auto-banned (rate limit abuse)');
	}

	if (invalidRequests >= invalidRequestThreshold) {
		await banIp(
			redis,
			ip,
			'hard',
			`Auto-ban: ${invalidRequests} invalid requests in 5min window from IP`,
			'system',
			3600,
		);
		logger?.warn({ ip, invalidRequests }, 'IP auto-banned (invalid request flood)');
	}
}

// Cache management

function invalidateCache(): void {
	cacheRefreshedAt = 0;
}

async function refreshCacheIfNeeded(redis: Redis, logger?: Logger): Promise<void> {
	if (Date.now() - cacheRefreshedAt < CACHE_TTL_MS) return;

	try {
		// Refresh IP ban cache
		const newIpCache = new Map<string, BanRecord>();
		const ipKeys = await redis.keys(`${BAN_IP_PREFIX}*`);
		for (const key of ipKeys) {
			const raw = await redis.hgetall(key);
			const record = hashToBanRecord(raw);
			if (record && !isExpired(record)) {
				newIpCache.set(key.slice(BAN_IP_PREFIX.length), record);
			}
		}
		ipBanCache = newIpCache;

		// Refresh CIDR ban cache
		const cidrs = await redis.zrange(BAN_CIDR_SET, 0, -1);
		const newCidrList: Array<{ cidr: string; record: BanRecord }> = [];
		for (const cidr of cidrs) {
			const raw = await redis.hgetall(`${BAN_CIDR_META_PREFIX}${cidr}`);
			const record = hashToBanRecord(raw);
			if (record && !isExpired(record)) {
				newCidrList.push({ cidr, record });
			}
		}
		cidrBanList = newCidrList;

		// Refresh UA ban cache
		const uaMembers = await redis.smembers(BAN_UA_SET);
		const newUaPatterns: Array<{ pattern: string; regex: RegExp }> = [];
		for (const member of uaMembers) {
			try {
				const parsed = JSON.parse(member) as { pattern: string };
				newUaPatterns.push({ pattern: parsed.pattern, regex: new RegExp(parsed.pattern, 'i') });
			} catch {
				// skip malformed
			}
		}
		uaBanPatterns = newUaPatterns;

		cacheRefreshedAt = Date.now();
	} catch (err) {
		logger?.error({ err }, 'Failed to refresh ban cache');
	}
}

/** Reset cache (for testing) */
export function _resetBanCache(): void {
	ipBanCache = new Map();
	cidrBanList = [];
	uaBanPatterns = [];
	cacheRefreshedAt = 0;
}
