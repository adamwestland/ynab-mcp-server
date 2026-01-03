import { z } from 'zod';
import { YnabTool } from '../base.js';
import { SpendingAnalyzer } from './SpendingAnalyzer.js';
import type { YnabCategoriesResponse, YnabTransactionsResponse } from '../../types/index.js';

/**
 * Input schema for the analyze spending patterns tool
 */
const AnalyzeSpendingPatternsInputSchema = z.object({
  budget_id: z.string().describe('The ID of the budget to analyze'),
  category_ids: z.array(z.string()).optional()
    .describe('Specific category IDs to analyze. If not provided, analyzes all categories with spending.'),
  analysis_months: z.number().int().min(3).max(36).default(12)
    .describe('Number of months of transaction history to analyze (minimum 3 for meaningful patterns)'),
  min_transactions: z.number().int().min(1).default(5)
    .describe('Minimum number of transactions required for a category to be analyzed'),
  include_seasonal: z.boolean().default(true)
    .describe('Whether to include seasonal pattern analysis'),
  sort_by: z.enum(['spending', 'predictability', 'frequency', 'variance']).default('spending')
    .describe('How to sort the results'),
});

type AnalyzeSpendingPatternsInput = z.infer<typeof AnalyzeSpendingPatternsInputSchema>;

/**
 * Tool for analyzing spending patterns across categories
 * 
 * This tool provides comprehensive analysis of spending behavior including:
 * - Statistical analysis (averages, medians, standard deviations)
 * - Frequency and timing patterns
 * - Predictability scoring based on variance
 * - Trend analysis (increasing, decreasing, stable)
 * - Seasonal pattern detection
 * - Spending irregularities and outliers
 * - Actionable recommendations for budgeting
 */
export class AnalyzeSpendingPatternsTool extends YnabTool {
  name = 'ynab_analyze_spending_patterns';
  description = 'Analyze historical spending patterns to understand category behavior, predictability, trends, and seasonal variations. Provides statistical insights and budgeting recommendations.';
  inputSchema = AnalyzeSpendingPatternsInputSchema;

  /**
   * Execute the analyze spending patterns tool
   * 
   * @param args Input arguments including budget_id and analysis parameters
   * @returns Comprehensive spending pattern analysis with insights and recommendations
   */
  async execute(args: unknown): Promise<{
    patterns: Array<{
      category_id: string;
      category_name: string;
      analysis_period: {
        start_date: string;
        end_date: string;
        months_analyzed: number;
      };
      spending_statistics: {
        total_spent: {
          milliunits: number;
          formatted: string;
        };
        monthly_average: {
          milliunits: number;
          formatted: string;
        };
        monthly_median: {
          milliunits: number;
          formatted: string;
        };
        monthly_range: {
          min: {
            milliunits: number;
            formatted: string;
          };
          max: {
            milliunits: number;
            formatted: string;
          };
        };
        standard_deviation: {
          milliunits: number;
          formatted: string;
        };
      };
      frequency_analysis: {
        transactions_count: number;
        average_transaction_size: {
          milliunits: number;
          formatted: string;
        };
        median_transaction_size: {
          milliunits: number;
          formatted: string;
        };
        days_with_spending: number;
        average_days_between_spending: number;
        spending_frequency: string;
      };
      predictability: {
        score: number;
        classification: string;
        coefficient_of_variation: number;
        trend: {
          direction: string;
          strength: number;
          description: string;
        };
        budgeting_approach: string;
      };
      seasonal_patterns?: Array<{
        month: number;
        month_name: string;
        average_spending: {
          milliunits: number;
          formatted: string;
        };
        variance_from_overall_average: number;
        seasonal_factor: number;
      }>;
      insights: {
        spending_behavior: string;
        budgeting_difficulty: string;
        risk_factors: string[];
        opportunities: string[];
      };
      recommendations: string[];
    }>;
    summary: {
      total_categories_analyzed: number;
      analysis_period: {
        months: number;
        start_date: string;
        end_date: string;
      };
      overall_insights: {
        most_predictable_categories: string[];
        most_variable_categories: string[];
        trending_up_categories: string[];
        trending_down_categories: string[];
        high_frequency_categories: string[];
        seasonal_categories: string[];
      };
      spending_overview: {
        total_analyzed_spending: {
          milliunits: number;
          formatted: string;
        };
        average_monthly_spending: {
          milliunits: number;
          formatted: string;
        };
        most_expensive_category: {
          name: string;
          monthly_average: {
            milliunits: number;
            formatted: string;
          };
        };
      };
    };
  }> {
    const input = this.validateArgs<AnalyzeSpendingPatternsInput>(args);

    try {
      // Get categories
      const categoriesResponse: YnabCategoriesResponse = await this.client.getCategories(input.budget_id);
      
      // Flatten categories from category groups
      const allCategories = categoriesResponse.category_groups.flatMap(group => group.categories);

      // Get transactions for analysis
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - input.analysis_months);
      const sinceDate = cutoffDate.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0];

