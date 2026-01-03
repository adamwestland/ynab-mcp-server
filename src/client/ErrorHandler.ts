import { AxiosError } from 'axios';
import type { 
  YnabApiErrorResponse, 
  ErrorType, 
  YNABErrorDetails 
} from '../types/index.js';

/**
 * Custom error class for YNAB API errors with enhanced error information
 */
export class YNABError extends Error {
  public readonly type: ErrorType;
  public readonly code?: string | undefined;
  public readonly retryAfter?: number | undefined;
  public readonly requestId?: string | undefined;
  public readonly statusCode?: number | undefined;
  public readonly originalError?: unknown;

  constructor(details: YNABErrorDetails) {
    super(details.message);
    this.name = 'YNABError';
    this.type = details.type;
    this.code = details.code;
    this.retryAfter = details.retryAfter;
    this.requestId = details.requestId;
    this.statusCode = details.statusCode;
    this.originalError = details.originalError;

    // Maintain proper stack trace for where the error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, YNABError);
    }
  }

  /**
   * Check if this error is retryable based on its type and status code
   */
  public isRetryable(): boolean {
    const retryableTypes: ErrorType[] = ['rate_limit', 'network_error', 'timeout'];
    const retryableStatusCodes = [408, 429, 500, 502, 503, 504];
    
    return retryableTypes.includes(this.type) || 
           (this.statusCode !== undefined && retryableStatusCodes.includes(this.statusCode));
  }

  /**
   * Get user-friendly error message
   */
  public getUserFriendlyMessage(): string {
    switch (this.type) {
      case 'auth':
        return 'Authentication failed. Please check your YNAB API token.';
      case 'rate_limit':
        const retryMessage = this.retryAfter 
          ? ` Please try again in ${Math.ceil(this.retryAfter / 1000)} seconds.`
          : ' Please try again later.';
        return `Rate limit exceeded.${retryMessage}`;
      case 'not_found':
        return 'The requested resource was not found. Please verify the budget, account, or transaction ID.';
      case 'validation':
        return `Invalid request data: ${this.message}`;
      case 'network_error':
        return 'Network error occurred. Please check your internet connection and try again.';
      case 'timeout':
        return 'Request timed out. Please try again.';
      case 'api_error':
        return `YNAB API error: ${this.message}`;
      default:
        return `An unexpected error occurred: ${this.message}`;
    }
  }

  /**
   * Convert error to JSON for logging
   */
  public toJSON() {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryAfter: this.retryAfter,
      requestId: this.requestId,
      stack: this.stack,
    };
  }
}

/**
 * Error handler utility class for transforming various error types into YNABError
 */
export class ErrorHandler {
  /**
   * Transform any error into a structured YNABError
   */
  public static transform(error: unknown, requestId?: string): YNABError {
    // If it's already a YNABError, return as-is
    if (error instanceof YNABError) {
      return error;
    }

    // Handle Axios errors (HTTP errors)
    if (ErrorHandler.isAxiosError(error)) {
      return ErrorHandler.transformAxiosError(error, requestId);
    }

    // Handle timeout errors
    if (ErrorHandler.isTimeoutError(error)) {
      return new YNABError({
        type: 'timeout',
        message: 'Request timed out',
        originalError: error,
        requestId: requestId || undefined,
      });
    }

    // Handle network errors
    if (ErrorHandler.isNetworkError(error)) {
      return new YNABError({
        type: 'network_error',
        message: 'Network error occurred',
        originalError: error,
        requestId: requestId || undefined,
      });
    }

    // Handle generic Error objects
    if (error instanceof Error) {
      return new YNABError({
        type: 'unknown',
        message: error.message,
        originalError: error,
        requestId: requestId || undefined,
      });
    }

    // Handle non-Error objects
    return new YNABError({
      type: 'unknown',
      message: 'An unknown error occurred',
      originalError: error,
      requestId: requestId || undefined,
    });
  }

