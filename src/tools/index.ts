import type { z } from 'zod';

// Export all tools from this directory
export * from './base.js';

// Import tool implementations
import { ListBudgetsTool } from './budgets/listBudgets.js';
import { GetAccountsTool } from './accounts/getAccounts.js';
import { GetTransactionsTool } from './transactions/getTransactions.js';
import { CreateTransactionTool } from './transactions/createTransaction.js';
import { UpdateTransactionTool } from './transactions/updateTransaction.js';
import { DeleteTransactionTool } from './transactions/deleteTransaction.js';
import { BatchUpdateTransactionsTool } from './transactions/batchUpdateTransactions.js';
import { CreateSplitTransactionTool } from './transactions/createSplitTransaction.js';
import { UpdateTransactionSplitsTool } from './transactions/updateTransactionSplits.js';
import { GetCategoriesTool } from './categories/getCategories.js';
import { GetCategoryTool } from './categories/getCategory.js';
import { UpdateCategoryBudgetTool } from './categories/updateCategoryBudget.js';
import { GetPayeesTool } from './payees/getPayees.js';
import { GetPayeeTool } from './payees/getPayee.js';
import { CreatePayeeTool } from './payees/createPayee.js';
import { LinkTransferTool } from './transfers/linkTransfer.js';
import { UnlinkTransferTool } from './transfers/unlinkTransfer.js';
import { GetBudgetMonthTool } from './months/getBudgetMonth.js';
import { ImportTransactionsTool } from './imports/importTransactions.js';
import { GetScheduledTransactionsTool } from './scheduled/getScheduledTransactions.js';
import { GetScheduledTransactionTool } from './scheduled/getScheduledTransaction.js';
import { CreateScheduledTransactionTool } from './scheduled/createScheduledTransaction.js';
import { UpdateScheduledTransactionTool } from './scheduled/updateScheduledTransaction.js';
import { DeleteScheduledTransactionTool } from './scheduled/deleteScheduledTransaction.js';
import { RecommendCategoryAllocationTool } from './analysis/recommendCategoryAllocation.js';
import { AnalyzeSpendingPatternsTool } from './analysis/analyzeSpendingPatterns.js';
import { DistributeToBebudgetedTool } from './analysis/distributeToBebudgeted.js';

import type { Tool } from '../types/index.js';
import type { YNABClient } from '../client/YNABClient.js';

/**
 * Registry of all available YNAB MCP tools
 */
export function registerTools(client: YNABClient): Tool[] {
  return [
    // Budget tools
    new ListBudgetsTool(client),
    
    // Account tools
    new GetAccountsTool(client),
    
    // Transaction tools
    new GetTransactionsTool(client),
    new CreateTransactionTool(client),
    new UpdateTransactionTool(client),
    new DeleteTransactionTool(client),
    new BatchUpdateTransactionsTool(client),
    new CreateSplitTransactionTool(client),
    new UpdateTransactionSplitsTool(client),
    
    // Category tools
    new GetCategoriesTool(client),
    new GetCategoryTool(client),
    new UpdateCategoryBudgetTool(client),
    
    // Payee tools
    new GetPayeesTool(client),
    new GetPayeeTool(client),
    new CreatePayeeTool(client),
    
    // Transfer tools
    new LinkTransferTool(client),
    new UnlinkTransferTool(client),
    
    // Budget month tools
    new GetBudgetMonthTool(client),
    
    // Import tools
    new ImportTransactionsTool(client),
    
    // Scheduled transaction tools
    new GetScheduledTransactionsTool(client),
    new GetScheduledTransactionTool(client),
    new CreateScheduledTransactionTool(client),
    new UpdateScheduledTransactionTool(client),
    new DeleteScheduledTransactionTool(client),
    
    // Analysis tools
    new RecommendCategoryAllocationTool(client),
    new AnalyzeSpendingPatternsTool(client),
    new DistributeToBebudgetedTool(client),
  ];
}

/**
 * Get a tool by name from the registry
 */
export function getToolByName(client: YNABClient, name: string): Tool | undefined {
  const tools = registerTools(client);
  return tools.find(tool => tool.name === name);
}

/**
 * Validate that all tools have unique names
 */
export function validateToolNames(client: YNABClient): void {
  const tools = registerTools(client);
  const names = tools.map(tool => tool.name);
  const uniqueNames = new Set(names);
  
  if (names.length !== uniqueNames.size) {
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    throw new Error(`Duplicate tool names found: ${duplicates.join(', ')}`);
  }
}

/**
 * Get tool metadata for documentation or debugging
 */
export function getToolMetadata(client: YNABClient): Array<{
  name: string;
  description: string;
  schema: z.ZodTypeAny;
}> {
  const tools = registerTools(client);
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    schema: tool.inputSchema,
  }));
}