      const transactionsResponse: YnabTransactionsResponse = await this.client.getTransactions(
        input.budget_id,
        sinceDate ? { sinceDate } : {}
      );

      // Analyze spending patterns
      const spendingPatterns = SpendingAnalyzer.analyzeSpendingPatterns(
        transactionsResponse.transactions,
        allCategories,
        input.category_ids,
        input.analysis_months
      );

      // Filter patterns by minimum transaction count
      const filteredPatterns = spendingPatterns.filter(
        pattern => pattern.frequency.transactions_count >= input.min_transactions
      );

      // Sort patterns based on input criteria
      const sortedPatterns = this.sortPatterns(filteredPatterns, input.sort_by);

      // Format patterns for output
      const formattedPatterns = sortedPatterns.map(pattern => {
        return {
          category_id: pattern.category_id,
          category_name: pattern.category_name,
          analysis_period: pattern.analysis_period,
          spending_statistics: {
            total_spent: {
              milliunits: pattern.spending_stats.total_spent,
              formatted: this.formatCurrency(pattern.spending_stats.total_spent),
            },
            monthly_average: {
              milliunits: pattern.spending_stats.average_monthly,
              formatted: this.formatCurrency(pattern.spending_stats.average_monthly),
            },
            monthly_median: {
              milliunits: pattern.spending_stats.median_monthly,
              formatted: this.formatCurrency(pattern.spending_stats.median_monthly),
            },
            monthly_range: {
              min: {
                milliunits: pattern.spending_stats.min_monthly,
                formatted: this.formatCurrency(pattern.spending_stats.min_monthly),
              },
              max: {
                milliunits: pattern.spending_stats.max_monthly,
                formatted: this.formatCurrency(pattern.spending_stats.max_monthly),
              },
            },
            standard_deviation: {
              milliunits: pattern.spending_stats.standard_deviation,
              formatted: this.formatCurrency(pattern.spending_stats.standard_deviation),
            },
          },
          frequency_analysis: {
            transactions_count: pattern.frequency.transactions_count,
            average_transaction_size: {
              milliunits: pattern.frequency.average_transaction_size,
              formatted: this.formatCurrency(pattern.frequency.average_transaction_size),
            },
            median_transaction_size: {
              milliunits: pattern.frequency.median_transaction_size,
              formatted: this.formatCurrency(pattern.frequency.median_transaction_size),
            },
            days_with_spending: pattern.frequency.days_with_spending,
            average_days_between_spending: pattern.frequency.average_days_between_spending,
            spending_frequency: this.classifyFrequency(pattern.frequency.average_days_between_spending),
          },
          predictability: {
            score: pattern.predictability.score,
            classification: pattern.predictability.classification.replace('_', ' '),
            coefficient_of_variation: pattern.predictability.coefficient_of_variation,
            trend: {
              direction: pattern.predictability.trend,
              strength: pattern.predictability.trend_strength,
              description: this.describeTrend(pattern.predictability.trend, pattern.predictability.trend_strength),
            },
            budgeting_approach: this.suggestBudgetingApproach(pattern.predictability),
          },
          seasonal_patterns: input.include_seasonal && pattern.seasonal_patterns ? 
            pattern.seasonal_patterns.map((seasonal: any) => ({
              month: seasonal.month,
              month_name: seasonal.month_name,
              average_spending: {
                milliunits: seasonal.average_spending,
                formatted: this.formatCurrency(seasonal.average_spending),
              },
              variance_from_overall_average: seasonal.variance_from_overall_average,
              seasonal_factor: Math.round((seasonal.average_spending / pattern.spending_stats.average_monthly) * 100) / 100,
            })) : undefined,
          insights: {
            spending_behavior: this.describeBehavior(pattern),
            budgeting_difficulty: this.assessBudgetingDifficulty(pattern),
            risk_factors: this.identifyRiskFactors(pattern),
            opportunities: this.identifyOpportunities(pattern),
          },
          recommendations: pattern.recommendations,
        };
      });

