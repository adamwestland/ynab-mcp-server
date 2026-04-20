import { describe, it, expect, beforeEach } from 'vitest';
import {
  maybeEnrichCcInflowError,
  CC_INCOMPATIBLE_CATEGORY_HINT,
} from '../../../src/tools/common/ccInflowValidation.js';
import { YNABError } from '../../../src/client/ErrorHandler.js';
import { createMockClient, type MockYNABClient } from '../../helpers/mockClient.js';
import { createMockAccount, createMockCategory } from '../../helpers/fixtures.js';

describe('maybeEnrichCcInflowError', () => {
  let client: MockYNABClient;

  beforeEach(() => {
    client = createMockClient();
  });

  function badRequest(): YNABError {
    return new YNABError({ type: 'validation', message: 'Bad request', statusCode: 400 });
  }

  it('passes through when no category_id was submitted', async () => {
    const original = badRequest();
    const out = await maybeEnrichCcInflowError(client as any, original, 'b1', 'a-cc', null);
    expect(out).toBe(original);
    expect(client.getAccount).not.toHaveBeenCalled();
  });

  it('passes through when error is not a 400/validation', async () => {
    const other = new YNABError({ type: 'rate_limit', message: '429', statusCode: 429 });
    const out = await maybeEnrichCcInflowError(client as any, other, 'b1', 'a-cc', 'cat-rta');
    expect(out).toBe(other);
    expect(client.getAccount).not.toHaveBeenCalled();
  });

  it('enriches when account is credit card AND category is in Internal Master Category group', async () => {
    client.getAccount.mockResolvedValue(createMockAccount({ id: 'a-cc', type: 'creditCard', closed: false }));
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'cat-rta', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category' }),
      server_knowledge: 1,
    });

    const out = await maybeEnrichCcInflowError(client as any, badRequest(), 'b1', 'a-cc', 'cat-rta');
    expect(out.message).toBe(CC_INCOMPATIBLE_CATEGORY_HINT);
  });

  it('does not enrich when account is not debt-like', async () => {
    client.getAccount.mockResolvedValue(createMockAccount({ id: 'a-chk', type: 'checking', closed: false }));
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'cat-rta', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category' }),
      server_knowledge: 1,
    });

    const original = badRequest();
    const out = await maybeEnrichCcInflowError(client as any, original, 'b1', 'a-chk', 'cat-rta');
    expect(out).toBe(original);
  });

  it('does not enrich when category is not the RTA/internal one', async () => {
    client.getAccount.mockResolvedValue(createMockAccount({ id: 'a-cc', type: 'creditCard', closed: false }));
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'cat-food', name: 'Food', category_group_name: 'Spending' }),
      server_knowledge: 1,
    });

    const original = badRequest();
    const out = await maybeEnrichCcInflowError(client as any, original, 'b1', 'a-cc', 'cat-food');
    expect(out).toBe(original);
  });

  it('returns the original error if enrichment lookups themselves fail', async () => {
    client.getAccount.mockRejectedValue(new Error('network'));
    const original = badRequest();
    const out = await maybeEnrichCcInflowError(client as any, original, 'b1', 'a-cc', 'cat-rta');
    expect(out).toBe(original);
  });

  it.each([
    'creditCard',
    'lineOfCredit',
    'otherDebt',
    'mortgage',
    'autoLoan',
    'studentLoan',
    'personalLoan',
    'medicalDebt',
  ])('treats %s as a debt-like account for enrichment', async (type) => {
    client.getAccount.mockResolvedValue(createMockAccount({ id: 'a', type, closed: false }));
    client.getCategory.mockResolvedValue({
      category: createMockCategory({ id: 'c', name: 'Inflow: Ready to Assign', category_group_name: 'Internal Master Category' }),
      server_knowledge: 1,
    });
    const out = await maybeEnrichCcInflowError(client as any, badRequest(), 'b1', 'a', 'c');
    expect(out.message).toBe(CC_INCOMPATIBLE_CATEGORY_HINT);
  });
});
