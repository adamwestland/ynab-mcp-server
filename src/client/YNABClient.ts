import axios, { AxiosInstance, AxiosResponse, AxiosRequestConfig } from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Extend AxiosRequestConfig to include our custom properties
declare module 'axios' {
  export interface AxiosRequestConfig {
    skipRateLimit?: boolean;
    metadata?: {
      requestId: string;
      startTime: number;
    };
  }
}
import type {
  YnabApiResponse,
  YnabBudgetsResponse,
  YnabAccountsResponse,
  YnabTransactionsResponse,
  YnabCategoriesResponse,
  YnabPayeesResponse,
  YnabTransactionResponse,
  YnabCategoryResponse,
  YnabPayeeResponse,
  YnabBudgetMonthResponse,
  YnabScheduledTransactionsResponse,
  YnabScheduledTransactionResponse,
  YnabScheduledTransaction,
  RetryConfig,
  RequestOptions,
  SaveTransaction,
  UpdateTransaction,
  UpdateTransactionWithId,
  SaveScheduledTransaction,
  UpdateScheduledTransaction,
  SavePayee,
} from '../types/index.js';
import type { Config } from '../config/index.js';
import { RateLimiter, createYnabRateLimiter } from './RateLimiter.js';
import { YNABError, ErrorHandler } from './ErrorHandler.js';

/**
 * Enhanced YNAB API client with comprehensive error handling, retry logic,
 * and rate limiting using token bucket algorithm
 */
