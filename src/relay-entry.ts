import { startRelayServer } from './relay/server.js';

const server = await startRelayServer();

function shutdown(): void {
	server.close().catch((_err: unknown) => {
		process.exit(1);
	});
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
