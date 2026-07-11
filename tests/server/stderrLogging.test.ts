/**
 * Regression test: stdout must stay clean for the MCP stdio protocol stream.
 *
 * The server once passed the global `console` (stdout-bound for debug/log)
 * into YNABClient as its API logger, so every API request/response wrote
 * debug JSON into the JSON-RPC stream. Strict stdio clients reject those
 * stray lines. Anything the API logger emits must go to stderr.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { YnabMcpServer } from '../../src/server.js';
import type { Config } from '../../src/config/index.js';

// Mock the MCP SDK to avoid actual server startup
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn().mockImplementation(function () {
    return {
      registerTool: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
  }),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

// Capture the interceptor callbacks YNABClient registers on its axios
// instance so the test can drive the logging path without any network.
const captured = {
  request: [] as Array<(config: any) => any>,
  response: [] as Array<(response: any) => any>,
};

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      interceptors: {
        request: {
          use: (onFulfilled: (config: any) => any) => {
            captured.request.push(onFulfilled);
          },
        },
        response: {
          use: (onFulfilled: (response: any) => any) => {
            captured.response.push(onFulfilled);
          },
        },
      },
    })),
  },
}));

const mockConfig: Config = {
  ynabApiToken: 'test-api-token',
  ynabBaseUrl: 'https://api.ynab.com/v1',
};

describe('YNAB API logging vs the stdio protocol stream', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes API request/response logs to stderr, never stdout', async () => {
    // Suppress the server's own startup logging (global console.error)
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const server = new YnabMcpServer(mockConfig);
    expect(server).toBeInstanceOf(YnabMcpServer);
    expect(captured.request.length).toBeGreaterThan(0);
    expect(captured.response.length).toBeGreaterThan(0);

    const stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    // Drive the exact code paths that once leaked to stdout: the axios
    // request/response interceptors call logRequest/logResponse.
    await captured.request[0]!({
      method: 'get',
      url: '/budgets',
      baseURL: mockConfig.ynabBaseUrl,
      headers: {},
      timeout: 30000,
    });
    captured.response[0]!({
      status: 200,
      statusText: 'OK',
      data: { budgets: [] },
      config: { metadata: { requestId: 'test-request', startTime: Date.now() } },
    });

    expect(stderrWrite).toHaveBeenCalled();
    expect(stdoutWrite).not.toHaveBeenCalled();
  });
});
