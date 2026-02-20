import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { ApiKeyMetadataSchema } from '../types/api.js';
import type { ApiKeyMetadata } from '../types/api.js';

const KEY_PREFIX = 'api-key:';

export function hashApiKey(rawKey: string): string {
	return createHash('sha256').update(rawKey).digest('hex');
}

export function redisKeyForHash(hash: string): string {
	return `${KEY_PREFIX}${hash}`;
}

export async function lookupApiKey(client: Redis, rawKey: string): Promise<ApiKeyMetadata | null> {
	const hash = hashApiKey(rawKey);
	const redisKey = redisKeyForHash(hash);

	const data = await client.hgetall(redisKey);

	if (!data || Object.keys(data).length === 0) {
		return null;
	}

	const parsed = ApiKeyMetadataSchema.safeParse({
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		agentId: data['agentId'],
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		plan: data['plan'],
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		rpsLimit: data['rpsLimit'] !== undefined ? Number(data['rpsLimit']) : undefined,
		// biome-ignore lint/complexity/useLiteralKeys: noPropertyAccessFromIndexSignature requires bracket notation
		createdAt: data['createdAt'] !== undefined ? Number(data['createdAt']) : undefined,
	});

	if (!parsed.success) {
		return null;
	}

	return parsed.data;
}

export async function storeApiKey(client: Redis, rawKey: string, metadata: ApiKeyMetadata): Promise<void> {
	const hash = hashApiKey(rawKey);
	const redisKey = redisKeyForHash(hash);

	await client.hset(redisKey, {
		agentId: metadata.agentId,
		plan: metadata.plan,
		rpsLimit: String(metadata.rpsLimit),
		createdAt: String(metadata.createdAt),
	});
}

export async function revokeApiKey(client: Redis, rawKey: string): Promise<void> {
	const hash = hashApiKey(rawKey);
	const redisKey = redisKeyForHash(hash);
	await client.del(redisKey);
}
