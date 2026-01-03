import { z } from 'zod';
import { YnabTool } from '../base.js';
import { AllocationEngine, type DistributionMethod } from './AllocationEngine.js';
import { SpendingAnalyzer } from './SpendingAnalyzer.js';
import type { YnabCategoriesResponse, YnabTransactionsResponse, YnabBudgetMonthResponse } from '../../types/index.js';

/**
 * Input schema for the distribute to-be-budgeted tool
 */
const DistributeToBebudgetedInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to distribute funds in'),
  month: z.string().describe('The month to distribute funds for (ISO format: YYYY-MM-DD, typically first day of month)'),
  method: z.enum(['template', 'average', 'goals', 'custom']).default('custom')
    .describe('Distribution method: template (proportional to current budget), average (based on spending), goals (prioritize goals), custom (combined approach)'),
  emergency_fund_target: z.number().optional()
    .describe('Target emergency fund amount in milliunits (affects prioritization in custom method)'),
  max_allocation_per_category: z.number().optional()
    .describe('Maximum amount to allocate to any single category in milliunits'),
  prioritize_negative_balances: z.boolean().default(true)
    .describe('Prioritize categories with negative balances (overspent)'),
  include_hidden: z.boolean().default(false)
    .describe('Include hidden categories in distribution'),
  dry_run: z.boolean().default(false)
    .describe('If true, only show recommendations without making actual budget changes'),
  exclude_category_ids: z.array(z.string()).optional()
    .describe('Category IDs to exclude from distribution'),
});

type DistributeToBebudgetedInput = z.infer<typeof DistributeToBebudgetedInputSchema>;

/**
 * Tool for automatically distributing to-be-budgeted funds across categories
 * 
 * This tool distributes available budget funds using various strategies:
 * - Template method: Based on existing budget proportions
 * - Average method: Based on historical spending averages
 * - Goals method: Prioritize categories with defined goals
 * - Custom method: Combined approach considering goals, spending patterns, and priorities
 * 
 * Features include:
 * - Emergency fund prioritization
 * - Goal-based allocation with progress tracking  
 * - Negative balance handling (overspent categories)
 * - Maximum per-category limits
 * - Dry run mode for safe testing
 * - Detailed reasoning for each allocation
 */
export class DistributeToBebudgetedTool extends YnabTool {
  name = 'ynab_distribute_to_be_budgeted';
  description = 'Automatically distribute to-be-budgeted funds across categories using multiple allocation methods. Supports strategies including goal-based, template-based, and custom distribution.';
  inputSchema = DistributeToBebudgetedInputSchema;

