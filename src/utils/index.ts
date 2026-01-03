/**
 * Utility functions for the YNAB MCP server
 */

/**
 * Convert milliunits to currency amount
 */
export function milliunitsToAmount(milliunits: number): number {
  return milliunits / 1000;
}

/**
 * Convert currency amount to milliunits
 */
export function amountToMilliunits(amount: number): number {
  return Math.round(amount * 1000);
}

/**
 * Format currency with symbol
 */
export function formatCurrency(
  milliunits: number, 
  currencySymbol = '$',
  decimalPlaces = 2
): string {
  const amount = milliunitsToAmount(milliunits);
  return `${currencySymbol}${amount.toFixed(decimalPlaces)}`;
}

/**
 * Parse ISO date string to Date object
 */
export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Format date for YNAB API (YYYY-MM-DD)
 */
export function formatDateForApi(date: Date): string {
  return date.toISOString().split('T')[0] as string;
}

/**
 * Get current date formatted for YNAB API
 */
export function getCurrentDateForApi(): string {
  return formatDateForApi(new Date());
}

/**
 * Calculate date N days ago
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Validate UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if a string is empty or only whitespace
 */
export function isEmpty(str?: string | null): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Truncate string to specified length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}