      // Generate summary insights
      const summary = this.generateSummary(
        filteredPatterns, 
        input.analysis_months, 
        sinceDate ?? new Date().toISOString().split('T')[0] ?? new Date(Date.now() - input.analysis_months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ?? '2024-01-01'
      );

      return {
        patterns: formattedPatterns,
        summary,
      };

    } catch (error) {
      this.handleError(error, 'analyze spending patterns');
    }
  }

  /**
   * Sort patterns based on criteria
   */
  private sortPatterns(patterns: any[], sortBy: string) {
    switch (sortBy) {
      case 'spending':
        return patterns.sort((a, b) => Math.abs(b.spending_stats.total_spent) - Math.abs(a.spending_stats.total_spent));
      case 'predictability':
        return patterns.sort((a, b) => b.predictability.score - a.predictability.score);
      case 'frequency':
        return patterns.sort((a, b) => a.frequency.average_days_between_spending - b.frequency.average_days_between_spending);
      case 'variance':
        return patterns.sort((a, b) => b.spending_stats.standard_deviation - a.spending_stats.standard_deviation);
      default:
        return patterns;
    }
  }

  /**
   * Classify spending frequency
   */
  private classifyFrequency(avgDaysBetween: number): string {
    if (avgDaysBetween <= 1) return 'Daily';
    if (avgDaysBetween <= 7) return 'Weekly';
    if (avgDaysBetween <= 14) return 'Bi-weekly';
    if (avgDaysBetween <= 31) return 'Monthly';
    if (avgDaysBetween <= 93) return 'Quarterly';
    return 'Infrequent';
  }

  /**
   * Describe trend direction and strength
   */
  private describeTrend(direction: string, strength: number): string {
    if (direction === 'stable') return 'Stable spending with minimal trend';
    
    const intensity = strength > 50 ? 'strongly' : strength > 20 ? 'moderately' : 'slightly';
    return `Spending is ${intensity} ${direction} by ${strength}% over time`;
  }

  /**
   * Suggest budgeting approach based on predictability
   */
  private suggestBudgetingApproach(predictability: any): string {
    if (predictability.score > 80) {
      return 'Fixed budget - very predictable spending';
    } else if (predictability.score > 60) {
      return 'Average-based budget with small buffer';
    } else if (predictability.score > 40) {
      return 'Average-based budget with moderate buffer';
    } else {
      return 'Maximum-based budget or sinking fund approach';
    }
  }

  /**
   * Describe spending behavior
   */
  private describeBehavior(pattern: any): string {
    const freq = pattern.frequency.average_days_between_spending;
    const pred = pattern.predictability.score;
    
    if (freq <= 7 && pred > 70) {
      return 'Regular, predictable spending - good for fixed budgeting';
    } else if (freq <= 7 && pred <= 70) {
      return 'Frequent but variable spending - requires careful monitoring';
    } else if (freq > 30 && pred > 70) {
      return 'Infrequent but predictable - good for sinking funds';
    } else {
      return 'Irregular spending pattern - challenging to budget for';
    }
  }

  /**
   * Assess budgeting difficulty
   */
  private assessBudgetingDifficulty(pattern: any): string {
    const score = pattern.predictability.score;
    
    if (score > 80) return 'Easy - highly predictable';
    if (score > 60) return 'Moderate - somewhat predictable';
    if (score > 40) return 'Challenging - variable spending';
    return 'Difficult - highly unpredictable';
  }

  /**
   * Identify risk factors
   */
  private identifyRiskFactors(pattern: any): string[] {
    const risks: string[] = [];
    
    if (pattern.predictability.score < 50) {
      risks.push('High spending variability makes budgeting difficult');
    }
    
    if (pattern.predictability.trend === 'increasing' && pattern.predictability.trend_strength > 25) {
      risks.push(`Spending is increasing by ${pattern.predictability.trend_strength}% - may exceed budget`);
    }
    
    if (pattern.spending_stats.max_monthly > pattern.spending_stats.average_monthly * 2) {
      risks.push('Occasional large expenses that could cause budget overruns');
    }
    
    if (pattern.frequency.average_days_between_spending > 60) {
      risks.push('Infrequent spending makes it easy to forget to budget for');
    }
    
    return risks;
  }

  /**
   * Identify opportunities
   */
  private identifyOpportunities(pattern: any): string[] {
    const opportunities: string[] = [];
    
    if (pattern.predictability.trend === 'decreasing' && pattern.predictability.trend_strength > 15) {
      opportunities.push(`Spending is decreasing - potential to reduce budget and reallocate funds`);
    }
    
    if (pattern.predictability.score > 80) {
      opportunities.push('High predictability allows for automated budgeting or scheduled transactions');
    }
    
    if (pattern.frequency.average_days_between_spending > 90) {
      opportunities.push('Infrequent expense - consider using targeted savings approach');
    }
    
    const seasonalHigh = pattern.seasonal_patterns?.[0];
    if (seasonalHigh && seasonalHigh.variance_from_overall_average > 30) {
      opportunities.push(`${seasonalHigh.month_name} spending is ${seasonalHigh.variance_from_overall_average}% higher - prepare by saving extra beforehand`);
    }
    
    return opportunities;
  }

  /**
   * Generate summary insights
   */
  private generateSummary(patterns: any[], months: number, startDate: string): any {
    const totalSpending = patterns.reduce((sum, p) => sum + Math.abs(p.spending_stats.total_spent), 0);
    const avgMonthlySpending = totalSpending / months;
    
    const mostExpensive = patterns.length > 0 ? patterns[0] : null;
    
    // Categorize patterns
    const predictable = patterns.filter(p => p.predictability.score > 70).map(p => p.category_name);
    const variable = patterns.filter(p => p.predictability.score < 40).map(p => p.category_name);
    const trendingUp = patterns.filter(p => p.predictability.trend === 'increasing' && p.predictability.trend_strength > 20).map(p => p.category_name);
    const trendingDown = patterns.filter(p => p.predictability.trend === 'decreasing' && p.predictability.trend_strength > 20).map(p => p.category_name);
    const highFreq = patterns.filter(p => p.frequency.average_days_between_spending < 7).map(p => p.category_name);
    const seasonal = patterns.filter(p => p.seasonal_patterns && p.seasonal_patterns.length > 0).map(p => p.category_name);

    return {
      total_categories_analyzed: patterns.length,
      analysis_period: {
        months,
        start_date: startDate,
        end_date: new Date().toISOString().split('T')[0],
      },
      overall_insights: {
        most_predictable_categories: predictable.slice(0, 5),
        most_variable_categories: variable.slice(0, 5),
        trending_up_categories: trendingUp.slice(0, 3),
        trending_down_categories: trendingDown.slice(0, 3),
        high_frequency_categories: highFreq.slice(0, 5),
        seasonal_categories: seasonal.slice(0, 3),
      },
      spending_overview: {
        total_analyzed_spending: {
          milliunits: -totalSpending,
          formatted: this.formatCurrency(-totalSpending),
        },
        average_monthly_spending: {
          milliunits: avgMonthlySpending,
          formatted: this.formatCurrency(avgMonthlySpending),
        },
        most_expensive_category: mostExpensive ? {
          name: mostExpensive.category_name,
          monthly_average: {
            milliunits: Math.abs(mostExpensive.spending_stats.average_monthly),
            formatted: this.formatCurrency(Math.abs(mostExpensive.spending_stats.average_monthly)),
          },
        } : { name: 'None', monthly_average: { milliunits: 0, formatted: '$0.00' }},
      },
    };
  }
}