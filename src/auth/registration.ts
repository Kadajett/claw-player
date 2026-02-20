import { randomBytes } from 'node:crypto';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { PLAN_RPS } from '../types/api.js';
import type { Plan, RegisterResponse } from '../types/api.js';
import { hashApiKey, storeApiKey } from './api-key.js';

const AGENT_REGISTRY_PREFIX = 'agent:registered:';
const API_KEY_PREFIX = 'cgp_';
const API_KEY_BYTES = 32; // 32 bytes = 64 hex chars

export function generateApiKey(): string {
	return `${API_KEY_PREFIX}${randomBytes(API_KEY_BYTES).toString('hex')}`;
}

export type RegistrationResult =
	| { ok: true; response: RegisterResponse }
	| { ok: false; code: string; message: string };

export async function registerAgent(
	redis: Redis,
	agentId: string,
	logger: Logger,
	plan: Plan = 'free',
): Promise<RegistrationResult> {
	const registryKey = `${AGENT_REGISTRY_PREFIX}${agentId}`;

	// Atomic uniqueness check: SET NX returns 'OK' only if key didn't exist
	const claimed = await redis.set(registryKey, String(Date.now()), 'NX');

	if (claimed !== 'OK') {
		logger.warn({ agentId }, 'Registration rejected: agentId already taken');
		return {
			ok: false,
			code: 'AGENT_ID_TAKEN',
			message: `Agent ID "${agentId}" is already registered`,
		};
	}

	const rawKey = generateApiKey();
	const rpsLimit = PLAN_RPS[plan];
	const createdAt = Date.now();

	await storeApiKey(redis, rawKey, { agentId, plan, rpsLimit, createdAt });

	// Store the key hash in the registry so we can look up which key belongs to an agent
	const keyHash = hashApiKey(rawKey);
	await redis.set(registryKey, JSON.stringify({ keyHash, plan, createdAt }));

	logger.info({ agentId, plan, rpsLimit }, 'Agent registered');

	return {
		ok: true,
		response: { apiKey: rawKey, agentId, plan, rpsLimit },
	};
}