  /**
   * Execute the distribute to-be-budgeted tool
   * 
   * @param args Input arguments including budget_id, month, and distribution parameters
   * @returns Distribution recommendations and execution results
   */
  async execute(args: unknown): Promise<{
    distribution_plan: Array<{
      category_id: string;
      category_name: string;
      current_budgeted: {
        milliunits: number;
        formatted: string;
      };
      current_balance: {
        milliunits: number;
        formatted: string;
      };
      recommended_addition: {
        milliunits: number;
        formatted: string;
      };
      new_total_budgeted: {
        milliunits: number;
        formatted: string;
      };
      priority: number;
      reasoning: string;
    }>;
    execution_summary: {
      method_used: string;
      total_to_be_budgeted: {
        milliunits: number;
        formatted: string;
      };
      total_distributed: {
        milliunits: number;
        formatted: string;
      };
      remaining_after_distribution: {
        milliunits: number;
        formatted: string;
      };
      categories_funded: number;
      was_executed: boolean;
      execution_errors?: string[];
    };
    budget_impact?: {
      categories_updated: number;
      server_knowledge: number;
    };
  }> {
    const input = this.validateArgs<DistributeToBebudgetedInput>(args);

    try {
      // Get current month budget data
      const budgetMonthResponse: YnabBudgetMonthResponse = await this.client.getBudgetMonth(
        input.budget_id,
        input.month
      );

      const toBeBudgeted = budgetMonthResponse.month.to_be_budgeted;
      
      if (toBeBudgeted <= 0) {
        return {
          distribution_plan: [],
          execution_summary: {
            method_used: input.method,
            total_to_be_budgeted: {
              milliunits: toBeBudgeted,
              formatted: this.formatCurrency(toBeBudgeted),
            },
            total_distributed: {
              milliunits: 0,
              formatted: this.formatCurrency(0),
            },
            remaining_after_distribution: {
              milliunits: toBeBudgeted,
              formatted: this.formatCurrency(toBeBudgeted),
            },
            categories_funded: 0,
            was_executed: false,
            execution_errors: ['No funds available to distribute (To Be Budgeted is zero or negative)'],
          },
        };
      }

      // Get categories
      const categoriesResponse: YnabCategoriesResponse = await this.client.getCategories(input.budget_id);
      
      // Use categories from the budget month response for current balances
      const monthCategories = budgetMonthResponse.month.categories;
      
      // Filter categories based on criteria
      let eligibleCategories = monthCategories.filter(cat => {
        if (cat.deleted) return false;
        if (!input.include_hidden && cat.hidden) return false;
        if (input.exclude_category_ids && input.exclude_category_ids.includes(cat.id)) return false;
        
        // If prioritizing negative balances, only include those or categories that need funding
        if (input.prioritize_negative_balances) {
          return cat.balance < 0 || (cat.goal_type && cat.goal_target && cat.balance < cat.goal_target);
        }
        
        return true;
      });

      // Get spending patterns for intelligent allocation
      let spendingPatterns;
      if (input.method === 'average' || input.method === 'custom') {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - 12);
        const sinceDate = cutoffDate.toISOString().split('T')[0];

        try {
          const transactionsResponse: YnabTransactionsResponse = await this.client.getTransactions(
            input.budget_id,
            sinceDate ? { sinceDate } : {}
          );

          const allCategories = categoriesResponse.category_groups.flatMap(group => group.categories);
          
          spendingPatterns = SpendingAnalyzer.analyzeSpendingPatterns(
            transactionsResponse.transactions,
            allCategories,
            undefined,
            12
          );
        } catch (error) {
          console.warn('Failed to get spending patterns, falling back to template method:', error);
          // Fall back to template method if we can't get transactions
          input.method = 'template' as any;
        }
      }

      // Generate distribution recommendations
      const recommendations = AllocationEngine.distributeAvailableFunds(
        eligibleCategories,
        toBeBudgeted,
        input.method as DistributionMethod,
        spendingPatterns,
        input.emergency_fund_target
      );

      // Apply max allocation limit if specified
      const limitedRecommendations = input.max_allocation_per_category
        ? recommendations.map(rec => ({
            ...rec,
            recommended_addition: Math.min(rec.recommended_addition, input.max_allocation_per_category!),
          }))
        : recommendations;

      // Calculate actual distributed amount
      const totalDistributed = limitedRecommendations.reduce(
        (sum, rec) => sum + rec.recommended_addition,
        0
      );

      // Format distribution plan
      const distributionPlan = limitedRecommendations
        .filter(rec => rec.recommended_addition > 0)
        .map(rec => ({
          category_id: rec.category_id,
          category_name: rec.category_name,
          current_budgeted: {
            milliunits: rec.current_budgeted,
            formatted: this.formatCurrency(rec.current_budgeted),
          },
          current_balance: {
            milliunits: eligibleCategories.find(c => c.id === rec.category_id)?.balance || 0,
            formatted: this.formatCurrency(eligibleCategories.find(c => c.id === rec.category_id)?.balance || 0),
          },
          recommended_addition: {
            milliunits: rec.recommended_addition,
            formatted: this.formatCurrency(rec.recommended_addition),
          },
          new_total_budgeted: {
            milliunits: rec.new_total_budgeted,
            formatted: this.formatCurrency(rec.new_total_budgeted),
          },
          priority: rec.priority,
          reasoning: rec.reasoning,
        }));

      const executionSummary = {
        method_used: input.method,
        total_to_be_budgeted: {
          milliunits: toBeBudgeted,
          formatted: this.formatCurrency(toBeBudgeted),
        },
        total_distributed: {
          milliunits: totalDistributed,
          formatted: this.formatCurrency(totalDistributed),
        },
        remaining_after_distribution: {
          milliunits: toBeBudgeted - totalDistributed,
          formatted: this.formatCurrency(toBeBudgeted - totalDistributed),
        },
        categories_funded: distributionPlan.length,
        was_executed: !input.dry_run,
        execution_errors: [] as string[],
      };

      let budgetImpact;

      // Execute the allocations if not in dry run mode
      if (!input.dry_run && distributionPlan.length > 0) {
        try {
          let categoriesUpdated = 0;
          let lastServerKnowledge = budgetMonthResponse.server_knowledge;

          // Update categories in batches to respect API limits
          for (const allocation of distributionPlan) {
            try {
              const currentCategory = eligibleCategories.find(c => c.id === allocation.category_id);
              if (currentCategory) {
                const newBudgetAmount = currentCategory.budgeted + allocation.recommended_addition.milliunits;
                
                const response = await this.client.updateCategoryBudget(
                  input.budget_id,
                  allocation.category_id,
                  input.month,
                  newBudgetAmount
                );
                
                lastServerKnowledge = response.server_knowledge;
                categoriesUpdated++;
                
                // Small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 100));
              }
            } catch (error) {
              const errorMsg = `Failed to update ${allocation.category_name}: ${error instanceof Error ? error.message : String(error)}`;
              executionSummary.execution_errors.push(errorMsg);
            }
          }

          budgetImpact = {
            categories_updated: categoriesUpdated,
            server_knowledge: lastServerKnowledge,
          };

          if (executionSummary.execution_errors.length > 0) {
            executionSummary.was_executed = false;
          }

        } catch (error) {
          executionSummary.execution_errors.push(
            `Batch update failed: ${error instanceof Error ? error.message : String(error)}`
          );
          executionSummary.was_executed = false;
        }
      }

      return {
        distribution_plan: distributionPlan,
        execution_summary: executionSummary,
        ...(budgetImpact && { budget_impact: budgetImpact }),
      };

    } catch (error) {
      this.handleError(error, 'distribute to-be-budgeted');
    }
  }
}