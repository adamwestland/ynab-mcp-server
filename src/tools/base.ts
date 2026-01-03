import { z } from 'zod';
import type { Tool } from '../types/index.js';
import type { YNABClient } from '../client/YNABClient.js';

/**
 * Abstract base class for YNAB MCP tools
 */
export abstract class YnabTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: z.ZodSchema;

  constructor(protected client: YNABClient) {}

  abstract execute(args: unknown): Promise<unknown>;

  /**
   * Validate input arguments against the schema
   */
  protected validateArgs<T>(args: unknown): T {
    return this.inputSchema.parse(args) as T;
  }

  /**
   * Helper to format currency amounts from milliunits
   */
  protected formatCurrency(milliunits: number, currencySymbol = '$'): string {
    const amount = milliunits / 1000;
    return `${currencySymbol}${amount.toFixed(2)}`;
  }

  /**
   * Helper to format dates
   */
  protected formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  /**
   * Helper to handle errors consistently
   */
  protected handleError(error: unknown, operation: string): never {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${operation} failed: ${message}`);
  }
}