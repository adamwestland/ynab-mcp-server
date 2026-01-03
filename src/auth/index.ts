/**
 * Authentication utilities for YNAB API
 */

import type { Config } from '../config/index.js';

/**
 * Validate YNAB API token format
 */
export function validateApiToken(token: string): boolean {
  // YNAB API tokens are typically 64 characters long and alphanumeric
  const tokenRegex = /^[a-zA-Z0-9]{64}$/;
  return tokenRegex.test(token);
}

/**
 * Get authorization headers for YNAB API
 */
export function getAuthHeaders(config: Config): Record<string, string> {
  return {
    'Authorization': `Bearer ${config.ynabApiToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Validate configuration has required auth fields
 */
export function validateAuthConfig(config: Config): void {
  if (!config.ynabApiToken) {
    throw new Error('YNAB API token is required but not provided');
  }

  if (!validateApiToken(config.ynabApiToken)) {
    throw new Error('YNAB API token format is invalid. Expected 64-character alphanumeric string.');
  }
}

/**
 * Mask API token for logging (show only first and last 4 characters)
 */
export function maskApiToken(token: string): string {
  if (token.length < 8) {
    return '****';
  }
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}