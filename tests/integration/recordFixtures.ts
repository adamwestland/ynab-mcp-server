/**
 * Record Live API Fixtures
 *
 * This script fetches real data from the YNAB API and saves it as JSON fixtures.
 * These fixtures serve as ground truth for mock data in tests.
 *
 * Usage: npx tsx tests/integration/recordFixtures.ts
 *
 * Requires YNAB_API_TOKEN in .env or environment
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { YNABClient } from '../../src/client/YNABClient.js';
import { config } from '../../src/config/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/recorded');

// Ensure fixtures directory exists
mkdirSync(FIXTURES_DIR, { recursive: true });

interface RecordedFixture {
  endpoint: string;
  recordedAt: string;
  data: unknown;
}

function saveFixture(name: string, endpoint: string, data: unknown): void {
  const fixture: RecordedFixture = {
    endpoint,
    recordedAt: new Date().toISOString(),
    data,
  };

  const filePath = join(FIXTURES_DIR, `${name}.json`);
  writeFileSync(filePath, JSON.stringify(fixture, null, 2));
  console.log(`✓ Saved ${name}.json`);
}

async function recordFixtures(): Promise<void> {
  console.log('Recording YNAB API fixtures...\n');

  const client = new YNABClient(config, console);

  try {
    // 1. Get budgets first (we need a budget ID for other endpoints)
    console.log('Fetching budgets...');
    const budgetsResponse = await client.getBudgets();
    saveFixture('budgets', '/budgets', budgetsResponse);

    if (!budgetsResponse.budgets || budgetsResponse.budgets.length === 0) {
      console.error('No budgets found. Cannot proceed with other fixtures.');
      process.exit(1);
    }

    // Use the first budget (or default if available)
    const budget = budgetsResponse.default_budget || budgetsResponse.budgets[0];
    const budgetId = budget.id;
    console.log(`Using budget: ${budget.name} (${budgetId})\n`);

    // 2. Get accounts
    console.log('Fetching accounts...');
    const accountsResponse = await client.getAccounts(budgetId);
    saveFixture('accounts', `/budgets/${budgetId}/accounts`, accountsResponse);

    // 3. Get categories
    console.log('Fetching categories...');
    const categoriesResponse = await client.getCategories(budgetId);
    saveFixture('categories', `/budgets/${budgetId}/categories`, categoriesResponse);

    // 4. Get payees
    console.log('Fetching payees...');
    const payeesResponse = await client.getPayees(budgetId);
    saveFixture('payees', `/budgets/${budgetId}/payees`, payeesResponse);

    // 5. Get transactions (last 30 days to limit data)
    console.log('Fetching transactions (last 30 days)...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sinceDate = thirtyDaysAgo.toISOString().split('T')[0];

    const transactionsResponse = await client.getTransactions(budgetId, { sinceDate });
    saveFixture('transactions', `/budgets/${budgetId}/transactions?since_date=${sinceDate}`, transactionsResponse);

    // 6. Get scheduled transactions
    console.log('Fetching scheduled transactions...');
    const scheduledResponse = await client.getScheduledTransactions(budgetId);
    saveFixture('scheduled-transactions', `/budgets/${budgetId}/scheduled_transactions`, scheduledResponse);

    // 7. Get current month budget
    console.log('Fetching current month...');
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01'; // YYYY-MM-01
    const monthResponse = await client.getBudgetMonth(budgetId, currentMonth);
    saveFixture('month', `/budgets/${budgetId}/months/${currentMonth}`, monthResponse);

    console.log('\n✅ All fixtures recorded successfully!');
    console.log(`   Location: ${FIXTURES_DIR}`);

    // Summary
    console.log('\nRecorded data summary:');
    console.log(`  - Budgets: ${budgetsResponse.budgets.length}`);
    console.log(`  - Accounts: ${accountsResponse.accounts.length}`);
    console.log(`  - Category groups: ${categoriesResponse.category_groups.length}`);
    console.log(`  - Payees: ${payeesResponse.payees.length}`);
    console.log(`  - Transactions (30d): ${transactionsResponse.transactions.length}`);
    console.log(`  - Scheduled transactions: ${scheduledResponse.scheduled_transactions.length}`);

  } catch (error) {
    console.error('\n❌ Error recording fixtures:', error);
    process.exit(1);
  }
}

// Run the script
recordFixtures();
