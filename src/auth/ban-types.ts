import { z } from 'zod';

export const BanType = z.enum(['soft', 'hard']);
export type BanType = z.infer<typeof BanType>;

export const BanTargetKind = z.enum(['agent', 'ip', 'cidr', 'user-agent']);
export type BanTargetKind = z.infer<typeof BanTargetKind>;

export const BanRecordSchema = z.object({
	type: BanType,
	reason: z.string(),
	bannedAt: z.number(),
	bannedBy: z.string(),
	expiresAt: z.number().optional(),
});
export type BanRecord = z.infer<typeof BanRecordSchema>;

export const BanAgentRequestSchema = z.object({
	agentId: z.string().min(1).max(64),
	type: BanType,
	reason: z.string().min(1).max(512),
	durationSeconds: z.number().int().positive().optional(),
});
export type BanAgentRequest = z.infer<typeof BanAgentRequestSchema>;

export const BanIpRequestSchema = z.object({
	ip: z.string().min(1).max(45),
	type: BanType,
	reason: z.string().min(1).max(512),
	durationSeconds: z.number().int().positive().optional(),
});
export type BanIpRequest = z.infer<typeof BanIpRequestSchema>;

export const BanCidrRequestSchema = z.object({
	cidr: z.string().min(1).max(49),
	type: BanType,
	reason: z.string().min(1).max(512),
	durationSeconds: z.number().int().positive().optional(),
});
export type BanCidrRequest = z.infer<typeof BanCidrRequestSchema>;

export const BanUserAgentRequestSchema = z.object({
	pattern: z.string().min(1).max(256),
	reason: z.string().min(1).max(512),
});
export type BanUserAgentRequest = z.infer<typeof BanUserAgentRequestSchema>;

export const UnbanRequestSchema = z.object({
	kind: BanTargetKind,
	target: z.string().min(1).max(256),
});
export type UnbanRequest = z.infer<typeof UnbanRequestSchema>;

export type BanCheckResult = { banned: false } | { banned: true; type: BanType; reason: string; expiresAt?: number };

export type BanListEntry = {
	kind: BanTargetKind;
	target: string;
	record: BanRecord;
};
