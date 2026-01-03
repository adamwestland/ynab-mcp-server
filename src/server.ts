import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import type { Config } from './config/index.js';
import type { Tool } from './types/index.js';
import { YNABClient } from './client/YNABClient.js';
import { registerTools } from './tools/index.js';

/**
 * YNAB MCP Server - Provides access to YNAB (You Need A Budget) data via MCP protocol
 *
 * Uses the high-level McpServer API which automatically handles:
 * - Tool capability registration (tools: { listChanged: true })
 * - ListTools and CallTool request handlers
 * - Zod schema to JSON Schema conversion
 */
export class YnabMcpServer {
  private server: McpServer;
  private ynabClient: YNABClient;
  private toolCount: number = 0;

  constructor(config: Config) {
    // Initialize YNAB client
    this.ynabClient = new YNABClient(config, console);

    // Initialize MCP server using the high-level McpServer API
    this.server = new McpServer({
      name: 'ynab-mcp-server',
      version: '1.0.0',
    });

    this.registerAllTools();
  }

  /**
   * Register all available YNAB tools with the MCP server
   */
  private registerAllTools(): void {
    try {
      const tools = registerTools(this.ynabClient);

      tools.forEach(tool => {
        this.server.registerTool(
          tool.name,
          {
            description: tool.description,
            // McpServer handles Zod to JSON Schema conversion internally
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            inputSchema: tool.inputSchema as any,
          },
          async (args: unknown) => {
            try {
              const result = await tool.execute(args);
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify(result, null, 2),
                  },
                ],
              };
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`Tool execution error for ${tool.name}:`, error);
              // Return error as content rather than throwing
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: errorMessage }, null, 2),
                  },
                ],
                isError: true,
              };
            }
          }
        );
      });

      this.toolCount = tools.length;
      console.error(`Registered ${this.toolCount} YNAB tools`);
    } catch (error) {
      console.error('Failed to register tools:', error);
      throw error;
    }
  }

  /**
   * Get the YNAB client instance (for testing or debugging)
   */
  public getYnabClient(): YNABClient {
    return this.ynabClient;
  }

  /**
   * Get registered tools (for testing or debugging)
   */
  public getRegisteredTools(): Tool[] {
    return registerTools(this.ynabClient);
  }

  /**
   * Perform health check on YNAB connection
   */
  public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      const result = await this.ynabClient.healthCheck();
      return {
        status: result.status,
        details: result
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Start the MCP server with stdio transport
   */
  public async start(): Promise<void> {
    try {
      // Perform initial health check
      const health = await this.healthCheck();
      if (health.status === 'unhealthy') {
        console.error('Warning: YNAB API health check failed:', health.details);
      }

      // Start MCP server
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      console.error(`YNAB MCP Server started with ${this.toolCount} tools`);
    } catch (error) {
      console.error('Failed to start YNAB MCP Server:', error);
      throw error;
    }
  }

  /**
   * Gracefully shutdown the server
   */
  public async shutdown(): Promise<void> {
    try {
      await this.server.close();
      console.error('YNAB MCP Server shutdown complete');
    } catch (error) {
      console.error('Error during server shutdown:', error);
      throw error;
    }
  }
}
