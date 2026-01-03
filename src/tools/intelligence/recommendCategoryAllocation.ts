import { z } from 'zod';
import { YnabTool } from '../base.js';
import { AllocationEngine, type AllocationStrategy } from './AllocationEngine.js';
import type { YnabCategoriesResponse, YnabTransactionsResponse } from '../../types/index.js';

/**
 * Input schema for the recommend category allocation tool
 */
const RecommendCategoryAllocationInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to analyze'),
  strategy: z.enum(['proportional', 'goals_first', 'essential_first', 'balanced'])
    .default('balanced')
    .describe('Allocation strategy to use for recommendations'),
  analysis_months: z.number().int().min(1).max(24).default(12)
    .describe('Number of months of transaction history to analyze'),
  available_funds: z.number().optional()
    .describe('Amount of available funds to allocate (in milliunits). If not provided, uses theoretical recommendations.'),
  emergency_fund_target: z.number().optional()
    .describe('Target emergency fund amount in milliunits (affects priority of emergency categories)'),
  category_ids: z.array(z.string()).optional()
    .describe('Specific category IDs to analyze. If not provided, analyzes all categories.'),
  include_hidden: z.boolean().default(false)
    .describe('Whether to include hidden categories in analysis'),
});

type RecommendCategoryAllocationInput = z.infer<typeof RecommendCategoryAllocationInputSchema>;

/**
 * Tool for recommending category budget allocations based on spending patterns and goals
 * 
 * This tool provides intelligent budget allocation recommendations by:
 * - Analyzing historical spending patterns and trends
 * - Considering category goals and target dates
 * - Applying different allocation strategies (proportional, goals-first, etc.)
 * - Prioritizing essential vs discretionary spending
 * - Calculating confidence scores for recommendations
 * - Providing detailed reasoning for each recommendation
 */
export class RecommendCategoryAllocationTool extends YnabTool {
  name = 'ynab_recommend_category_allocation';
  description = 'Get intelligent budget allocation recommendations based on spending patterns, goals, and chosen strategy. Analyzes historical data to suggest optimal category budgets with confidence scores and detailed reasoning.';
  inputSchema = RecommendCategoryAllocationInputSchema;