export class YNABClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private readonly defaultRetryConfig: RetryConfig;
  private readonly logger: Console | undefined;

  constructor(
    private config: Config,
    logger?: Console | undefined
  ) {
    this.logger = logger;
    this.rateLimiter = createYnabRateLimiter();
    
    // Default retry configuration
    this.defaultRetryConfig = {
      maxRetries: 3,
      initialDelay: 1000, // 1 second
      maxDelay: 30000,   // 30 seconds
      backoffMultiplier: 2,
      retryableStatusCodes: [408, 429, 500, 502, 503, 504],
    };

    this.client = axios.create({
      baseURL: this.config.ynabBaseUrl,
      headers: {
        'Authorization': `Bearer ${this.config.ynabApiToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'YNAB-MCP-Server/1.0',
      },
      timeout: 30000, // 30 second timeout
      // Enable automatic decompression
      decompress: true,
    });

    this.setupInterceptors();
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor for rate limiting and logging
    this.client.interceptors.request.use(
      async (config) => {
        // Add request ID for tracking
        const requestId = uuidv4();
        config.headers['X-Request-ID'] = requestId;
        config.metadata = { requestId, startTime: Date.now() };

        // Apply rate limiting unless explicitly skipped
        const skipRateLimit = config.skipRateLimit as boolean;
        if (!skipRateLimit) {
          await this.rateLimiter.acquire();
        }

        this.logRequest(config);
        return config;
      },
      (error) => {
        this.logError('Request interceptor error', error);
        return Promise.reject(ErrorHandler.transform(error));
      }
    );

    // Response interceptor for logging and error transformation
    this.client.interceptors.response.use(
      (response) => {
        this.logResponse(response);
        return response;
      },
      (error) => {
        const requestId = error.config?.metadata?.requestId;
        this.logError('Response error', error, requestId);
        return Promise.reject(ErrorHandler.transform(error, requestId));
      }
    );
  }

  /**
   * Make HTTP GET request with retry logic
   */
  async get<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('GET', url, undefined, options);
  }

  /**
   * Make HTTP POST request with retry logic
   */
  async post<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('POST', url, data, options);
  }

  /**
   * Make HTTP PUT request with retry logic
   */
  async put<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('PUT', url, data, options);
  }

  /**
   * Make HTTP PATCH request with retry logic
   */
  async patch<T>(url: string, data?: unknown, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('PATCH', url, data, options);
  }

  /**
   * Make HTTP DELETE request with retry logic
   */
  async delete<T>(url: string, options?: RequestOptions): Promise<T> {
    return this.makeRequest<T>('DELETE', url, undefined, options);
  }

  /**
   * Core request method with exponential backoff retry logic
   */
  private async makeRequest<T>(
    method: string,
    url: string,
    data?: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    const retryConfig = { ...this.defaultRetryConfig, ...options.retryConfig };
    let lastError: YNABError | undefined;

    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        const config: AxiosRequestConfig = {
          method,
          url,
          data,
        };

        if (options.skipRateLimit !== undefined) {
          config.skipRateLimit = options.skipRateLimit;
        }

        if (options.timeout !== undefined) {
          config.timeout = options.timeout;
        }
        
        if (options.headers !== undefined) {
          config.headers = options.headers;
        }

        const response: AxiosResponse<YnabApiResponse<T>> = await this.client.request(config);
        return response.data.data;

      } catch (error) {
        const ynabError = error instanceof YNABError ? error : ErrorHandler.transform(error);
        lastError = ynabError;

        // Don't retry on final attempt
        if (attempt === retryConfig.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.shouldRetry(ynabError, retryConfig)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, retryConfig, ynabError);
        
        this.logger?.warn(`Request failed (attempt ${attempt + 1}/${retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, {
          error: ynabError.message,
          type: ynabError.type,
          url,
          method,
        });

        await this.sleep(delay);
      }
    }

    throw lastError || new YNABError({
      type: 'unknown',
      message: 'Request failed with unknown error',
    });
  }

  /**
   * Check if an error should trigger a retry
   */
  private shouldRetry(error: YNABError, retryConfig: RetryConfig): boolean {
    // Always retry if error is marked as retryable
    if (error.isRetryable()) {
      return true;
    }

    // Retry specific status codes
    if (error.statusCode && retryConfig.retryableStatusCodes.includes(error.statusCode)) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay for exponential backoff with jitter
   */
  private calculateDelay(
    attempt: number,
    retryConfig: RetryConfig,
    error: YNABError
  ): number {
    // If rate limited and we have retry-after, respect it
    if (error.type === 'rate_limit' && error.retryAfter) {
      return error.retryAfter;
    }

    // Calculate exponential backoff
    const exponentialDelay = retryConfig.initialDelay * Math.pow(retryConfig.backoffMultiplier, attempt);
    
    // Add jitter (±25% randomness) to prevent thundering herd
    const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
    const delayWithJitter = exponentialDelay + jitter;

    // Clamp to max delay
    return Math.min(delayWithJitter, retryConfig.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // YNAB API Methods

  /**
   * Get all budgets for the user
   */
  async getBudgets(): Promise<YnabBudgetsResponse> {
    return this.get<YnabBudgetsResponse>('/budgets');
  }

  /**
   * Get a specific budget by ID
   */
  async getBudget(budgetId: string): Promise<YnabBudgetsResponse['budgets'][0]> {
    const response = await this.get<{ budget: YnabBudgetsResponse['budgets'][0] }>(`/budgets/${budgetId}`);
    return response.budget;
  }

  /**
   * Get all accounts for a budget with delta sync support
   */
  async getAccounts(
    budgetId: string,
    lastKnowledgeOfServer?: number
  ): Promise<YnabAccountsResponse> {
    const params = new URLSearchParams();
    if (lastKnowledgeOfServer !== undefined) {
      params.append('last_knowledge_of_server', lastKnowledgeOfServer.toString());
    }

    const url = `/budgets/${budgetId}/accounts${params.toString() ? '?' + params.toString() : ''}`;
    return this.get<YnabAccountsResponse>(url);
  }

  /**
   * Get a specific account by ID
   */
  async getAccount(budgetId: string, accountId: string): Promise<YnabAccountsResponse['accounts'][0]> {
    const response = await this.get<{ account: YnabAccountsResponse['accounts'][0] }>(
      `/budgets/${budgetId}/accounts/${accountId}`
    );
    return response.account;
  }

  /**
   * Get transactions with comprehensive filtering and delta sync support
   */
  async getTransactions(
    budgetId: string,
    options: {
      sinceDate?: string;
      type?: 'uncategorized' | 'unapproved';
      lastKnowledgeOfServer?: number;
    } = {}
  ): Promise<YnabTransactionsResponse> {
    const params = new URLSearchParams();
    if (options.sinceDate) params.append('since_date', options.sinceDate);
    if (options.type) params.append('type', options.type);
    if (options.lastKnowledgeOfServer !== undefined) {
      params.append('last_knowledge_of_server', options.lastKnowledgeOfServer.toString());
    }

    const url = `/budgets/${budgetId}/transactions${params.toString() ? '?' + params.toString() : ''}`;
    return this.get<YnabTransactionsResponse>(url);
  }

  /**
   * Get transactions for a specific account
   */
  async getAccountTransactions(
    budgetId: string,
    accountId: string,
    options: {
      sinceDate?: string;
      type?: 'uncategorized' | 'unapproved';
      lastKnowledgeOfServer?: number;
    } = {}
  ): Promise<YnabTransactionsResponse> {
    const params = new URLSearchParams();
    if (options.sinceDate) params.append('since_date', options.sinceDate);
    if (options.type) params.append('type', options.type);
    if (options.lastKnowledgeOfServer !== undefined) {
      params.append('last_knowledge_of_server', options.lastKnowledgeOfServer.toString());
    }

    const url = `/budgets/${budgetId}/accounts/${accountId}/transactions${params.toString() ? '?' + params.toString() : ''}`;
    return this.get<YnabTransactionsResponse>(url);
  }

  /**
   * Get a specific transaction by ID
   */
  async getTransaction(budgetId: string, transactionId: string): Promise<YnabTransactionsResponse['transactions'][0]> {
    const response = await this.get<{ transaction: YnabTransactionsResponse['transactions'][0] }>(
      `/budgets/${budgetId}/transactions/${transactionId}`
    );
    return response.transaction;
  }

  /**
   * Create new transactions
   */
  async createTransactions(
    budgetId: string,
    transactions: SaveTransaction[]
  ): Promise<YnabTransactionsResponse> {
    return this.post<YnabTransactionsResponse>(`/budgets/${budgetId}/transactions`, {
      transactions,
    });
  }

  /**
   * Update existing transactions
   */
  async updateTransactions(
    budgetId: string,
    transactions: UpdateTransactionWithId[]
  ): Promise<YnabTransactionsResponse> {
    return this.patch<YnabTransactionsResponse>(`/budgets/${budgetId}/transactions`, {
      transactions,
    });
  }

  /**
   * Get all categories for a budget with delta sync support
   */
  async getCategories(
    budgetId: string,
    options?: { lastKnowledgeOfServer?: number }
  ): Promise<YnabCategoriesResponse> {
    const params = new URLSearchParams();
    if (options?.lastKnowledgeOfServer !== undefined) {
      params.append('last_knowledge_of_server', options.lastKnowledgeOfServer.toString());
    }

    const url = `/budgets/${budgetId}/categories${params.toString() ? '?' + params.toString() : ''}`;
    return this.get<YnabCategoriesResponse>(url);
  }

  /**
   * Get all payees for a budget with delta sync support
   */
  async getPayees(
    budgetId: string,
    options?: { lastKnowledgeOfServer?: number }
  ): Promise<YnabPayeesResponse> {
    const params = new URLSearchParams();
    if (options?.lastKnowledgeOfServer !== undefined) {
      params.append('last_knowledge_of_server', options.lastKnowledgeOfServer.toString());
    }

    const url = `/budgets/${budgetId}/payees${params.toString() ? '?' + params.toString() : ''}`;
    return this.get<YnabPayeesResponse>(url);
  }

  /**
   * Get a single category by ID
   */
  async getCategory(budgetId: string, categoryId: string): Promise<YnabCategoryResponse> {
    return this.get<YnabCategoryResponse>(`/budgets/${budgetId}/categories/${categoryId}`);
  }

  /**
   * Get a single payee by ID
   */
  async getPayee(budgetId: string, payeeId: string): Promise<YnabPayeeResponse> {
    return this.get<YnabPayeeResponse>(`/budgets/${budgetId}/payees/${payeeId}`);
  }

  /**
   * Create a new payee
   */
  async createPayee(budgetId: string, payee: SavePayee): Promise<YnabPayeeResponse> {
    return this.post<YnabPayeeResponse>(`/budgets/${budgetId}/payees`, { payee });
  }

  /**
   * Create a single transaction
   */
  async createTransaction(budgetId: string, transaction: SaveTransaction): Promise<YnabTransactionResponse> {
    return this.post<YnabTransactionResponse>(`/budgets/${budgetId}/transactions`, { transaction });
  }

  /**
   * Update a single transaction
   */
  async updateTransaction(budgetId: string, transactionId: string, transaction: UpdateTransaction): Promise<YnabTransactionResponse> {
    return this.patch<YnabTransactionResponse>(`/budgets/${budgetId}/transactions/${transactionId}`, { transaction });
  }

  /**
   * Update category budget for a specific month
   */
  async updateCategoryBudget(budgetId: string, categoryId: string, month: string, budgeted: number): Promise<YnabCategoryResponse> {
    return this.patch<YnabCategoryResponse>(`/budgets/${budgetId}/months/${month}/categories/${categoryId}`, {
      category: { budgeted }
    });
  }

  /**
   * Get budget data for a specific month
   */
  async getBudgetMonth(budgetId: string, month: string): Promise<YnabBudgetMonthResponse> {
    return this.get<YnabBudgetMonthResponse>(`/budgets/${budgetId}/months/${month}`);
  }

  /**
   * Get all scheduled transactions for a budget with delta sync support
   */
  async getScheduledTransactions(
    budgetId: string,
    lastKnowledgeOfServer?: number
  ): Promise<YnabScheduledTransactionsResponse> {
    const params = new URLSearchParams();
    if (lastKnowledgeOfServer !== undefined) {
      params.append('last_knowledge_of_server', lastKnowledgeOfServer.toString());
    }

    const url = `/budgets/${budgetId}/scheduled_transactions${params.toString() ? '?' + params.toString() : ''}`;
    return this.get<YnabScheduledTransactionsResponse>(url);
  }

  /**
   * Get a specific scheduled transaction by ID
   */
  async getScheduledTransaction(budgetId: string, scheduledTransactionId: string): Promise<YnabScheduledTransaction> {
    const response = await this.get<{ scheduled_transaction: YnabScheduledTransaction }>(
      `/budgets/${budgetId}/scheduled_transactions/${scheduledTransactionId}`
    );
    return response.scheduled_transaction;
  }

  /**
   * Create a new scheduled transaction
   */
  async createScheduledTransaction(
    budgetId: string,
    scheduledTransaction: SaveScheduledTransaction
  ): Promise<YnabScheduledTransactionResponse> {
    return this.post<YnabScheduledTransactionResponse>(`/budgets/${budgetId}/scheduled_transactions`, {
      scheduled_transaction: scheduledTransaction,
    });
  }

  /**
   * Update an existing scheduled transaction
   */
  async updateScheduledTransaction(
    budgetId: string,
    scheduledTransactionId: string,
    scheduledTransaction: UpdateScheduledTransaction
  ): Promise<YnabScheduledTransactionResponse> {
    return this.patch<YnabScheduledTransactionResponse>(
      `/budgets/${budgetId}/scheduled_transactions/${scheduledTransactionId}`,
      { scheduled_transaction: scheduledTransaction }
    );
  }

  /**
   * Delete a scheduled transaction
   */
  async deleteScheduledTransaction(budgetId: string, scheduledTransactionId: string): Promise<void> {
    await this.delete<void>(`/budgets/${budgetId}/scheduled_transactions/${scheduledTransactionId}`);
  }

  // Utility and monitoring methods

  /**
   * Get rate limiter status for monitoring
   */
  getRateLimitStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Get remaining rate limit tokens
   */
  getRemainingTokens(): number {
    return this.rateLimiter.getRemainingTokens();
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  resetRateLimit(): void {
    this.rateLimiter.reset();
  }

  /**
   * Health check - makes a simple API call to verify connectivity
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; error?: string }> {
    const startTime = Date.now();
    try {
      await this.getBudgets();
      return {
        status: 'healthy',
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Logging methods

  /**
   * Log HTTP request details
   */
  private logRequest(config: AxiosRequestConfig): void {
    if (!this.logger) return;

    this.logger.debug('YNAB API Request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      requestId: config.metadata?.requestId,
      hasData: Boolean(config.data),
      timeout: config.timeout,
    });
  }

  /**
   * Log HTTP response details
   */
  private logResponse(response: AxiosResponse): void {
    if (!this.logger) return;

    const requestId = response.config?.metadata?.requestId;
    const startTime = response.config?.metadata?.startTime;
    const duration = startTime ? Date.now() - startTime : undefined;

    this.logger.debug('YNAB API Response:', {
      status: response.status,
      statusText: response.statusText,
      requestId,
      duration: duration ? `${duration}ms` : undefined,
      hasData: Boolean(response.data),
      rateLimitRemaining: this.rateLimiter.getRemainingTokens(),
    });
  }

  /**
   * Log error details
   */
  private logError(message: string, error: unknown, requestId?: string): void {
    if (!this.logger) return;

    if (error instanceof YNABError) {
      this.logger.error(message, {
        type: error.type,
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        requestId: requestId || error.requestId,
        retryAfter: error.retryAfter,
      });
    } else {
      this.logger.error(message, {
        error: error instanceof Error ? error.message : String(error),
        requestId,
      });
    }
  }
}