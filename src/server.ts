import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { Config } from './config/index.js';
import type { Tool } from './types/index.js';
import { YNABClient } from './client/YNABClient.js';
import { registerTools } from './tools/index.js';

/**
 * YNAB MCP Server - Provides access to YNAB (You Need A Budget) data via MCP protocol
 */
export class YnabMcpServer {
  private server: Server;
  private tools: Map<string, Tool> = new Map();
  private ynabClient: YNABClient;

  constructor(config: Config) {
    // Initialize YNAB client
    this.ynabClient = new YNABClient(config, console);

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'ynab-mcp-server',
        version: '1.0.0',
        description: 'MCP server for YNAB (You Need A Budget) integration',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
    this.registerAllTools();
  }

  /**
   * Set up MCP protocol request handlers
   */
  private setupHandlers(): void {
    // Handle list tools requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map(tool => {
          // Convert Zod schema to JSON Schema for MCP protocol
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const jsonSchema = zodToJsonSchema(tool.inputSchema as any, {
            $refStrategy: 'none',
            target: 'jsonSchema7',
          });
          return {
            name: tool.name,
            description: tool.description,
            inputSchema: jsonSchema,
          };
        }),
      };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      const tool = this.tools.get(name);
      if (!tool) {
        throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
      }

      try {
        // Execute the tool and get result
        const result = await tool.execute(args);
        
        // Return structured response
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        // Enhanced error handling
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Tool execution error for ${name}:`, error);
        
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`
        );
      }
    });
  }

  /**
   * Register all available YNAB tools
   */
  private registerAllTools(): void {
    try {
      registerTools(this.ynabClient).forEach(tool => {
        this.registerTool(tool);
      });
      console.error(`Registered ${this.tools.size} YNAB tools`);
    } catch (error) {
      console.error('Failed to register tools:', error);
      throw error;
    }
  }

  /**
   * Register a single tool
   */
  public registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
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
    return Array.from(this.tools.values());
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
      
      console.error(`YNAB MCP Server started with ${this.tools.size} tools`);
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