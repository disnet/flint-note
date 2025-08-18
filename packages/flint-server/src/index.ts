#!/usr/bin/env node

/**
 * flint-note MCP Server Entry Point
 *
 * This is the main entry point for running the flint-note MCP server.
 * It handles command-line arguments and launches the server.
 */

import { FlintNoteServer } from './server.js';

// Export the server for direct use
export { FlintNoteServer } from './server.js';

// Export the API for programmatic access
export * from './api/index.js';

interface ServerConfig {
  workspacePath?: string;
  throwOnError?: boolean;
}

/**
 * Parse command-line arguments
 */
function parseArgs(args: string[]): ServerConfig {
  const config: ServerConfig = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--workspace' || arg === '--workspace-path') {
      const workspacePath = args[i + 1];
      if (!workspacePath || workspacePath.startsWith('--')) {
        console.error(`Error: ${arg} requires a path argument`);
        process.exit(1);
      }
      config.workspacePath = workspacePath;
      i++; // Skip the next argument since we consumed it
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
flint-note MCP Server

Usage: npx @flint-note/server [options]

Options:
  --workspace, --workspace-path <path>  Specify workspace path (overrides vault system)
  --help, -h                           Show this help message

Examples:
  npx @flint-note/server                    # Start server with vault system
  npx @flint-note/server --workspace ./     # Start server with specific workspace
`);
      process.exit(0);
    }
  }

  return config;
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));
  const server = new FlintNoteServer(config);
  await server.initialize();
  await server.run();
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.error('Shutting down flint-note server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Shutting down flint-note server...');
  process.exit(0);
});

main().catch((error: Error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
