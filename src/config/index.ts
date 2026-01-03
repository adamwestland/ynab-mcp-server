import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const ConfigSchema = z.object({
  ynabApiToken: z.string().min(1, 'YNAB API token is required'),
  ynabBaseUrl: z.string().url().default('https://api.youneedabudget.com/v1'),
  rateLimit: z.object({
    requests: z.number().positive().default(200),
    windowMs: z.number().positive().default(60 * 60 * 1000), // 1 hour in ms
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

function createConfig(): Config {
  const rawConfig = {
    ynabApiToken: process.env.YNAB_API_TOKEN,
    ynabBaseUrl: process.env.YNAB_BASE_URL,
    rateLimit: {
      requests: process.env.RATE_LIMIT_REQUESTS 
        ? parseInt(process.env.RATE_LIMIT_REQUESTS, 10)
        : undefined,
      windowMs: process.env.RATE_LIMIT_WINDOW_MS
        ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
        : undefined,
    },
  };

  try {
    return ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
      throw new Error(`Configuration validation failed:\n${issues.join('\n')}`);
    }
    throw error;
  }
}

export const config = createConfig();