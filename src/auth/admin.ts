/**
 * Validate an admin secret against the configured value.
 * Returns true if the secret matches, false otherwise.
 */
export function validateAdminSecret(provided: string, configured: string | undefined): boolean {
	if (!configured) return false;
	if (!provided) return false;

	// Constant-time comparison to prevent timing attacks
	if (provided.length !== configured.length) return false;

	let mismatch = 0;
	for (let i = 0; i < provided.length; i++) {
		mismatch |= provided.charCodeAt(i) ^ configured.charCodeAt(i);
	}
	return mismatch === 0;
}
