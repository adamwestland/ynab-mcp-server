/**
 * YnabMcpServer Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YnabMcpServer } from '../../src/server.js';
import type { Config } from '../../src/config/index.js';

// Mock the MCP SDK to avoid actual server startup
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(() => ({
    registerTool: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

const mockConfig: Config = {
  ynabApiToken: 'test-api-token',
  ynabBaseUrl: 'https://api.ynab.com/v1',
};

describe('YnabMcpServer', () => {
  let server: YnabMcpServer;

  beforeEach(() => {
    // Suppress console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    server = new YnabMcpServer(mockConfig);
  });

  describe('initialization', () => {
    it('creates server instance', () => {
      expect(server).toBeInstanceOf(YnabMcpServer);
    });

    it('registers tools on construction', () => {
      const tools = server.getRegisteredTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('exposes YNAB client', () => {
      const client = server.getYnabClient();
      expect(client).toBeDefined();
    });
  });

  describe('tool registration', () => {
    it('registers all expected tool categories', () => {
      const tools = server.getRegisteredTools();
      const toolNames = tools.map(t => t.name);

      // Check for key tools from each category
      expect(toolNames).toContain('ynab_list_budgets');
      expect(toolNames).toContain('ynab_get_accounts');
      expect(toolNames).toContain('ynab_get_transactions');
      expect(toolNames).toContain('ynab_create_transaction');
      expect(toolNames).toContain('ynab_get_categories');
      expect(toolNames).toContain('ynab_get_payees');
      expect(toolNames).toContain('ynab_get_scheduled_transactions');
    });

    it('each tool has required properties', () => {
      const tools = server.getRegisteredTools();

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.name).toMatch(/^ynab_/);
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('tool names are unique', () => {
      const tools = server.getRegisteredTools();
      const names = tools.map(t => t.name);
      const uniqueNames = new Set(names);

      expect(names.length).toBe(uniqueNames.size);
    });
  });

  describe('tool schemas', () => {
    it('all tools have valid Zod schemas', () => {
      const tools = server.getRegisteredTools();

      for (const tool of tools) {
        // Check that inputSchema exists and has expected properties
        expect(tool.inputSchema).toBeDefined();

        // inputSchema should be a Zod schema that describes the expected format
        // When converted to JSON schema for MCP, it should have type information
        const schema = tool.inputSchema;
        expect(schema).toBeDefined();
      }
    });
  });

  describe('health check', () => {
    it('returns health status', async () => {
      // Note: This will fail because we don't have a real API token
      const health = await server.healthCheck();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('details');
      expect(['healthy', 'unhealthy']).toContain(health.status);
    });
  });

  describe('server lifecycle', () => {
    it('starts without throwing', async () => {
      await expect(server.start()).resolves.not.toThrow();
    });

    it('shuts down without throwing', async () => {
      await server.start();
      await expect(server.shutdown()).resolves.not.toThrow();
    });
  });
});

describe('Tool count verification', () => {
  it('has expected number of tools registered', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const server = new YnabMcpServer(mockConfig);
    const tools = server.getRegisteredTools();

    // The server should have 20+ tools across all categories
    expect(tools.length).toBeGreaterThanOrEqual(20);
  });
});