  /**
   * Transform Axios error into YNABError
   */
  private static transformAxiosError(error: AxiosError, requestId?: string): YNABError {
    const statusCode = error.response?.status;
    const responseData = error.response?.data;

    // Extract request ID from response headers if available
    const responseRequestId = requestId || 
      error.response?.headers['x-request-id'] || 
      error.response?.headers['request-id'];

    // Handle YNAB API error responses
    if (ErrorHandler.isYnabApiErrorResponse(responseData)) {
      const ynabError = responseData.error;
      return new YNABError({
        type: ErrorHandler.mapYnabErrorNameToType(ynabError.name),
        code: ynabError.id,
        message: ynabError.description,
        statusCode,
        originalError: error,
        requestId: responseRequestId || undefined,
        retryAfter: ErrorHandler.extractRetryAfter(error) || undefined,
      });
    }

    // Handle HTTP status code based errors
    if (statusCode) {
      return ErrorHandler.transformHttpStatusError(statusCode, error, responseRequestId);
    }

    // Fallback for other Axios errors
    return new YNABError({
      type: 'network_error',
      message: error.message || 'Network error occurred',
      originalError: error,
      requestId: responseRequestId,
    });
  }

  /**
   * Transform HTTP status code into appropriate error type
   */
  private static transformHttpStatusError(
    statusCode: number, 
    error: AxiosError, 
    requestId?: string
  ): YNABError {
    let type: ErrorType;
    let message: string;

    switch (statusCode) {
      case 400:
        type = 'validation';
        message = 'Bad request - invalid parameters or request format';
        break;
      case 401:
        type = 'auth';
        message = 'Unauthorized - invalid or missing API token';
        break;
      case 403:
        type = 'auth';
        message = 'Forbidden - insufficient permissions';
        break;
      case 404:
        type = 'not_found';
        message = 'Resource not found';
        break;
      case 429:
        type = 'rate_limit';
        message = 'Rate limit exceeded';
        break;
      case 408:
        type = 'timeout';
        message = 'Request timeout';
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        type = 'api_error';
        message = `Server error (${statusCode})`;
        break;
      default:
        type = 'api_error';
        message = `HTTP error ${statusCode}`;
    }

    return new YNABError({
      type,
      message,
      statusCode,
      originalError: error,
      requestId: requestId || undefined,
      retryAfter: ErrorHandler.extractRetryAfter(error) || undefined,
    });
  }

  /**
   * Map YNAB error names to our error types
   */
  private static mapYnabErrorNameToType(errorName: string): ErrorType {
    const lowerName = errorName.toLowerCase();
    
    if (lowerName.includes('validation') || lowerName.includes('invalid')) {
      return 'validation';
    }
    if (lowerName.includes('not_found') || lowerName.includes('notfound')) {
      return 'not_found';
    }
    if (lowerName.includes('rate') || lowerName.includes('limit')) {
      return 'rate_limit';
    }
    if (lowerName.includes('auth') || lowerName.includes('unauthorized')) {
      return 'auth';
    }
    
    return 'api_error';
  }

  /**
   * Extract retry-after header value
   */
  private static extractRetryAfter(error: AxiosError): number | undefined {
    const retryAfterHeader = error.response?.headers['retry-after'];
    if (retryAfterHeader) {
      const retryAfter = parseInt(retryAfterHeader, 10);
      return isNaN(retryAfter) ? undefined : retryAfter * 1000; // Convert to milliseconds
    }
    return undefined;
  }

  /**
   * Type guard for Axios errors
   */
  private static isAxiosError(error: unknown): error is AxiosError {
    return error !== null && 
           typeof error === 'object' && 
           'isAxiosError' in error && 
           error.isAxiosError === true;
  }

  /**
   * Type guard for YNAB API error responses
   */
  private static isYnabApiErrorResponse(data: unknown): data is YnabApiErrorResponse {
    return data !== null &&
           typeof data === 'object' &&
           'error' in data &&
           data.error !== null &&
           typeof data.error === 'object' &&
           'id' in data.error &&
           'name' in data.error &&
           'description' in data.error;
  }

  /**
   * Type guard for timeout errors
   */
  private static isTimeoutError(error: unknown): boolean {
    if (ErrorHandler.isAxiosError(error)) {
      return error.code === 'ECONNABORTED' || error.message.includes('timeout');
    }
    return error instanceof Error && error.message.includes('timeout');
  }

  /**
   * Type guard for network errors
   */
  private static isNetworkError(error: unknown): boolean {
    if (ErrorHandler.isAxiosError(error)) {
      return !error.response && Boolean(error.request);
    }
    return false;
  }
}