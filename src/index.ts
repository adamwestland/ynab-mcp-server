#!/usr/bin/env node

import { YnabMcpServer } from './server.js';
import { config } from './config/index.js';
import { validateToolNames } from './tools/index.js';
import { YNABClient } from './client/YNABClient.js';

/**
 * Main application entry point
 * Initializes and starts the YNAB MCP Server with proper error handling and cleanup
 */
async function main(): Promise<void> {
  let server: YnabMcpServer | null = null;

  try {
    console.error('Starting YNAB MCP Server...');
    
    // Validate configuration
    console.error('Validating configuration...');
    if (!config.ynabApiToken) {
      throw new Error('YNAB_API_TOKEN environment variable is required');
    }

    // Pre-validate tools to catch issues early
    console.error('Validating tool registry...');
    const testClient = new YNABClient(config);
    validateToolNames(testClient);
    console.error('Tool validation passed');

    // Initialize and start server
    console.error('Initializing YNAB MCP Server...');
    server = new YnabMcpServer(config);
    
    console.error('Starting server...');
    await server.start();
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to start YNAB MCP Server:', errorMessage);
    
    // Attempt cleanup if server was initialized
    if (server) {
      try {
        await server.shutdown();
      } catch (shutdownError) {
        console.error('Error during cleanup:', shutdownError);
      }
    }
    
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
async function gracefulShutdown(server: YnabMcpServer | null, signal: string): Promise<void> {
  console.error(`Received ${signal}, shutting down gracefully...`);
  
  if (server) {
    try {
      await server.shutdown();
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }
  
  process.exit(0);
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers(server: YnabMcpServer | null): void {
  process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));
  
  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown(server, 'uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown(server, 'unhandledRejection');
  });
}

// Run the application if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Setup signal handlers early
  setupSignalHandlers(null);
  
  main().catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
  });
}