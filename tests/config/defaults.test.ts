import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('Zod 4 configuration defaults', () => {
  it('parses nested defaults when the rate-limit object is omitted', async () => {
    vi.stubEnv('YNAB_API_TOKEN', 'local-placeholder');
    const { ConfigSchema } = await import('../../src/config/index.js');
    expect(ConfigSchema.parse({ ynabApiToken: 'local-placeholder' }).rateLimit)
      .toEqual({ requests: 200, windowMs: 3600000 });
  });

  it('keeps explicit values, fills partial defaults and rejects invalid limits', async () => {
    vi.stubEnv('YNAB_API_TOKEN', 'local-placeholder');
    const { ConfigSchema } = await import('../../src/config/index.js');
    expect(ConfigSchema.parse({ ynabApiToken: 'local-placeholder', rateLimit: { requests: 50 } }).rateLimit)
      .toEqual({ requests: 50, windowMs: 3600000 });
    expect(() => ConfigSchema.parse({ ynabApiToken: 'local-placeholder', rateLimit: { requests: -1 } })).toThrow();
  });
});