  /**
   * Execute the recommend category allocation tool
   * 
   * @param args Input arguments including budget_id, strategy, and analysis parameters
   * @returns Detailed allocation recommendations with reasoning and confidence scores
   */
  async execute(args: unknown): Promise<{
    recommendations: Array<{
      category_id: string;
      category_name: string;
      current_budgeted: {
        milliunits: number;
        formatted: string;
      };
      recommended_amount: {
        milliunits: number;
        formatted: string;
      };
      allocation_difference: {
        milliunits: number;
        formatted: string;
        percentage_change: number;
      };
      priority: string;
      confidence: number;
      reasoning: string[];
      goal_info?: {
        goal_type: string;
        goal_target: {
          milliunits: number;
          formatted: string;
        };
        goal_target_month: string | null;
        monthly_funding_needed: {
          milliunits: number;
          formatted: string;
        };
        progress_percentage: number;
      };
      spending_pattern?: {
        monthly_average: {
          milliunits: number;
          formatted: string;
        };
        predictability_score: number;
        trend: string;
      };
    }>;
    summary: {
      strategy_used: string;
      total_categories_analyzed: number;
      analysis_period: {
        months: number;
        start_date: string;
        end_date: string;
      };
      total_current_budgeted: {
        milliunits: number;
        formatted: string;
      };
      total_recommended: {
        milliunits: number;
        formatted: string;
      };
      net_change: {
        milliunits: number;
        formatted: string;
      };
      priority_breakdown: {
        emergency: number;
        essential: number;
        important: number;
        discretionary: number;
      };
      average_confidence: number;
    };
    available_funds?: {
      provided: {
        milliunits: number;
        formatted: string;
      };
      after_recommendations: {
        milliunits: number;
        formatted: string;
      };
    };
  }> {
    const input = this.validateArgs<RecommendCategoryAllocationInput>(args);

    try {
      // Get categories
      const categoriesResponse: YnabCategoriesResponse = await this.client.getCategories(input.budget_id);
      
      // Flatten categories from category groups
      const allCategories = categoriesResponse.category_groups.flatMap(group => group.categories);
      
      // Filter categories based on input criteria
      let categories = allCategories.filter(cat => {
        if (!input.include_hidden && cat.hidden) return false;
        if (cat.deleted) return false;
        if (input.category_ids && !input.category_ids.includes(cat.id)) return false;
        return true;
      });

      // Get transactions for analysis
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - input.analysis_months);
      const sinceDate = cutoffDate.toISOString().split('T')[0];

      const transactionsResponse: YnabTransactionsResponse = await this.client.getTransactions(
        input.budget_id,
        sinceDate ? { sinceDate } : {}
      );

      // Generate recommendations using AllocationEngine
      const recommendations = AllocationEngine.recommendCategoryAllocations(
        categories,
        transactionsResponse.transactions,
        input.available_funds || 0,
        input.strategy as AllocationStrategy,
        input.emergency_fund_target
      );

      // Format recommendations for output
      const formattedRecommendations = recommendations.map(rec => {
        const percentageChange = rec.current_budgeted !== 0 
          ? ((rec.allocation_difference / Math.abs(rec.current_budgeted)) * 100)
          : 100; // If current budget is 0, any recommendation is 100% increase

        return {
          category_id: rec.category_id,
          category_name: rec.category_name,
          current_budgeted: {
            milliunits: rec.current_budgeted,
            formatted: this.formatCurrency(rec.current_budgeted),
          },
          recommended_amount: {
            milliunits: rec.recommended_amount,
            formatted: this.formatCurrency(rec.recommended_amount),
          },
          allocation_difference: {
            milliunits: rec.allocation_difference,
            formatted: this.formatCurrency(rec.allocation_difference),
            percentage_change: Math.round(percentageChange * 10) / 10,
          },
          priority: rec.priority,
          confidence: rec.confidence,
          reasoning: rec.reasoning,
          goal_info: rec.goal_info ? {
            goal_type: rec.goal_info.goal_type,
            goal_target: {
              milliunits: rec.goal_info.goal_target,
              formatted: this.formatCurrency(rec.goal_info.goal_target),
            },
            goal_target_month: rec.goal_info.goal_target_month,
            monthly_funding_needed: {
              milliunits: rec.goal_info.monthly_funding_needed,
              formatted: this.formatCurrency(rec.goal_info.monthly_funding_needed),
            },
            progress_percentage: rec.goal_info.progress_percentage,
          } : undefined,
          spending_pattern: rec.spending_pattern ? {
            monthly_average: {
              milliunits: rec.spending_pattern.monthly_average,
              formatted: this.formatCurrency(rec.spending_pattern.monthly_average),
            },
            predictability_score: rec.spending_pattern.predictability_score,
            trend: rec.spending_pattern.trend,
          } : undefined,
        };
      });

      // Calculate summary statistics
      const totalCurrentBudgeted = recommendations.reduce((sum, rec) => sum + rec.current_budgeted, 0);
      const totalRecommended = recommendations.reduce((sum, rec) => sum + rec.recommended_amount, 0);
      const netChange = totalRecommended - totalCurrentBudgeted;

      const priorityBreakdown = {
        emergency: recommendations.filter(r => r.priority === 'emergency').length,
        essential: recommendations.filter(r => r.priority === 'essential').length,
        important: recommendations.filter(r => r.priority === 'important').length,
        discretionary: recommendations.filter(r => r.priority === 'discretionary').length,
      };

      const averageConfidence = recommendations.length > 0
        ? Math.round(recommendations.reduce((sum, rec) => sum + rec.confidence, 0) / recommendations.length)
        : 0;

      const result: any = {
        recommendations: formattedRecommendations,
        summary: {
          strategy_used: input.strategy,
          total_categories_analyzed: recommendations.length,
          analysis_period: {
            months: input.analysis_months,
            start_date: sinceDate,
            end_date: new Date().toISOString().split('T')[0],
          },
          total_current_budgeted: {
            milliunits: totalCurrentBudgeted,
            formatted: this.formatCurrency(totalCurrentBudgeted),
          },
          total_recommended: {
            milliunits: totalRecommended,
            formatted: this.formatCurrency(totalRecommended),
          },
          net_change: {
            milliunits: netChange,
            formatted: this.formatCurrency(netChange),
          },
          priority_breakdown: priorityBreakdown,
          average_confidence: averageConfidence,
        },
      };

      // Add available funds information if provided
      if (input.available_funds !== undefined) {
        const afterRecommendations = input.available_funds - Math.max(0, netChange);
        result.available_funds = {
          provided: {
            milliunits: input.available_funds,
            formatted: this.formatCurrency(input.available_funds),
          },
          after_recommendations: {
            milliunits: afterRecommendations,
            formatted: this.formatCurrency(afterRecommendations),
          },
        };
      }

      return result;

    } catch (error) {
      this.handleError(error, 'recommend category allocation');
    }
  }
}