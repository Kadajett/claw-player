/**
 * Convert an IPv4 address string to a 32-bit number.
 * Returns null for invalid addresses.
 */
export function ipToNumber(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;

	let result = 0;
	for (const part of parts) {
		const octet = Number.parseInt(part, 10);
		if (Number.isNaN(octet) || octet < 0 || octet > 255) return null;
		result = (result << 8) | octet;
	}

	return result >>> 0; // unsigned 32-bit
}

/**
 * Parse a CIDR notation string into base address and mask.
 * Returns null for invalid CIDR.
 */
export function parseCidr(cidr: string): { base: number; mask: number } | null {
	const slash = cidr.indexOf('/');
	if (slash === -1) return null;

	const ip = cidr.slice(0, slash);
	const prefix = Number.parseInt(cidr.slice(slash + 1), 10);

	if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return null;

	const base = ipToNumber(ip);
	if (base === null) return null;

	const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
	return { base: (base & mask) >>> 0, mask };
}

/**
 * Check if an IPv4 address falls within a CIDR range.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
	const ipNum = ipToNumber(ip);
	if (ipNum === null) return false;

	const parsed = parseCidr(cidr);
	if (!parsed) return false;

	return (ipNum & parsed.mask) >>> 0 === parsed.base;
}
