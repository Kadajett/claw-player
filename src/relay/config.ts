import { z } from 'zod';

const relayEnvSchema = z.object({
	RELAY_MODE: z.enum(['server', 'client']).optional(),
	RELAY_URL: z.string().url().optional(),
	RELAY_SECRET: z.string().min(16).optional(),
	RELAY_PORT: z.coerce.number().int().positive().default(4000),
});

export type RelayEnvConfig = z.infer<typeof relayEnvSchema>;

export function loadRelayConfig(): RelayEnvConfig {
	const result = relayEnvSchema.safeParse(process.env);
	if (!result.success) {
		const formatted = result.error.flatten().fieldErrors;
		throw new Error(`Invalid relay environment configuration: ${JSON.stringify(formatted)}`);
	}
	return result.data;
}

type ServerConfig = {
	// biome-ignore lint/style/useNamingConvention: environment variable names must be UPPER_CASE
	RELAY_MODE: 'server';
	// biome-ignore lint/style/useNamingConvention: environment variable names must be UPPER_CASE
	RELAY_SECRET: string;
};

type ClientConfig = {
	// biome-ignore lint/style/useNamingConvention: environment variable names must be UPPER_CASE
	RELAY_MODE: 'client';
	// biome-ignore lint/style/useNamingConvention: environment variable names must be UPPER_CASE
	RELAY_URL: string;
	// biome-ignore lint/style/useNamingConvention: environment variable names must be UPPER_CASE
	RELAY_SECRET: string;
};

export function assertRelayServerConfig(config: RelayEnvConfig): asserts config is RelayEnvConfig & ServerConfig {
	if (config.RELAY_MODE !== 'server') {
		throw new Error('RELAY_MODE must be "server" to run relay server');
	}
	if (!config.RELAY_SECRET) {
		throw new Error('RELAY_SECRET is required to run relay server');
	}
}

export function assertRelayClientConfig(config: RelayEnvConfig): asserts config is RelayEnvConfig & ClientConfig {
	if (config.RELAY_MODE !== 'client') {
		throw new Error('RELAY_MODE must be "client" to run home client');
	}
	if (!config.RELAY_URL) {
		throw new Error('RELAY_URL is required to run home client');
	}
	if (!config.RELAY_SECRET) {
		throw new Error('RELAY_SECRET is required to run home client');
	}
}
