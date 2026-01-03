/**
 * API Response Helpers
 *
 * Factories for YNAB API response wrappers and error responses.
 */

import { YNABError } from '../../src/client/ErrorHandler.js';

/**
 * Wrap data in standard YNAB API response format
 */
export function wrapApiResponse<T>(data: T): { data: T } {
  return { data };
}

/**
 * Create a successful budgets response
 */
export function createBudgetsResponse(budgets: unknown[], defaultBudget?: unknown) {
  return wrapApiResponse({
    budgets,
    default_budget: defaultBudget ?? null,
  });
}

/**
 * Create a successful accounts response
 */
export function createAccountsResponse(accounts: unknown[], serverKnowledge: number = 1) {
  return wrapApiResponse({
    accounts,
    server_knowledge: serverKnowledge,
  });
}

/**
 * Create a successful transactions response
 */
export function createTransactionsResponse(transactions: unknown[], serverKnowledge: number = 1) {
  return wrapApiResponse({
    transactions,
    server_knowledge: serverKnowledge,
  });
}

/**
 * Create a successful categories response
 */
export function createCategoriesResponse(categoryGroups: unknown[], serverKnowledge: number = 1) {
  return wrapApiResponse({
    category_groups: categoryGroups,
    server_knowledge: serverKnowledge,
  });
}

/**
 * Create a successful payees response
 */
export function createPayeesResponse(payees: unknown[], serverKnowledge: number = 1) {
  return wrapApiResponse({
    payees,
    server_knowledge: serverKnowledge,
  });
}

/**
 * Create a successful scheduled transactions response
 */
export function createScheduledTransactionsResponse(
  scheduledTransactions: unknown[],
  serverKnowledge: number = 1
) {
  return wrapApiResponse({
    scheduled_transactions: scheduledTransactions,
    server_knowledge: serverKnowledge,
  });
}

/**
 * Create a successful budget month response
 */
export function createBudgetMonthResponse(month: unknown) {
  return wrapApiResponse({ month });
}

// Error Response Factories

/**
 * Create a 400 Bad Request error
 */
export function createValidationError(message: string = 'Invalid request'): YNABError {
  return new YNABError({
    type: 'validation',
    message,
    statusCode: 400,
    code: 'bad_request',
  });
}

/**
 * Create a 401 Unauthorized error
 */
export function createAuthError(message: string = 'Unauthorized'): YNABError {
  return new YNABError({
    type: 'auth',
    message,
    statusCode: 401,
    code: 'unauthorized',
  });
}

/**
 * Create a 404 Not Found error
 */
export function createNotFoundError(resource: string = 'Resource'): YNABError {
  return new YNABError({
    type: 'not_found',
    message: `${resource} not found`,
    statusCode: 404,
    code: 'not_found',
  });
}

/**
 * Create a 429 Rate Limit error
 */
export function createRateLimitError(retryAfter: number = 60000): YNABError {
  return new YNABError({
    type: 'rate_limit',
    message: 'Rate limit exceeded',
    statusCode: 429,
    code: 'too_many_requests',
    retryAfter,
  });
}

/**
 * Create a 500 Internal Server Error
 */
export function createServerError(message: string = 'Internal server error'): YNABError {
  return new YNABError({
    type: 'api_error',
    message,
    statusCode: 500,
    code: 'internal_error',
  });
}

/**
 * Create a 502 Bad Gateway error
 */
export function createBadGatewayError(): YNABError {
  return new YNABError({
    type: 'api_error',
    message: 'Bad gateway',
    statusCode: 502,
    code: 'bad_gateway',
  });
}

/**
 * Create a 503 Service Unavailable error
 */
export function createServiceUnavailableError(): YNABError {
  return new YNABError({
    type: 'api_error',
    message: 'Service temporarily unavailable',
    statusCode: 503,
    code: 'service_unavailable',
  });
}

/**
 * Create a network error (no response)
 */
export function createNetworkError(message: string = 'Network error'): YNABError {
  return new YNABError({
    type: 'network',
    message,
  });
}

/**
 * Create a timeout error
 */
export function createTimeoutError(): YNABError {
  return new YNABError({
    type: 'timeout',
    message: 'Request timeout',
    code: 'ECONNABORTED',
  });
}

/**
 * Create an Axios-like error object for testing error transformation
 */
export function createAxiosError(
  statusCode: number,
  message: string = 'Error',
  data?: unknown
): {
  isAxiosError: boolean;
  response?: { status: number; statusText: string; data: unknown; headers: Record<string, string> };
  request?: object;
  message: string;
  code?: string;
} {
  if (statusCode === 0) {
    // Network error - no response but has request
    return {
      isAxiosError: true,
      message,
      code: 'ERR_NETWORK',
      request: {}, // Has request but no response = network error
    };
  }

  return {
    isAxiosError: true,
    response: {
      status: statusCode,
      statusText: message,
      data: data ?? { error: { id: 'error_id', name: 'error', detail: message } },
      headers: {},
    },
    message,
  };
}

/**
 * Create an Axios timeout error
 */
export function createAxiosTimeoutError(): {
  isAxiosError: boolean;
  message: string;
  code: string;
  request?: object;
} {
  return {
    isAxiosError: true,
    message: 'timeout of 30000ms exceeded',
    code: 'ECONNABORTED',
    // No request property - this makes it not a network error
  };
}
